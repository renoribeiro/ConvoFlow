import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { corsHeaders, DataSanitizer } from '../_shared/validation.ts';
import { verifyMetaSignature } from '../_shared/cryptoSignature.ts';
import {
  checkRateLimitDb,
  getRateLimitIdentifier,
  getRateLimitHeaders,
  createRateLimitResponse,
  RATE_LIMIT_PRESETS,
} from '../_shared/rateLimit.ts';

/**
 * Meta Cloud API webhook receiver.
 *
 * - GET  /functions/v1/meta-webhook   -> verification handshake
 * - POST /functions/v1/meta-webhook   -> incoming messages and delivery statuses
 *
 * The verify_token used for the GET handshake is global (per Supabase project) and
 * configured via the META_GLOBAL_VERIFY_TOKEN secret. The same token must be set
 * on the Meta App Webhook configuration in the Developer Console.
 */
serve(async (req) => {
  const logger = createLogger(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const verifyTokenEnv = Deno.env.get('META_GLOBAL_VERIFY_TOKEN');
  const appSecret = Deno.env.get('META_APP_SECRET');

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return new Response(JSON.stringify({ error: 'Configuration Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // GET = verification handshake
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (!verifyTokenEnv) {
      logger.error('META_GLOBAL_VERIFY_TOKEN is not configured');
      return new Response('Server misconfigured', { status: 500 });
    }

    if (mode === 'subscribe' && token === verifyTokenEnv && challenge) {
      logger.info('Meta webhook verified');
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    logger.warn('Meta webhook verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Rate limiting (only on POST events)
  const clientId = getRateLimitIdentifier(req);
  const rateLimitResult = await checkRateLimitDb(supabase, clientId, {
    ...RATE_LIMIT_PRESETS.webhook,
    keyPrefix: 'meta-webhook',
  });
  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { clientId, retryAfter: rateLimitResult.retryAfter });
    return createRateLimitResponse(
      rateLimitResult.retryAfter!,
      { ...corsHeaders, ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetAt, RATE_LIMIT_PRESETS.webhook.maxRequests) },
    );
  }

  try {
    // Read the raw body BEFORE parsing so we can verify the HMAC against the
    // exact bytes Meta signed. JSON.parse must run on the same string.
    const rawBody = await req.text();

    if (!appSecret) {
      logger.error('META_APP_SECRET is not configured');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const signatureHeader = req.headers.get('x-hub-signature-256');
    const signatureValid = await verifyMetaSignature(rawBody, signatureHeader, appSecret);
    if (!signatureValid) {
      // Logging detalhado para diagnóstico — quando aparecem 401s recorrentes,
      // estes campos identificam a fonte:
      // - userAgent: distingue Meta (facebookplatform/...) de bots/scanners
      // - sourceIp: identifica origem (Meta vs. outro lugar)
      // - bodyAppId: identifica QUAL Meta App está enviando (apps diferentes
      //   têm secrets diferentes — útil quando há mais de um app apontando
      //   pra esta URL)
      let bodyAppId: string | undefined;
      try {
        const peek = JSON.parse(rawBody);
        bodyAppId = peek?.entry?.[0]?.id;
      } catch {
        // body não é JSON válido — provavelmente scanner ou request malformado
      }
      logger.warn('Invalid Meta webhook signature', {
        hasHeader: !!signatureHeader,
        userAgent: req.headers.get('user-agent'),
        sourceIp:
          req.headers.get('cf-connecting-ip') ||
          req.headers.get('x-real-ip') ||
          req.headers.get('x-forwarded-for'),
        bodyAppId,
        bodyLength: rawBody.length,
      });
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn('Meta webhook body is not valid JSON');
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (payload.object !== 'whatsapp_business_account') {
      logger.warn('Unexpected webhook object', { object: payload.object });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const entries: any[] = Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value || {};
        const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
        if (!phoneNumberId) {
          logger.warn('Missing phone_number_id in webhook payload');
          continue;
        }

        // Resolve instance via provider + connection_config.phoneNumberId
        const { data: instance, error: instanceError } = await supabase
          .from('whatsapp_instances')
          .select('id, tenant_id')
          .eq('provider', 'official')
          .filter('connection_config->>phoneNumberId', 'eq', phoneNumberId)
          .single();

        if (instanceError || !instance) {
          logger.warn('Meta instance not found', { phoneNumberId });
          continue;
        }

        // Incoming messages
        const messages: any[] = Array.isArray(value.messages) ? value.messages : [];
        for (const msg of messages) {
          await handleIncomingMessage(supabase, instance, msg, logger);
        }

        // Delivery / read statuses
        const statuses: any[] = Array.isArray(value.statuses) ? value.statuses : [];
        for (const status of statuses) {
          await handleStatusUpdate(supabase, status, logger);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    logger.error('Error processing Meta webhook', { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

async function handleIncomingMessage(
  supabase: ReturnType<typeof createClient>,
  instance: { id: string; tenant_id: string },
  msg: any,
  logger: ReturnType<typeof createLogger>,
) {
  const rawPhone: string = msg.from || '';
  const phone = DataSanitizer.sanitizePhoneNumber(rawPhone);
  if (!phone) return;

  const content = extractMessageContent(msg);
  const messageId: string | undefined = msg.id;

  if (!content || !messageId) {
    logger.info('Skipping Meta message without text content', { type: msg.type });
    return;
  }

  // Webhooks are at-least-once. Drop duplicates before invoking the RPC so we
  // don't double-fire downstream automations on the same wamid.
  const { data: existing, error: dedupError } = await supabase
    .from('messages')
    .select('id')
    .eq('evolution_message_id', messageId)
    .limit(1)
    .maybeSingle();

  if (dedupError) {
    logger.warn('Meta dedup lookup failed, proceeding anyway', { error: dedupError.message });
  } else if (existing) {
    logger.info('Meta message already processed, skipping', { id: messageId });
    return;
  }

  await supabase.rpc('process_incoming_message', {
    p_phone: phone,
    p_message_content: content,
    p_whatsapp_instance_id: instance.id,
    p_evolution_message_id: messageId,
  });

  logger.info('Meta message processed', { id: messageId, type: msg.type });
}

async function handleStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  status: any,
  logger: ReturnType<typeof createLogger>,
) {
  const messageId: string | undefined = status.id;
  const metaStatus: string | undefined = status.status;
  if (!messageId || !metaStatus) return;

  // Meta status values: sent, delivered, read, failed
  const normalized = metaStatus.toLowerCase();

  await supabase
    .from('messages')
    .update({ status: normalized, updated_at: new Date().toISOString() })
    .eq('evolution_message_id', messageId);

  logger.info('Meta message status updated', { id: messageId, status: normalized });
}

function extractMessageContent(msg: any): string {
  switch (msg.type) {
    case 'text':
      return msg.text?.body || '';
    case 'button':
      return msg.button?.text || '';
    case 'interactive': {
      const i = msg.interactive || {};
      return i.button_reply?.title || i.list_reply?.title || '';
    }
    case 'image':
      return `[Imagem]${msg.image?.caption ? ` ${msg.image.caption}` : ''}`;
    case 'video':
      return `[Vídeo]${msg.video?.caption ? ` ${msg.video.caption}` : ''}`;
    case 'audio':
      return '[Áudio]';
    case 'document':
      return `[Documento]${msg.document?.filename ? ` ${msg.document.filename}` : ''}`;
    case 'location':
      return '[Localização]';
    case 'sticker':
      return '[Sticker]';
    case 'reaction':
      return msg.reaction?.emoji || '';
    default:
      return '';
  }
}
