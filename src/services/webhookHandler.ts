import { supabase } from '../integrations/supabase/client';
import { EvolutionApiService } from './evolutionApi';

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

export class WebhookHandler {
  private evolutionApi: EvolutionApiService;
  private eventHandlers: Map<string, (event: WebhookEvent) => Promise<void>>;

  constructor(evolutionApi: EvolutionApiService) {
    this.evolutionApi = evolutionApi;
    this.eventHandlers = new Map();
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
    try {
      console.log(`[WebhookHandler] Processing event: ${event.event} for instance: ${event.instance}`);
      
      // Log do evento no Supabase para auditoria
      await this.logWebhookEvent(event);

      const handler = this.eventHandlers.get(event.event);
      if (handler) {
        await handler(event);
      } else {
        console.warn(`[WebhookHandler] No handler found for event: ${event.event}`);
      }
    } catch (error) {
      console.error(`[WebhookHandler] Error processing event ${event.event}:`, error);
      await this.logWebhookError(event, error);
    }
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
    }
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
    if (message.conversation) {
      return message.conversation;
    }
    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text;
    }
    if (message.imageMessage?.caption) {
      return message.imageMessage.caption;
    }
    if (message.videoMessage?.caption) {
      return message.videoMessage.caption;
    }
    if (message.documentMessage?.title) {
      return message.documentMessage.title;
    }
    if (message.contactMessage?.displayName) {
      return `Contato: ${message.contactMessage.displayName}`;
    }
    if (message.locationMessage) {
      return `Localização: ${message.locationMessage.name || 'Sem nome'}`;
    }
    if (message.reactionMessage) {
      return `Reação: ${message.reactionMessage.text}`;
    }
    return '';
  }

  private getMessageType(message: any): string {
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

  private async logWebhookEvent(event: WebhookEvent): Promise<void> {
    const { error } = await supabase
      .from('webhook_logs')
      .insert({
        instance_name: event.instance,
        event_type: event.event,
        event_data: event.data,
        destination: event.destination,
        sender: event.sender,
        server_url: event.server_url,
        processed_at: new Date(),
        created_at: new Date()
      });

    if (error) {
      console.error('[WebhookHandler] Error logging webhook event:', error);
    }
  }

  private async logWebhookError(event: WebhookEvent, error: any): Promise<void> {
    const { error: logError } = await supabase
      .from('webhook_errors')
      .insert({
        instance_name: event.instance,
        event_type: event.event,
        event_data: event.data,
        error_message: error.message,
        error_stack: error.stack,
        created_at: new Date()
      });

    if (logError) {
      console.error('[WebhookHandler] Error logging webhook error:', logError);
    }
  }
}

export default WebhookHandler;