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

    if (payload.event === 'message') {
      const msg = payload.payload;
      if (msg.fromMe) return new Response('Skipped fromMe', { status: 200 });

      const rawPhone = msg.from.replace('@c.us', '');
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