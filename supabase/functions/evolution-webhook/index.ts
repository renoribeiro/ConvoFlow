import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import {
  validatePhoneNumber,
  validateInstanceName,
  validateMessageContent,
  DataSanitizer,
  SecureError,
  corsHeaders
} from '../_shared/validation.ts'
import {
  WebhookEvent,
  MessageData,
  ConnectionUpdateData,
  QrCodeUpdateData,
  ContactData,
  ChatData,
  GroupData,
  PresenceData,
  EvolutionWebhookPayload
} from '../_shared/types.ts'
import {
  checkRateLimit,
  getRateLimitIdentifier,
  getRateLimitHeaders,
  createRateLimitResponse,
  RATE_LIMIT_PRESETS
} from '../_shared/rateLimit.ts'

serve(async (req) => {
  const logger = createLogger(req);
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Apply rate limiting
  const clientId = getRateLimitIdentifier(req);
  const rateLimitResult = checkRateLimit(clientId, {
    ...RATE_LIMIT_PRESETS.webhook,
    keyPrefix: 'evolution-webhook'
  });

  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { clientId, retryAfter: rateLimitResult.retryAfter });
    return createRateLimitResponse(
      rateLimitResult.retryAfter!,
      { ...corsHeaders, ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetAt, RATE_LIMIT_PRESETS.webhook.maxRequests) }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('Missing Supabase configuration');
      throw new SecureError('Configuration Error', 'CONFIG_ERROR', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (req.method !== 'POST') {
      throw new SecureError('Method not allowed', 'METHOD_NOT_ALLOWED', 405)
    }

    const contentType = req.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new SecureError('Invalid content type', 'INVALID_CONTENT_TYPE', 400)
    }

    let webhookEvent: EvolutionWebhookPayload
    try {
      webhookEvent = await req.json()
    } catch (error) {
      logger.error('Failed to parse webhook JSON', {}, error as Error)
      throw new SecureError('Invalid JSON payload', 'INVALID_JSON', 400)
    }

    if (!webhookEvent.event || !webhookEvent.instance) {
      throw new SecureError('Missing required fields: event, instance', 'MISSING_FIELDS', 400)
    }

    const { event: eventType, instance: instanceName, data: eventData, sender, apikey: webhookApiKey } = webhookEvent

    // Security Check: Verify the instance exists in our DB
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, tenant_id, instance_key')
      .eq('instance_key', instanceName)
      .single()

    if (instanceError || !instance) {
      logger.warn(`Webhook received for unknown instance: ${instanceName}`)
      return new Response(JSON.stringify({ success: false, error: 'Instance not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    logger.info('Processing webhook event', {
      event: eventType,
      instance: instanceName,
      tenantId: instance.tenant_id,
      hasSender: !!sender,
      hasData: !!eventData
    })

    // Handle all Evolution API V2 event types
    switch (eventType) {
      case 'messages.upsert':
        await processIncomingMessage(supabase, instance, instanceName, eventData as MessageData, sender, logger)
        break

      case 'messages.update':
        await processMessageUpdate(supabase, instanceName, eventData, logger)
        break

      case 'messages.delete':
        await processMessageDelete(supabase, instanceName, eventData, logger)
        break

      case 'send.message':
        await processSentMessage(supabase, instance, instanceName, eventData as MessageData, logger)
        break

      case 'connection.update':
        await processConnectionUpdate(supabase, instanceName, eventData as ConnectionUpdateData, logger)
        break

      case 'qrcode.updated':
        await processQRCodeUpdate(supabase, instanceName, eventData as QrCodeUpdateData, logger)
        break

      case 'contacts.set':
      case 'contacts.upsert':
      case 'contacts.update':
        await processContactEvent(supabase, instance, instanceName, eventType, eventData, logger)
        break

      case 'chats.set':
      case 'chats.upsert':
      case 'chats.update':
      case 'chats.delete':
        await processChatEvent(supabase, instance, instanceName, eventType, eventData, logger)
        break

      case 'groups.upsert':
      case 'groups.update':
        await processGroupEvent(supabase, instance, instanceName, eventType, eventData, logger)
        break

      case 'group.participants.update':
        await processGroupParticipantsUpdate(supabase, instance, instanceName, eventData, logger)
        break

      case 'presence.update':
        await processPresenceUpdate(supabase, instanceName, eventData, logger)
        break

      case 'call':
        logger.info('Call event received', { instanceName, data: eventData })
        break

      case 'application.startup':
        logger.info('Application startup event', { instanceName })
        break

      default:
        logger.info(`Received event: ${eventType}`, { instanceName })
    }

    // Forward event to RPC for custom business logic (only if exists)
    try {
      await supabase.rpc('handle_evolution_webhook', {
        instance_name: instanceName,
        event_type: eventType,
        event_data: eventData
      })
    } catch (rpcError: any) {
      // Don't fail the webhook if RPC doesn't exist or fails
      logger.warn('RPC handle_evolution_webhook failed (might not exist)', { error: rpcError.message })
    }

    const processingTime = Date.now() - startTime;
    const responseBody = {
      success: true,
      processed_at: new Date().toISOString(),
      processing_time_ms: processingTime,
      event: eventType
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    logger.error('Error processing webhook', { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

// ============================================
// Message Handlers
// ============================================

async function processIncomingMessage(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string; instance_key: string },
  instanceName: string,
  messageData: MessageData,
  sender: string | undefined,
  logger: any
) {
  const { key, message, messageTimestamp, pushName } = messageData

  if (key.fromMe) return

  if (!key?.id) return

  // Determine message content and type
  const { content: rawMessageContent, messageType } = extractMessageContent(message)

  // Handle LID resolution: Use sender field to resolve real phone numbers
  // In V2, remoteJid can be a LID (Link ID) instead of the real phone number
  let rawPhone: string;
  if (sender && !sender.includes('@lid')) {
    // Use sender field if it's a real phone number
    rawPhone = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
  } else {
    rawPhone = key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }

  const phone = DataSanitizer.sanitizePhoneNumber(rawPhone)
  if (!phone) return;

  // Check if it's a group message
  const isGroup = key.remoteJid.includes('@g.us');
  if (isGroup) {
    // For group messages, we can log but skip contact creation for now
    logger.info('Group message received', { group: key.remoteJid, messageType })
    return;
  }

  // Find or Create Contact
  let { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .eq('tenant_id', instance.tenant_id)
    .maybeSingle()

  if (!contact) {
    const { data: newContact } = await supabase.from('contacts').insert({
      phone,
      name: pushName || phone,
      tenant_id: instance.tenant_id,
      whatsapp_instance_id: instance.id
    }).select('id').single();
    contact = newContact;
  }

  if (!contact) return;

  // Save message to database
  await supabase.from('messages').insert({
    contact_id: contact.id,
    tenant_id: instance.tenant_id,
    whatsapp_instance_id: instance.id,
    direction: 'inbound',
    message_type: messageType,
    content: rawMessageContent,
    evolution_message_id: key.id,
    status: 'received',
  })

  // Trigger automation via RPC
  try {
    await supabase.rpc('process_incoming_message', {
      p_phone: phone,
      p_message_content: rawMessageContent,
      p_whatsapp_instance_id: instance.id,
      p_evolution_message_id: key.id
    });
  } catch (error: any) {
    logger.warn('RPC process_incoming_message not available', { error: error.message });
  }
}

/**
 * Extract text content and determine type from various message formats
 */
function extractMessageContent(message: any): { content: string; messageType: string } {
  if (message.conversation) {
    return { content: message.conversation, messageType: 'text' };
  }
  if (message.extendedTextMessage?.text) {
    return { content: message.extendedTextMessage.text, messageType: 'text' };
  }
  if (message.imageMessage) {
    return { content: message.imageMessage.caption || '[Imagem]', messageType: 'image' };
  }
  if (message.videoMessage) {
    return { content: message.videoMessage.caption || '[Vídeo]', messageType: 'video' };
  }
  if (message.audioMessage) {
    return { content: message.audioMessage.ptt ? '[Áudio]' : '[Arquivo de Áudio]', messageType: 'audio' };
  }
  if (message.documentMessage) {
    return { content: message.documentMessage.fileName || message.documentMessage.title || '[Documento]', messageType: 'document' };
  }
  if (message.locationMessage) {
    const loc = message.locationMessage;
    return { content: loc.name || `Lat: ${loc.degreesLatitude}, Lng: ${loc.degreesLongitude}`, messageType: 'location' };
  }
  if (message.contactMessage) {
    return { content: message.contactMessage.displayName || '[Contato]', messageType: 'contact' };
  }
  if (message.stickerMessage) {
    return { content: '[Figurinha]', messageType: 'sticker' };
  }
  if (message.reactionMessage) {
    return { content: message.reactionMessage.text || '', messageType: 'reaction' };
  }
  if (message.buttonsResponseMessage) {
    return { content: message.buttonsResponseMessage.selectedDisplayText || '', messageType: 'buttons_response' };
  }
  if (message.listResponseMessage) {
    return { content: message.listResponseMessage.title || '', messageType: 'list_response' };
  }
  if (message.protocolMessage) {
    return { content: '', messageType: 'protocol' };
  }
  return { content: '[Mensagem não suportada]', messageType: 'unknown' };
}

async function processMessageUpdate(supabase: SupabaseClient, instanceName: string, updateData: any, logger: any) {
  const updates = Array.isArray(updateData) ? updateData : [updateData];

  for (const updateItem of updates) {
    const { key, update } = updateItem;
    if (!key?.id) continue;

    let status = 'sent';
    if (update?.status) {
      switch (update.status) {
        case 'SERVER_ACK': status = 'sent'; break;
        case 'DELIVERY_ACK': status = 'delivered'; break;
        case 'READ': status = 'read'; break;
        case 'PLAYED': status = 'read'; break;
        case 'ERROR': status = 'failed'; break;
        default: status = 'sent';
      }
    }

    await supabase.from('messages')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('evolution_message_id', key.id);

    logger.info('Updated message status', { id: key.id, status });
  }
}

async function processMessageDelete(supabase: SupabaseClient, instanceName: string, deleteData: any, logger: any) {
  const key = deleteData?.key || deleteData;
  if (!key?.id) {
    logger.warn('messages.delete event missing key.id', { instanceName });
    return;
  }

  await supabase.from('messages')
    .update({
      status: 'deleted',
      content: '[Mensagem apagada]',
      updated_at: new Date().toISOString()
    })
    .eq('evolution_message_id', key.id);

  logger.info('Message marked as deleted', { id: key.id, instanceName });
}

async function processSentMessage(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string; instance_key: string },
  instanceName: string,
  messageData: MessageData,
  logger: any
) {
  const { key, message, messageTimestamp } = messageData;

  if (!key?.id || !key.fromMe) return;

  const { content, messageType } = extractMessageContent(message);
  const rawPhone = key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  const phone = DataSanitizer.sanitizePhoneNumber(rawPhone);

  if (!phone) return;

  // Find the contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .eq('tenant_id', instance.tenant_id)
    .maybeSingle();

  if (!contact) return;

  // Check if message already exists (avoid duplicates)
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('evolution_message_id', key.id)
    .maybeSingle();

  if (existingMsg) return;

  await supabase.from('messages').insert({
    contact_id: contact.id,
    tenant_id: instance.tenant_id,
    whatsapp_instance_id: instance.id,
    direction: 'outbound',
    message_type: messageType,
    content,
    evolution_message_id: key.id,
    status: 'sent',
  });

  logger.info('Sent message recorded', { id: key.id, messageType });
}

// ============================================
// Connection & QR Code Handlers
// ============================================

async function processConnectionUpdate(supabase: SupabaseClient, instanceName: string, connectionData: ConnectionUpdateData, logger: any) {
  const { state, statusReason } = connectionData

  logger.info('Processing connection update', { instance: instanceName, state, statusReason });

  const updatePayload: Record<string, any> = {
    status: state,
    updated_at: new Date().toISOString(),
  };

  if (state === 'open') {
    updatePayload.last_connected_at = new Date().toISOString();
    updatePayload.qr_code = null; // Clear QR code when connected
  } else if (state === 'close') {
    updatePayload.qr_code = null;
  }

  await supabase
    .from('whatsapp_instances')
    .update(updatePayload)
    .eq('instance_key', instanceName)
}

async function processQRCodeUpdate(supabase: SupabaseClient, instanceName: string, qrData: QrCodeUpdateData, logger: any) {
  // V2 sends QR code in different formats
  const qrCode = qrData?.qrcode?.base64 || qrData?.qrcode?.code || qrData?.qr || null;

  await supabase
    .from('whatsapp_instances')
    .update({ qr_code: qrCode, status: 'qrcode', updated_at: new Date().toISOString() })
    .eq('instance_key', instanceName)

  logger.info('QR Code updated', { instanceName, hasQr: !!qrCode });
}

// ============================================
// Contact & Chat & Group Handlers
// ============================================

async function processContactEvent(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventType: string,
  contactData: any,
  logger: any
) {
  const contacts = Array.isArray(contactData) ? contactData : [contactData];

  for (const contact of contacts) {
    if (!contact?.id) continue;

    const phone = contact.id.replace('@s.whatsapp.net', '').replace('@c.us', '');
    if (!phone || phone.includes('@g.us')) continue;

    const sanitizedPhone = DataSanitizer.sanitizePhoneNumber(phone);
    if (!sanitizedPhone) continue;

    // Upsert the contact
    const { error } = await supabase
      .from('contacts')
      .upsert({
        phone: sanitizedPhone,
        name: contact.name || contact.pushName || sanitizedPhone,
        tenant_id: instance.tenant_id,
        whatsapp_instance_id: instance.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'phone,tenant_id' });

    if (error) {
      logger.warn('Failed to upsert contact', { phone: sanitizedPhone, error: error.message });
    }
  }

  logger.info(`Processed ${eventType}`, { instanceName, count: contacts.length });
}

async function processChatEvent(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventType: string,
  chatData: any,
  logger: any
) {
  // Chat events are informational - log for monitoring
  const chats = Array.isArray(chatData) ? chatData : [chatData];
  logger.info(`Chat event ${eventType}`, { instanceName, count: chats.length });
}

async function processGroupEvent(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventType: string,
  groupData: any,
  logger: any
) {
  if (!groupData?.id) {
    logger.warn('Group event missing group ID', { instanceName, eventType });
    return;
  }

  logger.info(`Group event ${eventType}`, {
    instanceName,
    groupId: groupData.id,
    subject: groupData.subject
  });
}

async function processGroupParticipantsUpdate(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventData: any,
  logger: any
) {
  logger.info('Group participants updated', {
    instanceName,
    action: eventData?.action,
    participants: eventData?.participants?.length || 0
  });
}

async function processPresenceUpdate(
  supabase: SupabaseClient,
  instanceName: string,
  presenceData: any,
  logger: any
) {
  // Presence updates are frequent - only log at debug level
  logger.info('Presence update received', {
    instanceName,
    id: presenceData?.id,
    presences: presenceData?.presences ? Object.keys(presenceData.presences) : []
  });
}