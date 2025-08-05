
export interface EvolutionInstance {
  instanceName: string;
  status: 'open' | 'close' | 'connecting' | 'qrcode';
  serverUrl: string;
  apiKey: string;
  qrcode?: string;
  webhookUrl?: string;
  profilePicUrl?: string;
  profileName?: string;
  settings: {
    rejectCall: boolean;
    msgCall: string;
    groupsIgnore: boolean;
    alwaysOnline: boolean;
    readMessages: boolean;
    readStatus: boolean;
  };
  createdAt: Date;
  lastActivity?: Date;
}

export interface WebhookEvent {
  event: 'messages.upsert' | 'connection.update' | 'presence.update' | 'qrcode.updated';
  instance: string;
  data: any;
  server_url: string;
  apikey: string;
}

export interface IncomingMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
  pushName?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
  category: 'greeting' | 'response' | 'fallback' | 'transfer';
  isActive: boolean;
}

export interface EvolutionConfig {
  serverUrl: string;
  apiKey: string;
  instances: EvolutionInstance[];
  webhookSettings: {
    enabled: boolean;
    url: string;
    events: string[];
  };
  messageTemplates: MessageTemplate[];
}
