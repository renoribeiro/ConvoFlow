import { supabase } from '../../src/integrations/supabase/client';
import { logger } from '../../src/lib/logger';
import type { WebhookEvent as EvolutionWebhookEvent } from '../../src/types/evolution.types';

// Tipos para Request e Response do Vercel
interface VercelRequest {
  method?: string;
  body: any;
  query: { [key: string]: string | string[] };
  headers: { [key: string]: string };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  end: () => void;
}

// Interface para mensagens
interface MessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  pushName?: string;
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
      contextInfo?: any;
    };
    imageMessage?: {
      caption?: string;
      mimetype: string;
      url: string;
    };
    videoMessage?: {
      caption?: string;
      mimetype: string;
      url: string;
    };
    audioMessage?: {
      mimetype: string;
      url: string;
    };
    documentMessage?: {
      title?: string;
      fileName?: string;
      mimetype: string;
      url: string;
    };
    locationMessage?: {
      degreesLatitude: number;
      degreesLongitude: number;
      name?: string;
      address?: string;
    };
    contactMessage?: {
      displayName: string;
      vcard: string;
    };
    reactionMessage?: {
      text: string;
      senderTimestampMs: string;
    };
  };
  messageTimestamp: number;
  status?: 'ERROR' | 'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'PLAYED';
}

// Util: limpeza básica de texto
function sanitizeText(text: string): string {
  return text?.toString().slice(0, 4000).trim() || '';
}

// Função para extrair texto da mensagem
function extractMessageText(message: any): string {
  if (message.conversation) {
    return sanitizeText(message.conversation);
  }
  if (message.extendedTextMessage?.text) {
    return sanitizeText(message.extendedTextMessage.text);
  }
  if (message.imageMessage?.caption) {
    return sanitizeText(message.imageMessage.caption);
  }
  if (message.videoMessage?.caption) {
    return sanitizeText(message.videoMessage.caption);
  }
  if (message.documentMessage?.title) {
    return sanitizeText(message.documentMessage.title);
  }
  if (message.contactMessage?.displayName) {
    return sanitizeText(`Contato: ${message.contactMessage.displayName}`);
  }
  if (message.locationMessage) {
    return sanitizeText(`Localização: ${message.locationMessage.name || 'Sem nome'}`);
  }
  if (message.reactionMessage) {
    return sanitizeText(`Reação: ${message.reactionMessage.text}`);
  }
  return '';
}

// Função para determinar o tipo da mensagem
function getMessageType(message: any): string {
  if (message.conversation || message.extendedTextMessage) return 'text';
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  if (message.contactMessage) return 'contact';
  if (message.locationMessage) return 'location';
  if (message.reactionMessage) return 'reaction';
  return 'unknown';
}

// Função para extrair número de telefone do JID
function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0].replace(/\D/g, '');
}

// Helper: comparação em tempo constante
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Verifica assinatura HMAC (corpo bruto + segredo)
async function verifySignature(rawBody: string, signatureHeader?: string): Promise<boolean> {
  const secret = process.env.VITE_EVOLUTION_WEBHOOK_SECRET || process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) return true; // se não configurado, não bloqueia em dev
  if (!signatureHeader) return false;
  try {
    const crypto = await import('node:crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody, 'utf8');
    const expected = `sha256=${hmac.digest('hex')}`;
    return constantTimeEqual(expected, signatureHeader);
  } catch (e) {
    logger.error('Erro ao verificar assinatura HMAC', e);
    return false;
  }
}

// Checar idempotência pela coluna evolution_message_id
async function isDuplicateMessage(evolutionMessageId: string): Promise<boolean> {
  if (!evolutionMessageId) return false;
  const { data, error } = await supabase
    .from('messages')
    .select('id')
    .eq('evolution_message_id', evolutionMessageId)
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error('Erro ao checar idempotência', error);
    return false;
  }
  return !!data;
}

// Função para processar mensagens recebidas
async function processIncomingMessage(event: EvolutionWebhookEvent): Promise<void> {
  const messageData = event.data as MessageData;
  
  // Ignorar mensagens enviadas por nós
  if (messageData.key?.fromMe) {
    return;
  }

  // Idempotência: ignorar se já existe
  if (await isDuplicateMessage(messageData.key?.id)) {
    logger.info('Mensagem duplicada ignorada', { id: messageData.key?.id });
    return;
  }

  const messageText = extractMessageText(messageData.message);
  const messageType = getMessageType(messageData.message);
  const phone = extractPhoneFromJid(messageData.key.remoteJid);

  // Buscar instância do WhatsApp
  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('id, tenant_id')
    .eq('instance_key', event.instance)
    .single();

  if (instanceError || !instance) {
    logger.error(`WhatsApp instance not found: ${event.instance}`, instanceError);
    return;
  }

  try {
    // Chamar função do banco para processar mensagem e chatbots
    const { data: result, error } = await supabase.rpc('process_incoming_message', {
      p_phone: phone,
      p_message_content: messageText,
      p_whatsapp_instance_id: instance.id,
      p_evolution_message_id: messageData.key.id
    });

    if (error) {
      logger.error('Error processing incoming message:', error);
      return;
    }

    logger.info('Message processed successfully:', {
      phone,
      messageText,
      messageType,
      chatbotMatched: result?.chatbot_response?.matched || false,
      chatbotName: result?.chatbot_response?.chatbot_name
    });

  } catch (error) {
    logger.error('Error in processIncomingMessage:', error);
  }
}

