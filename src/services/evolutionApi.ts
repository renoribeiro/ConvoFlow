import { supabase } from '@/integrations/supabase/client';
import { EvolutionInstance, IncomingMessage, WebhookEvent } from '@/types/evolution.types';
import { logger } from '../lib/logger';
import { ValidationSchemas, validateInput, UrlSanitizer } from '../lib/validation';

export class EvolutionApiService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Validate and sanitize inputs
    const urlValidation = validateInput(ValidationSchemas.url, baseUrl);
    const apiKeyValidation = validateInput(ValidationSchemas.apiKey, apiKey);
    
    if (!urlValidation.success) {
      throw new Error(`Invalid base URL: ${urlValidation.error}`);
    }
    
    if (!apiKeyValidation.success) {
      throw new Error(`Invalid API key: ${apiKeyValidation.error}`);
    }
    
    const sanitizedUrl = UrlSanitizer.sanitizeUrl(baseUrl);
    if (!sanitizedUrl) {
      throw new Error('Invalid or unsafe base URL');
    }
    
    this.baseUrl = sanitizedUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
    
    logger.info('Evolution API service initialized', {
      baseUrl: this.baseUrl.replace(/\/[^/]*$/, '/***'), // Hide sensitive parts
      hasApiKey: !!this.apiKey
    });
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Log request (without sensitive data)
    logger.debug('Making Evolution API request', {
      endpoint,
      method: options.method || 'GET',
      hasBody: !!options.body
    });
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP ${response.status}: ${errorText}`);
        
        logger.error('Evolution API request failed', {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          error: errorText
        }, error);
        
        throw error;
      }

      const data = await response.json();
      
      logger.debug('Evolution API request successful', {
        endpoint,
        status: response.status
      });
      
      return data;
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        logger.error('Network error in Evolution API request', {
          endpoint,
          error: error.message
        }, error);
        throw new Error('Erro de conexão com a Evolution API');
      }
      throw error;
    }
  }

  // Instance Management
  async createInstance(instanceName: string, webhookUrl?: string): Promise<EvolutionInstance> {
    const payload = {
      instanceName,
      webhook: webhookUrl,
      qrcode: true,
      number: false,
      webhook_by_events: true,
      events: [
        'APPLICATION_STARTUP',
        'QRCODE_UPDATED',
        'MESSAGES_UPSERT',
        'CONNECTION_UPDATE'
      ]
    };

    return this.makeRequest<EvolutionInstance>('/instance/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.makeRequest(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async getInstanceInfo(instanceName: string): Promise<EvolutionInstance> {
    return this.makeRequest<EvolutionInstance>(`/instance/fetchInstances/${instanceName}`);
  }

  async getAllInstances(): Promise<EvolutionInstance[]> {
    const response = await this.makeRequest<EvolutionInstance[]>('/instance/fetchInstances');
    return Array.isArray(response) ? response : [];
  }

  async connectInstance(instanceName: string): Promise<{ qrcode?: string }> {
    return this.makeRequest<{ qrcode?: string }>(`/instance/connect/${instanceName}`, {
      method: 'GET',
    });
  }

  async disconnectInstance(instanceName: string): Promise<void> {
    await this.makeRequest(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async getQRCode(instanceName: string): Promise<{ qrcode: string }> {
    return this.makeRequest<{ qrcode: string }>(`/instance/qrcode/${instanceName}`);
  }

  // Message Management
  async sendMessage(instanceName: string, remoteJid: string, message: string): Promise<any> {
    const payload = {
      number: remoteJid,
      text: message,
    };

    return this.makeRequest(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendMediaMessage(
    instanceName: string, 
    remoteJid: string, 
    mediaUrl: string, 
    caption?: string
  ): Promise<any> {
    const payload = {
      number: remoteJid,
      media: mediaUrl,
      caption,
    };

    return this.makeRequest(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Instance Settings
  async updateInstanceSettings(instanceName: string, settings: Partial<EvolutionInstance['settings']>): Promise<void> {
    await this.makeRequest(`/instance/settings/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async setWebhook(instanceName: string, webhookUrl: string, events: string[]): Promise<void> {
    const payload = {
      webhook: {
        url: webhookUrl,
        events,
      },
    };

    await this.makeRequest(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

// Service factory
export const createEvolutionApiService = (serverUrl: string, apiKey: string) => {
  return new EvolutionApiService(serverUrl, apiKey);
};

// Webhook processing utilities
export const processWebhookEvent = async (event: WebhookEvent): Promise<void> => {
  const { event: eventType, instance, data } = event;

  try {
    switch (eventType) {
      case 'messages.upsert':
        await processIncomingMessage(instance, data);
        break;
      case 'connection.update':
        await processConnectionUpdate(instance, data);
        break;
      case 'qrcode.updated':
        await processQRCodeUpdate(instance, data);
        break;
      case 'presence.update':
        await processPresenceUpdate(instance, data);
        break;
      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }
  } catch (error) {
    console.error(`Error processing webhook event ${eventType}:`, error);
  }
};

const processIncomingMessage = async (instanceName: string, messageData: IncomingMessage): Promise<void> => {
  const { key, message, messageTimestamp, pushName } = messageData;
  
  if (key.fromMe) return; // Ignore messages sent by us

  // Get WhatsApp instance from database
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, tenant_id')
    .eq('instance_key', instanceName)
    .single();

  if (!instance) {
    console.error(`WhatsApp instance not found: ${instanceName}`);
    return;
  }

  // Extract message content
  const messageContent = message.conversation || message.extendedTextMessage?.text || '';
  
  // Get or create contact
  const phone = key.remoteJid.replace('@s.whatsapp.net', '');
  let { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .eq('tenant_id', instance.tenant_id)
    .single();

  if (!contact) {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({
        phone,
        name: pushName || phone,
        tenant_id: instance.tenant_id,
        whatsapp_instance_id: instance.id,
        last_interaction_at: new Date(messageTimestamp * 1000).toISOString(),
      })
      .select('id')
      .single();
    
    contact = newContact;
  }

  if (!contact) {
    console.error('Failed to create or get contact');
    return;
  }

  // Save message to database
  await supabase.from('messages').insert({
    contact_id: contact.id,
    tenant_id: instance.tenant_id,
    whatsapp_instance_id: instance.id,
    direction: 'inbound',
    message_type: 'text',
    content: messageContent,
    evolution_message_id: key.id,
    status: 'received',
  });

  // Update contact last interaction
  await supabase
    .from('contacts')
    .update({
      last_interaction_at: new Date(messageTimestamp * 1000).toISOString(),
    })
    .eq('id', contact.id);
};

const processConnectionUpdate = async (instanceName: string, connectionData: any): Promise<void> => {
  const { state, qr } = connectionData;

  await supabase
    .from('whatsapp_instances')
    .update({
      status: state,
      qr_code: qr || null,
      last_connected_at: state === 'open' ? new Date().toISOString() : null,
    })
    .eq('instance_key', instanceName);
};

const processQRCodeUpdate = async (instanceName: string, qrData: any): Promise<void> => {
  const { qr } = qrData;

  await supabase
    .from('whatsapp_instances')
    .update({
      qr_code: qr,
      status: 'qrcode',
    })
    .eq('instance_key', instanceName);
};

const processPresenceUpdate = async (instanceName: string, presenceData: any): Promise<void> => {
  // Handle presence updates if needed
  console.log('Presence update:', { instanceName, presenceData });
};