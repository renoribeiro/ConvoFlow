import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { 
  validatePhoneNumber, 
  validateInstanceName, 
  validateMessageContent,
  DataSanitizer,
  SecureError,
  createErrorResponse,
  corsHeaders
} from '../_shared/validation.ts'

interface WebhookEvent {
  event: 'messages.upsert' | 'connection.update' | 'presence.update' | 'qrcode.updated' | string;
  instance: string;
  data: any;
  server_url: string;
  apikey: string;
}

serve(async (req) => {
  const logger = createLogger(req);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    logger.info('Evolution webhook request received', {
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent')
    });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (req.method !== 'POST') {
      throw new SecureError('Method not allowed', 'METHOD_NOT_ALLOWED', 405)
    }

    // Validate Content-Type
    const contentType = req.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new SecureError('Invalid content type', 'INVALID_CONTENT_TYPE', 400)
    }

    // Parse and validate webhook event
    let webhookEvent: WebhookEvent
    try {
      webhookEvent = await req.json()
    } catch (error) {
      logger.error('Failed to parse webhook JSON', {}, error as Error)
      throw new SecureError('Invalid JSON payload', 'INVALID_JSON', 400)
    }

    // Validate required fields
    if (!webhookEvent.event || !webhookEvent.instance) {
      throw new SecureError('Missing required fields: event, instance', 'MISSING_FIELDS', 400)
    }

    // Validate instance name
    const instanceValidation = validateInstanceName(webhookEvent.instance)
    if (!instanceValidation.success) {
      throw new SecureError(instanceValidation.error!, 'INVALID_INSTANCE', 400)
    }

    logger.info('Processing webhook event', {
      event: webhookEvent.event,
      instance: webhookEvent.instance,
      hasData: !!webhookEvent.data
    })

    const { event: eventType, instance: instanceName, data: eventData } = webhookEvent

    // Handle different event types
    switch (eventType) {
      case 'messages.upsert':
        await processIncomingMessage(supabase, instanceName, eventData, logger)
        break
        
      case 'connection.update':
        await processConnectionUpdate(supabase, instanceName, eventData, logger)
        break
        
      case 'qrcode.updated':
        await processQRCodeUpdate(supabase, instanceName, eventData, logger)
        break
        
      case 'presence.update':
        console.log('Presence update received:', { instanceName, eventData })
        // Handle presence updates if needed
        break
        
      default:
        console.log(`Unhandled webhook event: ${eventType}`)
    }

    // Use the database function to handle webhook processing
    await supabase.rpc('handle_evolution_webhook', {
      instance_name: instanceName,
      event_type: eventType,
      event_data: eventData
    })

    logger.info('Webhook processed successfully', {
      event: eventType,
      instance: instanceName
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // Handle SecureError instances
    if (error instanceof SecureError) {
      logger.warn('Webhook validation error', {
        code: error.code,
        message: error.message
      }, error);
      return createErrorResponse(error, logger.getRequestId());
    }
    
    // Handle unexpected errors
    logger.error('Unexpected webhook processing error', {
      error: error.message,
      stack: error.stack
    }, error as Error);
    
    const secureError = new SecureError(
      'Internal server error', 
      'INTERNAL_ERROR', 
      500
    );
    
    return createErrorResponse(secureError, logger.getRequestId());
  }
})

