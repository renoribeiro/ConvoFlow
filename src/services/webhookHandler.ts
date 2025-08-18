import { supabase } from '../integrations/supabase/client';
import { EvolutionApiService } from './evolutionApi';
import { env } from '../lib/env';

export interface WebhookEvent {
  event: string;
  instance: string;
  data: any;
  destination?: string;
  date_time: string;
  sender?: string;
  server_url?: string;
}

export interface MessageEvent {
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

export interface ConnectionEvent {
  state: 'open' | 'connecting' | 'close';
  statusReason?: number;
}

export interface QRCodeEvent {
  qrcode: {
    code: string;
    base64: string;
  };
}

export interface PresenceEvent {
  id: string;
  presences: {
    [key: string]: {
      lastKnownPresence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';
      lastSeen?: number;
    };
  };
}

export interface GroupEvent {
  id: string;
  subject?: string;
  subjectOwner?: string;
  subjectTime?: number;
  creation?: number;
  owner?: string;
  desc?: string;
  descOwner?: string;
  descId?: string;
  restrict?: boolean;
  announce?: boolean;
  participants: Array<{
    id: string;
    admin?: 'admin' | 'superadmin' | null;
  }>;
  action: 'create' | 'add' | 'remove' | 'promote' | 'demote' | 'subject' | 'description' | 'settings';
  author?: string;
  participants_update?: string[];
}

// Interface para configuração de retry
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// Interface para métricas de performance
interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

// Circuit breaker para operações críticas
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

export class WebhookHandler {
  private evolutionApi: EvolutionApiService;
  private eventHandlers: Map<string, (event: WebhookEvent) => Promise<void>>;
  private circuitBreaker: CircuitBreaker;
  private retryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  };

  constructor(evolutionApi: EvolutionApiService) {
    this.evolutionApi = evolutionApi;
    this.eventHandlers = new Map();
    this.circuitBreaker = new CircuitBreaker(5, 60000);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.eventHandlers.set('messages.upsert', this.handleMessageUpsert.bind(this));
    this.eventHandlers.set('messages.update', this.handleMessageUpdate.bind(this));
    this.eventHandlers.set('messages.delete', this.handleMessageDelete.bind(this));
    this.eventHandlers.set('connection.update', this.handleConnectionUpdate.bind(this));
    this.eventHandlers.set('qrcode.updated', this.handleQRCodeUpdate.bind(this));
    this.eventHandlers.set('presence.update', this.handlePresenceUpdate.bind(this));
    this.eventHandlers.set('groups.upsert', this.handleGroupUpsert.bind(this));
    this.eventHandlers.set('groups.update', this.handleGroupUpdate.bind(this));
    this.eventHandlers.set('contacts.upsert', this.handleContactUpsert.bind(this));
    this.eventHandlers.set('contacts.update', this.handleContactUpdate.bind(this));
    this.eventHandlers.set('chats.upsert', this.handleChatUpsert.bind(this));
    this.eventHandlers.set('chats.update', this.handleChatUpdate.bind(this));
    this.eventHandlers.set('chats.delete', this.handleChatDelete.bind(this));
  }

  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    const metrics: PerformanceMetrics = {
      startTime: Date.now(),
      memoryUsage: process.memoryUsage()
    };
    
