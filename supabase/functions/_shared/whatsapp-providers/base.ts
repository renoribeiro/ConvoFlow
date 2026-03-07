export interface SendMessageOptions {
    mentions?: string[];
    quotedMessageId?: string;
}

export interface SendMediaOptions extends SendMessageOptions {
    caption?: string;
}

export interface IWhatsAppProvider {
    sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any>;
    fetchHistory?(limit: number): Promise<any[]>;
}

export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    instanceName: string;
    webhookUrl?: string;
    [key: string]: any;
}