async function processIncomingMessage(supabase: any, instanceName: string, messageData: any, logger: any) {
  const { key, message, messageTimestamp, pushName } = messageData
  
  if (key.fromMe) return // Ignore messages sent by us

  logger.debug('Processing incoming message', {
    hasKey: !!key,
    hasMessage: !!message,
    messageType: message?.messageType
  });
  
  if (!key?.id || !message?.conversation) {
    logger.warn('Skipping message: missing required fields', {
      hasKeyId: !!key?.id,
      hasConversation: !!message?.conversation
    });
    return
  }

  // Get WhatsApp instance from database
  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('id, tenant_id')
    .eq('instance_key', instanceName)
    .single()

  if (instanceError || !instance) {
    console.error(`WhatsApp instance not found: ${instanceName}`, instanceError)
    return
  }

  // Extract and validate message content
  const rawMessageContent = message.conversation || message.extendedTextMessage?.text || ''
  const rawPhone = key.remoteJid.replace('@s.whatsapp.net', '')

  // Validate phone number
  const phoneValidation = validatePhoneNumber(rawPhone)
  if (!phoneValidation.success) {
    logger.warn('Invalid phone number in message', {
      rawPhone: DataSanitizer.sanitizePhoneNumber(rawPhone),
      error: phoneValidation.error
    });
    return
  }
  
  const phone = phoneValidation.data!

  // Validate message content
  const contentValidation = validateMessageContent(rawMessageContent)
  if (!contentValidation.success) {
    logger.warn('Invalid message content', {
      phone: DataSanitizer.sanitizePhoneNumber(phone),
      error: contentValidation.error
    });
    return
  }
  
  const messageContent = contentValidation.data!

  logger.info('Processing valid message', {
    phone: DataSanitizer.sanitizePhoneNumber(phone),
    contentLength: messageContent.length,
    pushName: pushName || 'Unknown'
  })
  
  // Get or create contact
  logger.debug('Looking up contact', {
    phone: DataSanitizer.sanitizePhoneNumber(phone),
    tenantId: instance.tenant_id
  });
  
  let { data: contact, error: contactLookupError } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .eq('tenant_id', instance.tenant_id)
    .maybeSingle()

  if (contactLookupError) {
    logger.error('Failed to lookup contact', {
      phone: DataSanitizer.sanitizePhoneNumber(phone),
      tenantId: instance.tenant_id,
      error: contactLookupError.message
    }, contactLookupError);
    return
  }

  if (!contact) {
    logger.info('Creating new contact', {
      phone: DataSanitizer.sanitizePhoneNumber(phone),
      name: pushName || 'Unknown',
      tenantId: instance.tenant_id
    });
    
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        phone,
        name: pushName || phone,
        tenant_id: instance.tenant_id,
        whatsapp_instance_id: instance.id,
        last_interaction_at: new Date(messageTimestamp * 1000).toISOString(),
      })
      .select('id')
      .single()
    
    if (contactError) {
      logger.error('Failed to create contact', {
        phone: DataSanitizer.sanitizePhoneNumber(phone),
        tenantId: instance.tenant_id,
        error: contactError.message
      }, contactError);
      return
    }
    
    contact = newContact
    logger.info('Contact created successfully', {
      contactId: contact.id,
      phone: DataSanitizer.sanitizePhoneNumber(phone)
    });
  }

  if (!contact) {
    logger.error('Failed to create or get contact - contact is null');
    return
  }

  // Save message to database
  logger.debug('Saving message to database', {
    contactId: contact.id,
    messageLength: messageContent.length,
    evolutionMessageId: key.id
  });
  
  const { error: messageError } = await supabase.from('messages').insert({
    contact_id: contact.id,
    tenant_id: instance.tenant_id,
    whatsapp_instance_id: instance.id,
    direction: 'inbound',
    message_type: 'text',
    content: messageContent,
    evolution_message_id: key.id,
    status: 'received',
  })

  if (messageError) {
    logger.error('Failed to save message', {
      contactId: contact.id,
      evolutionMessageId: key.id,
      error: messageError.message
    }, messageError);
    return
  }

  logger.info('Message saved successfully', {
    contactId: contact.id,
    evolutionMessageId: key.id
  });

  // Update contact last interaction
  const { error: updateError } = await supabase
    .from('contacts')
    .update({
      last_interaction_at: new Date(messageTimestamp * 1000).toISOString(),
    })
    .eq('id', contact.id)

  if (updateError) {
    logger.warn('Failed to update contact last interaction', {
      contactId: contact.id,
      error: updateError.message
    }, updateError);
  }

  // Process chatbot triggers using our database function
  logger.debug('Processing chatbot triggers', {
    contactId: contact.id,
    phone: DataSanitizer.sanitizePhoneNumber(phone)
  });
  
  const { data: result, error: chatbotError } = await supabase
    .rpc('process_incoming_message', {
      p_phone: phone,
      p_message_content: messageContent,
      p_whatsapp_instance_id: instance.id,
      p_evolution_message_id: key.id
    });

  if (chatbotError) {
    logger.error('Chatbot processing error', {
      contactId: contact.id,
      phone: DataSanitizer.sanitizePhoneNumber(phone),
      error: chatbotError.message
    }, chatbotError);
  } else {
    logger.info('Chatbot processing completed', {
      contactId: contact.id,
      result: result ? 'success' : 'no_action'
    });
  }

  logger.info('Message processed successfully', {
    contactId: contact.id,
    phone: DataSanitizer.sanitizePhoneNumber(phone)
  });
}

async function processConnectionUpdate(supabase: any, instanceName: string, connectionData: any, logger: any) {
  const { state, qr } = connectionData

  logger.info('Processing connection update', {
    instance: instanceName,
    state: state,
    hasQr: !!qr
  });

  // Validate instance name
  const instanceValidation = validateInstanceName(instanceName);
  if (!instanceValidation.success) {
    logger.warn('Invalid instance name in connection update', {
      instanceName,
      error: instanceValidation.error
    });
    return;
  }

  const { error } = await supabase
    .from('whatsapp_instances')
    .update({
      status: state,
      qr_code: qr || null,
      last_connected_at: state === 'open' ? new Date().toISOString() : null,
    })
    .eq('instance_key', instanceName)

  if (error) {
    logger.error('Failed to update connection status', {
      instance: instanceName,
      state: state,
      error: error.message
    }, error);
  } else {
    logger.info('Connection status updated successfully', {
      instance: instanceName,
      state: state
    });
  }
}

async function processQRCodeUpdate(supabase: any, instanceName: string, qrData: any, logger: any) {
  const { qr } = qrData

  logger.info('Processing QR code update', {
    instance: instanceName,
    hasQr: !!qr
  });

  // Validate instance name
  const instanceValidation = validateInstanceName(instanceName);
  if (!instanceValidation.success) {
    logger.warn('Invalid instance name in QR code update', {
      instanceName,
      error: instanceValidation.error
    });
    return;
  }

  const { error } = await supabase
    .from('whatsapp_instances')
    .update({
      qr_code: qr,
      status: 'qrcode',
    })
    .eq('instance_key', instanceName)

  if (error) {
    logger.error('Failed to update QR code', {
      instance: instanceName,
      error: error.message
    }, error);
  } else {
    logger.info('QR code updated successfully', {
      instance: instanceName
    });
  }
}