    try {
      // Validar evento antes do processamento
      this.validateEvent(event);
      
      // Log inicial do evento
      await this.logWebhookEvent(event, metrics);
      
      // Processar evento com circuit breaker e retry
      await this.circuitBreaker.execute(async () => {
        await this.retryOperation(async () => {
          await this.processEventByType(event);
        });
      });
      
      // Calcular métricas finais
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      
      // Log de sucesso
      if (env.isDebugEnabled()) {
        console.log(`[WebhookHandler] Event ${event.event} processed successfully in ${metrics.duration}ms`);
      }
      
    } catch (error) {
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      
      const enhancedError = this.enhanceError(error, event, metrics);
      console.error(`[WebhookHandler] Error processing event ${event.event}:`, enhancedError);
      
      await this.logWebhookError(event, enhancedError, metrics);
      throw enhancedError;
    }
  }
  
  private validateEvent(event: WebhookEvent): void {
    if (!event) {
      throw new Error('Event is null or undefined');
    }
    
    if (!event.event || typeof event.event !== 'string') {
      throw new Error('Event type is missing or invalid');
    }
    
    if (!event.instance || typeof event.instance !== 'string') {
      throw new Error('Instance name is missing or invalid');
    }
    
    // Validações específicas por tipo de evento
    switch (event.event) {
      case 'messages.upsert':
      case 'messages.update':
        if (!event.data || !Array.isArray(event.data)) {
          throw new Error('Message event data must be an array');
        }
        break;
      case 'contacts.upsert':
      case 'contacts.update':
        if (!event.data || typeof event.data !== 'object') {
          throw new Error('Contact event data must be an object');
        }
        break;
    }
  }
  
  private async processEventByType(event: WebhookEvent): Promise<void> {
    const handler = this.eventHandlers.get(event.event);
    if (handler) {
      await handler(event);
    } else {
      console.warn(`[WebhookHandler] No handler found for event: ${event.event}`);
    }
  }
  
  private async retryOperation<T>(
    operation: () => Promise<T>,
    config: RetryConfig = this.retryConfig
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === config.maxAttempts) {
          break;
        }
        
        // Verificar se o erro é recuperável
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        
        console.warn(`[WebhookHandler] Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }
    
    throw new Error(`Operation failed after ${config.maxAttempts} attempts. Last error: ${lastError.message}`);
  }
  
  private isRetryableError(error: any): boolean {
    // Erros de rede e temporários são recuperáveis
    const retryableErrors = [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'NETWORK_ERROR',
      'TIMEOUT'
    ];
    
    const errorCode = error.code || error.name || '';
    const errorMessage = error.message || '';
    
    return retryableErrors.some(code => 
      errorCode.includes(code) || errorMessage.includes(code)
    ) || (error.status >= 500 && error.status < 600);
  }
  
  private enhanceError(error: any, event: WebhookEvent, metrics: PerformanceMetrics): Error {
    const enhancedError = new Error(error.message || 'Unknown error');
    enhancedError.name = error.name || 'WebhookProcessingError';
    enhancedError.stack = error.stack;
    
    // Adicionar contexto adicional
    (enhancedError as any).context = {
      eventType: event.event,
      instanceName: event.instance,
      processingTime: metrics.duration,
      memoryUsage: metrics.memoryUsage,
      timestamp: new Date().toISOString(),
      circuitBreakerState: (this.circuitBreaker as any).state
    };
    
    return enhancedError;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleMessageUpsert(event: WebhookEvent): Promise<void> {
    const messageData = event.data as MessageEvent;
    
    // Extrair texto da mensagem
    const messageText = this.extractMessageText(messageData.message);
    const messageType = this.getMessageType(messageData.message);
    
    // Salvar mensagem no Supabase
    const { error } = await supabase
      .from('messages')
      .upsert({
        id: messageData.key.id,
        instance_name: event.instance,
        remote_jid: messageData.key.remoteJid,
        from_me: messageData.key.fromMe,
        participant: messageData.key.participant,
        push_name: messageData.pushName,
        message_text: messageText,
        message_type: messageType,
        message_data: messageData.message,
        timestamp: new Date(messageData.messageTimestamp * 1000),
        status: messageData.status || 'RECEIVED',
        created_at: new Date(),
        updated_at: new Date()
      }, {
        onConflict: 'id'
      });

    if (error) {
      console.error('[WebhookHandler] Error saving message:', error);
    }

    // Atualizar contato se necessário
    if (!messageData.key.fromMe && messageData.pushName) {
      await this.updateContact(event.instance, messageData.key.remoteJid, messageData.pushName);
    }

    // Sincronizar tabela conversations se a mensagem não for nossa
    if (!messageData.key.fromMe) {
      await this.syncConversationFromMessage(event.instance, messageData);
    }
  }

  private async handleMessageUpdate(event: WebhookEvent): Promise<void> {
    const messageData = event.data as MessageEvent;
    
    const { error } = await supabase
      .from('messages')
      .update({
        status: messageData.status,
        updated_at: new Date()
      })
      .eq('id', messageData.key.id);

    if (error) {
      console.error('[WebhookHandler] Error updating message:', error);
    }
  }

  private async handleMessageDelete(event: WebhookEvent): Promise<void> {
    const messageData = event.data as MessageEvent;
    
    const { error } = await supabase
      .from('messages')
      .update({
        deleted: true,
        updated_at: new Date()
      })
      .eq('id', messageData.key.id);

    if (error) {
      console.error('[WebhookHandler] Error deleting message:', error);
    }
  }

  private async handleConnectionUpdate(event: WebhookEvent): Promise<void> {
    const connectionData = event.data as ConnectionEvent;
    
    const status = connectionData.state === 'open' ? 'connected' : 
                  connectionData.state === 'connecting' ? 'connecting' : 'disconnected';
    
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({
        status,
        updated_at: new Date()
      })
      .eq('name', event.instance);

    if (error) {
      console.error('[WebhookHandler] Error updating instance status:', error);
    }
  }

  private async handleQRCodeUpdate(event: WebhookEvent): Promise<void> {
    const qrData = event.data as QRCodeEvent;
    
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({
        qr_code: qrData.qrcode.base64,
        status: 'qr_code',
        updated_at: new Date()
      })
      .eq('name', event.instance);

    if (error) {
      console.error('[WebhookHandler] Error updating QR code:', error);
    }
  }

  private async handlePresenceUpdate(event: WebhookEvent): Promise<void> {
    const presenceData = event.data as PresenceEvent;
    
    // Atualizar presença dos contatos
    for (const [jid, presence] of Object.entries(presenceData.presences)) {
      await supabase
        .from('contacts')
        .upsert({
          instance_name: event.instance,
          jid,
          presence: presence.lastKnownPresence,
          last_seen: presence.lastSeen ? new Date(presence.lastSeen * 1000) : null,
          updated_at: new Date()
        }, {
          onConflict: 'instance_name,jid'
        });
    }
  }

  private async handleGroupUpsert(event: WebhookEvent): Promise<void> {
    const groupData = event.data as GroupEvent;
    
    const { error } = await supabase
      .from('groups')
      .upsert({
        id: groupData.id,
        instance_name: event.instance,
        subject: groupData.subject,
        subject_owner: groupData.subjectOwner,
        subject_time: groupData.subjectTime ? new Date(groupData.subjectTime * 1000) : null,
        creation: groupData.creation ? new Date(groupData.creation * 1000) : null,
        owner: groupData.owner,
        description: groupData.desc,
        description_owner: groupData.descOwner,
        description_id: groupData.descId,
        restrict: groupData.restrict,
        announce: groupData.announce,
        participants: groupData.participants,
        created_at: new Date(),
        updated_at: new Date()
      }, {
        onConflict: 'id,instance_name'
      });

    if (error) {
      console.error('[WebhookHandler] Error saving group:', error);
    }
  }

  private async handleGroupUpdate(event: WebhookEvent): Promise<void> {
    const groupData = event.data as GroupEvent;
    
    const updateData: any = {
      updated_at: new Date()
    };

    if (groupData.subject) updateData.subject = groupData.subject;
    if (groupData.desc !== undefined) updateData.description = groupData.desc;
    if (groupData.participants) updateData.participants = groupData.participants;
    if (groupData.restrict !== undefined) updateData.restrict = groupData.restrict;
    if (groupData.announce !== undefined) updateData.announce = groupData.announce;
    
    const { error } = await supabase
      .from('groups')
      .update(updateData)
      .eq('id', groupData.id)
      .eq('instance_name', event.instance);

    if (error) {
      console.error('[WebhookHandler] Error updating group:', error);
    }
  }

  private async handleContactUpsert(event: WebhookEvent): Promise<void> {
    const contactData = event.data;
    
    if (Array.isArray(contactData)) {
      for (const contact of contactData) {
        await this.upsertContact(event.instance, contact);
      }
    } else {
      await this.upsertContact(event.instance, contactData);
    }
  }

  private async handleContactUpdate(event: WebhookEvent): Promise<void> {
    await this.handleContactUpsert(event);
  }

  private async handleChatUpsert(event: WebhookEvent): Promise<void> {
    const chatData = event.data;
    
    if (Array.isArray(chatData)) {
      for (const chat of chatData) {
        await this.upsertChat(event.instance, chat);
      }
    } else {
      await this.upsertChat(event.instance, chatData);
    }
  }

  private async handleChatUpdate(event: WebhookEvent): Promise<void> {
    await this.handleChatUpsert(event);
  }

  private async handleChatDelete(event: WebhookEvent): Promise<void> {
    const chatData = event.data;
    
    const { error } = await supabase
      .from('chats')
      .update({
        deleted: true,
        updated_at: new Date()
      })
      .eq('id', chatData.id)
      .eq('instance_name', event.instance);

    if (error) {
      console.error('[WebhookHandler] Error deleting chat:', error);
    }
  }

  private async upsertContact(instanceName: string, contactData: any): Promise<void> {
    const { error } = await supabase
      .from('contacts')
      .upsert({
        instance_name: instanceName,
        jid: contactData.id,
        name: contactData.name || contactData.pushName || contactData.notify,
        push_name: contactData.pushName,
        profile_picture: contactData.profilePictureUrl,
        is_business: contactData.isBusiness,
        is_enterprise: contactData.isEnterprise,
        created_at: new Date(),
        updated_at: new Date()
      }, {
        onConflict: 'instance_name,jid'
      });

    if (error) {
      console.error('[WebhookHandler] Error upserting contact:', error);
    }
  }

  private async upsertChat(instanceName: string, chatData: any): Promise<void> {
    const { error } = await supabase
      .from('chats')
      .upsert({
        id: chatData.id,
        instance_name: instanceName,
        name: chatData.name,
        is_group: chatData.id.includes('@g.us'),
        unread_count: chatData.unreadCount || 0,
        last_message_time: chatData.conversationTimestamp ? new Date(chatData.conversationTimestamp * 1000) : null,
        archived: chatData.archived || false,
        pinned: chatData.pinned || false,
        muted: chatData.muteEndTime ? new Date(chatData.muteEndTime * 1000) : null,
        created_at: new Date(),
        updated_at: new Date()
      }, {
        onConflict: 'id,instance_name'
      });

    if (error) {
      console.error('[WebhookHandler] Error upserting chat:', error);
      return;
    }

    // Sincronizar com tabela conversations
    await this.syncConversationFromChat(instanceName, chatData);
  }

  private async updateContact(instanceName: string, jid: string, pushName: string): Promise<void> {
    const { error } = await supabase
      .from('contacts')
      .upsert({
        instance_name: instanceName,
        jid,
        push_name: pushName,
        name: pushName,
        updated_at: new Date()
      }, {
        onConflict: 'instance_name,jid'
      });

    if (error) {
      console.error('[WebhookHandler] Error updating contact:', error);
    }
  }

  private extractMessageText(message: any): string {
    try {
      // Verificar se message existe
      if (!message || typeof message !== 'object') {
        return '';
      }

      // Mensagens de texto simples
      if (message.conversation && typeof message.conversation === 'string') {
        return message.conversation.trim();
      }

      // Mensagens de texto estendidas
      if (message.extendedTextMessage?.text && typeof message.extendedTextMessage.text === 'string') {
        return message.extendedTextMessage.text.trim();
      }

      // Mensagens com mídia e caption
      if (message.imageMessage?.caption && typeof message.imageMessage.caption === 'string') {
        return message.imageMessage.caption.trim();
      }

      if (message.videoMessage?.caption && typeof message.videoMessage.caption === 'string') {
        return message.videoMessage.caption.trim();
      }

      // Documentos
      if (message.documentMessage) {
        const title = message.documentMessage.title || message.documentMessage.fileName || '';
        if (title && typeof title === 'string') {
          return `📄 ${title.trim()}`;
        }
        return '📄 Documento';
      }

      // Contatos
      if (message.contactMessage?.displayName && typeof message.contactMessage.displayName === 'string') {
        return `👤 Contato: ${message.contactMessage.displayName.trim()}`;
      }

      // Localização
      if (message.locationMessage) {
        const name = message.locationMessage.name || message.locationMessage.address || 'Localização';
        const lat = message.locationMessage.degreesLatitude;
        const lng = message.locationMessage.degreesLongitude;
        if (lat && lng) {
          return `📍 ${name} (${lat}, ${lng})`;
        }
        return `📍 ${name}`;
      }

      // Reações
      if (message.reactionMessage?.text && typeof message.reactionMessage.text === 'string') {
        return `👍 Reação: ${message.reactionMessage.text}`;
      }

      // Áudio
      if (message.audioMessage) {
        return '🎵 Mensagem de áudio';
      }

      // Stickers
      if (message.stickerMessage) {
        return '🎭 Sticker';
      }

      // Mensagens de sistema/protocolo
      if (message.protocolMessage) {
        return '⚙️ Mensagem do sistema';
      }

      // Mensagens de grupo
      if (message.groupInviteMessage) {
        return '👥 Convite para grupo';
      }

      // Mensagens de chamada
      if (message.call) {
        return '📞 Chamada';
      }

      // Mensagens de botão/interativas
      if (message.buttonsMessage?.contentText) {
        return message.buttonsMessage.contentText.trim();
      }

      if (message.listMessage?.description) {
        return message.listMessage.description.trim();
      }

      if (message.templateMessage?.hydratedTemplate?.hydratedContentText) {
        return message.templateMessage.hydratedTemplate.hydratedContentText.trim();
      }

      // Mensagens de produto/catálogo
      if (message.productMessage) {
        const title = message.productMessage.product?.title || 'Produto';
        return `🛍️ ${title}`;
      }

      // Fallback para outros tipos
      const messageKeys = Object.keys(message);
      if (messageKeys.length > 0) {
        const firstKey = messageKeys[0];
        return `📱 Mensagem do tipo: ${firstKey}`;
      }

      return '';
    } catch (error) {
      console.error('[WebhookHandler] Error extracting message text:', error);
      return '';
    }
  }

  private getMessageType(message: any): string {
    try {
      if (!message || typeof message !== 'object') {
        return 'unknown';
      }

      // Mensagens de texto
      if (message.conversation || message.extendedTextMessage) return 'text';
      
      // Mídia
      if (message.imageMessage) return 'image';
      if (message.videoMessage) return 'video';
      if (message.audioMessage) return 'audio';
      if (message.documentMessage) return 'document';
      if (message.stickerMessage) return 'sticker';
      
      // Contatos e localização
      if (message.contactMessage) return 'contact';
      if (message.locationMessage) return 'location';
      
      // Interações
      if (message.reactionMessage) return 'reaction';
      
      // Mensagens interativas
      if (message.buttonsMessage) return 'buttons';
      if (message.listMessage) return 'list';
      if (message.templateMessage) return 'template';
      
      // Mensagens de sistema
      if (message.protocolMessage) return 'protocol';
      if (message.groupInviteMessage) return 'group_invite';
      if (message.call) return 'call';
      
      // Mensagens de negócio
      if (message.productMessage) return 'product';
      
      // Fallback baseado na primeira chave
      const messageKeys = Object.keys(message);
      if (messageKeys.length > 0) {
        return messageKeys[0].replace('Message', '').toLowerCase();
      }
      
      return 'unknown';
    } catch (error) {
      console.error('[WebhookHandler] Error determining message type:', error);
      return 'unknown';
    }
  }

  private async logWebhookEvent(event: WebhookEvent, metrics?: PerformanceMetrics): Promise<void> {
    try {
      // Apenas fazer log em desenvolvimento ou se debug estiver habilitado
      if (!env.isDevelopment() && !env.isDebugEnabled()) {
        return;
      }
      
      const logData = {
        instance_name: event.instance,
        event_type: event.event,
        event_data: this.sanitizeEventData(event.data),
        destination: event.destination,
        sender: event.sender,
        server_url: event.server_url,
        processing_time_ms: metrics?.duration,
        memory_usage: metrics?.memoryUsage,
        processed_at: new Date(),
        created_at: new Date()
      };
      
      const { error } = await supabase
        .from('webhook_logs')
        .insert(logData);

      if (error) {
        console.error('[WebhookHandler] Error logging webhook event:', {
          error: error.message,
          eventType: event.event,
          instanceName: event.instance
        });
      }
    } catch (error) {
      console.error('[WebhookHandler] Critical error in event logging:', error);
    }
  }

  private async logWebhookError(event: WebhookEvent, error: any, metrics?: PerformanceMetrics): Promise<void> {
    try {
      const errorData = {
        instance_name: event.instance,
        event_type: event.event,
        event_data: this.sanitizeEventData(event.data),
        error_message: error.message || 'Unknown error',
        error_stack: error.stack,
        error_context: (error as any).context,
        processing_time_ms: metrics?.duration,
        memory_usage: metrics?.memoryUsage,
        retry_count: (error as any).retryCount || 0,
        created_at: new Date()
      };
      
      const { error: logError } = await supabase
        .from('webhook_errors')
        .insert(errorData);

      if (logError) {
        console.error('[WebhookHandler] Error logging webhook error:', {
          originalError: error.message,
          logError: logError.message,
          eventType: event.event,
          instanceName: event.instance
        });
      }
    } catch (logError) {
      console.error('[WebhookHandler] Critical error in error logging:', {
        originalError: error.message,
        logError: (logError as Error).message,
        eventType: event.event
      });
    }
  }
  
  private sanitizeEventData(data: any): any {
    if (!data) return data;
    
    try {
      // Limitar o tamanho dos dados para evitar logs muito grandes
      const jsonString = JSON.stringify(data);
      if (jsonString.length > 10000) {
        return {
          _truncated: true,
          _originalSize: jsonString.length,
          _preview: jsonString.substring(0, 1000) + '...'
        };
      }
      return data;
    } catch (error) {
      return {
        _error: 'Failed to serialize event data',
        _type: typeof data
      };
    }
  }

  /**
   * Sincroniza a tabela conversations com base nos dados de uma mensagem recebida
   */
  private async syncConversationFromMessage(instanceName: string, messageData: MessageEvent): Promise<void> {
    try {
      // Buscar a instância do WhatsApp
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id')
        .eq('name', instanceName)
        .single();

      if (!instance) {
        console.error(`[WebhookHandler] WhatsApp instance not found: ${instanceName}`);
        return;
      }

      // Extrair número de telefone do JID
      const phone = messageData.key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      
      // Buscar ou criar contato
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
            name: messageData.pushName || phone,
            tenant_id: instance.tenant_id,
            whatsapp_instance_id: instance.id,
            last_interaction_at: new Date(messageData.messageTimestamp * 1000).toISOString(),
          })
          .select('id')
          .single();
        
        contact = newContact;
      }

      if (!contact) {
        console.error('[WebhookHandler] Failed to create or get contact');
        return;
      }

      // Buscar conversa existente
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('contact_id', contact.id)
        .eq('tenant_id', instance.tenant_id)
        .single();

      const now = new Date().toISOString();

      if (existingConversation) {
        // Atualizar conversa existente - incrementar unread_count apenas para mensagens recebidas
        const newUnreadCount = existingConversation.unread_count + 1;
        
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            last_message_at: now,
            unread_count: newUnreadCount,
            updated_at: now
          })
          .eq('id', existingConversation.id);

        if (updateError) {
          console.error('[WebhookHandler] Error updating conversation:', updateError);
        }
      } else {
        // Criar nova conversa
        const { error: insertError } = await supabase
          .from('conversations')
          .insert({
            contact_id: contact.id,
            tenant_id: instance.tenant_id,
            whatsapp_instance_id: instance.id,
            last_message_at: now,
            unread_count: 1, // Primeira mensagem não lida
            is_archived: false,
            created_at: now,
            updated_at: now
          });

        if (insertError) {
          console.error('[WebhookHandler] Error creating conversation:', insertError);
        }
      }

      // Atualizar última interação do contato
      await supabase
        .from('contacts')
        .update({
          last_interaction_at: new Date(messageData.messageTimestamp * 1000).toISOString(),
          updated_at: now
        })
        .eq('id', contact.id);

    } catch (error) {
      console.error('[WebhookHandler] Error syncing conversation from message:', error);
    }
  }

  /**
   * Sincroniza a tabela conversations com base nos dados de um chat
   */
  private async syncConversationFromChat(instanceName: string, chatData: any): Promise<void> {
    try {
      // Buscar a instância do WhatsApp
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id')
        .eq('name', instanceName)
        .single();

      if (!instance) {
        console.error(`[WebhookHandler] WhatsApp instance not found: ${instanceName}`);
        return;
      }

      // Extrair número de telefone do JID do chat
      const phone = chatData.id.replace('@s.whatsapp.net', '').replace('@g.us', '');
      
      // Buscar contato relacionado
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', phone)
        .eq('tenant_id', instance.tenant_id)
        .single();

      if (!contact) {
        // Se não temos o contato, não criamos a conversa ainda
        // Ela será criada quando a primeira mensagem chegar
        return;
      }

      // Buscar conversa existente
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('tenant_id', instance.tenant_id)
        .single();

      const now = new Date().toISOString();
      const lastMessageTime = chatData.conversationTimestamp 
        ? new Date(chatData.conversationTimestamp * 1000).toISOString() 
        : now;

      if (existingConversation) {
        // Atualizar conversa existente com dados do chat
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            last_message_at: lastMessageTime,
            unread_count: chatData.unreadCount || 0, // Sincronizar unread_count do chat
            is_archived: chatData.archived || false,
            updated_at: now
          })
          .eq('id', existingConversation.id);

        if (updateError) {
          console.error('[WebhookHandler] Error updating conversation from chat:', updateError);
        }
      } else {
        // Criar nova conversa com dados do chat
        const { error: insertError } = await supabase
          .from('conversations')
          .insert({
            contact_id: contact.id,
            tenant_id: instance.tenant_id,
            whatsapp_instance_id: instance.id,
            last_message_at: lastMessageTime,
            unread_count: chatData.unreadCount || 0,
            is_archived: chatData.archived || false,
            created_at: now,
            updated_at: now
          });

        if (insertError) {
          console.error('[WebhookHandler] Error creating conversation from chat:', insertError);
        }
      }

    } catch (error) {
      console.error('[WebhookHandler] Error syncing conversation from chat:', error);
    }
  }
}

export default WebhookHandler;