// Função para atualizar status da mensagem
async function processMessageUpdate(event: EvolutionWebhookEvent): Promise<void> {
  const messageData = event.data as MessageData;
  
  try {
    const { error } = await supabase
      .from('messages')
      .update({
        status: messageData.status?.toLowerCase() || 'unknown',
        updated_at: new Date().toISOString()
      })
      .eq('evolution_message_id', messageData.key.id);

    if (error) {
      logger.error('Error updating message status:', error);
    }
  } catch (error) {
    logger.error('Error in processMessageUpdate:', error);
  }
}

// Função para atualizar status da conexão
async function processConnectionUpdate(event: EvolutionWebhookEvent): Promise<void> {
  const connectionData = event.data as any;
  
  const state = (connectionData?.state || '').toLowerCase();
  const status = state === 'open' ? 'connected' : 
                state === 'connecting' ? 'connecting' : state === 'qr' ? 'qr_code' : 'disconnected';
  
  try {
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('instance_key', event.instance);

    if (error) {
      logger.error('Error updating connection status:', error);
    }

    logger.info(`Instance ${event.instance} status updated to: ${status}`);
  } catch (error) {
    logger.error('Error in processConnectionUpdate:', error);
  }
}

// Função para atualizar QR Code
async function processQRCodeUpdate(event: EvolutionWebhookEvent): Promise<void> {
  const qrData = event.data as any;
  
  try {
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({
        qr_code: qrData.qrcode?.base64 || qrData.qr,
        status: 'qr_code',
        updated_at: new Date().toISOString()
      })
      .eq('instance_key', event.instance);

    if (error) {
      logger.error('Error updating QR code:', error);
    }

    logger.info(`QR Code updated for instance: ${event.instance}`);
  } catch (error) {
    logger.error('Error in processQRCodeUpdate:', error);
  }
}

// Função para registrar evento de webhook
async function logWebhookEvent(event: EvolutionWebhookEvent): Promise<void> {
  try {
    const { error } = await supabase
      .from('webhook_logs')
      .insert({
        instance_name: event.instance,
        event_type: event.event,
        event_data: event.data,
        destination: (event as any).destination,
        sender: (event as any).sender,
        server_url: (event as any).server_url,
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });

    if (error) {
      logger.error('Error logging webhook event:', error);
    }
  } catch (error) {
    logger.error('Error in logWebhookEvent:', error);
  }
}

// Handler principal do webhook
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validar apikey do Evolution (opcional)
  const receivedApiKey = req.headers['apikey'] || req.headers['x-apikey'] || '';
  const expectedApiKey = process.env.VITE_EVOLUTION_X_API_KEY || process.env.EVOLUTION_X_API_KEY || '';
  if (expectedApiKey && receivedApiKey !== expectedApiKey) {
    logger.warn('apikey inválida no webhook Evolution');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verificar assinatura HMAC se fornecida
  const signatureHeader = req.headers['x-signature'] || req.headers['x-hub-signature-256'] || '';
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const signatureOk = await verifySignature(rawBody, signatureHeader);
  if (!signatureOk) {
    logger.warn('Assinatura HMAC inválida no webhook Evolution');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const event: EvolutionWebhookEvent = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Validar dados básicos do evento
    if (!event?.event || !event?.instance) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    logger.info(`Processing webhook event: ${event.event} for instance: ${event.instance}`);

    // Registrar evento para auditoria
    await logWebhookEvent(event);

    // Processar evento baseado no tipo
    switch (event.event) {
      case 'messages.upsert':
        await processIncomingMessage(event);
        break;
        
      case 'messages.update':
        await processMessageUpdate(event);
        break;
        
      case 'connection.update':
        await processConnectionUpdate(event);
        break;
        
      case 'qrcode.updated':
        await processQRCodeUpdate(event);
        break;
        
      default:
        logger.warn(`Unhandled webhook event: ${event.event}`);
    }

    // Responder com sucesso
    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      event: event.event,
      instance: event.instance
    });

  } catch (error) {
    logger.error('Error processing webhook:', error);
    
    // Registrar erro
    try {
      await supabase
        .from('webhook_errors')
        .insert({
          instance_name: (req as any).body?.instance || 'unknown',
          event_type: (req as any).body?.event || 'unknown',
          event_data: (req as any).body,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          error_stack: error instanceof Error ? error.stack : null,
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      logger.error('Error logging webhook error:', logError);
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Exportar também as funções auxiliares para testes
export {
  extractMessageText,
  getMessageType,
  extractPhoneFromJid,
  processIncomingMessage,
  processMessageUpdate,
  processConnectionUpdate,
  processQRCodeUpdate
};