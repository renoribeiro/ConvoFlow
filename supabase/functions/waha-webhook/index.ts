import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { corsHeaders, DataSanitizer } from '../_shared/validation.ts'
import {
  checkRateLimitDb,
  getRateLimitIdentifier,
  getRateLimitHeaders,
  createRateLimitResponse,
  RATE_LIMIT_PRESETS
} from '../_shared/rateLimit.ts'

serve(async (req) => {
  const logger = createLogger(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Need Supabase client early for DB rate limiting
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return new Response(JSON.stringify({ error: 'Configuration Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Apply rate limiting
  const clientId = getRateLimitIdentifier(req);
  const rateLimitResult = await checkRateLimitDb(supabase, clientId, {
    ...RATE_LIMIT_PRESETS.webhook,
    keyPrefix: 'waha-webhook'
  });

  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { clientId, retryAfter: rateLimitResult.retryAfter });
    return createRateLimitResponse(
      rateLimitResult.retryAfter!,
      { ...corsHeaders, ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetAt, RATE_LIMIT_PRESETS.webhook.maxRequests) }
    );
  }

  try {

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const payload = await req.json();
    const sessionName = payload.session || payload.sessionId;

    if (!sessionName) {
      return new Response('Missing session', { status: 400 });
    }

    // Identify Instance
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, tenant_id')
      .eq('instance_key', sessionName)
      .single();

    if (!instance) {
      logger.error(`Instance not found: ${sessionName}`);
      return new Response('Instance not found', { status: 404 });
    }

    logger.info('Waha webhook received', { event: payload.event, session: sessionName });

    // Map WAHA session status → our `whatsapp_instances.status` vocabulary.
    // Ref: .agent/skills/waha/SKILL.md §2.1
    const mapWahaStatus = (raw?: string): string | null => {
      if (!raw) return null;
      const s = raw.toUpperCase();
      if (s === 'WORKING') return 'connected';
      if (s === 'SCAN_QR_CODE') return 'qrcode';
      if (s === 'STARTING') return 'connecting';
      if (s === 'STOPPED' || s === 'FAILED') return 'disconnected';
      return null;
    };

    if (payload.event === 'session.status' || payload.event === 'status') {
      const mapped = mapWahaStatus(
        payload.payload?.status || payload.status || payload.payload?.state,
      );
      if (mapped) {
        await supabase
          .from('whatsapp_instances')
          .update({ status: mapped, updated_at: new Date().toISOString() })
          .eq('id', instance.id);
        logger.info('Instance status synced from WAHA', { id: instance.id, status: mapped });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (payload.event === 'message') {
      const msg = payload.payload || {};
      if (msg.fromMe) return new Response('Skipped fromMe', { status: 200 });

      const fromRaw: string = typeof msg.from === 'string' ? msg.from : '';
      if (!fromRaw) {
        logger.warn('WAHA message without "from"', { id: msg.id });
        return new Response('Missing from', { status: 200 });
      }
      // WAHA usa "<numero>@c.us" para contatos e "<id>@g.us" para grupos.
      // Por enquanto ignoramos grupos para evitar inserir mensagens órfãs.
      if (fromRaw.endsWith('@g.us')) {
        return new Response('Skipped group message', { status: 200 });
      }
      const rawPhone = fromRaw.replace('@c.us', '');
      const phone = DataSanitizer.sanitizePhoneNumber(rawPhone);
      const content = msg.body || '';

      if (phone && content) {
        await supabase.rpc('process_incoming_message', {
          p_phone: phone,
          p_message_content: content,
          p_whatsapp_instance_id: instance.id,
          p_evolution_message_id: msg.id
        });
        logger.info('Message processed', { id: msg.id });
      }
    } else if (payload.event === 'message.ack' || payload.event === 'message.status') {
      const ackData = payload.payload;
      // Waha ack: 1=sent, 2=received, 3=read, 4=played
      // Waha status: sent, delivered, read, etc.

      let status = 'sent';
      let id = ackData.id;

      // Normalize Waha ID if it's an object or string
      if (typeof id === 'object' && id._serialized) id = id._serialized;

      if (ackData.ack) {
        if (ackData.ack >= 3) status = 'read';
        else if (ackData.ack === 2) status = 'delivered';
      } else if (ackData.status) {
        status = ackData.status.toLowerCase(); // 'read', 'delivered'
      }

      await supabase.from('messages')
        .update({ status: status, updated_at: new Date().toISOString() })
        .eq('evolution_message_id', id); // We store Waha ID in this column

      logger.info('Message status updated', { id, status });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    logger.error('Error processing Waha webhook', { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})