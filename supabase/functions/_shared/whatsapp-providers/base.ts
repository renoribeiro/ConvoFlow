export interface SendMessageOptions {
    mentions?: string[];
    quotedMessageId?: string;
}

export interface SendMediaOptions extends SendMessageOptions {
    caption?: string;
    mediaType: 'image' | 'video' | 'document' | 'audio';
    fileName?: string;
}

export interface IWhatsAppProvider {
    sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any>;
    /**
     * Send a media message (image, video, document, or audio).
     * Returns the raw provider response; callers extract the message id via
     * result.key?.id || result.id || result.messageId.
     */
    sendMedia(
        to: string,
        mediaUrl: string,
        options: { caption?: string; mediaType: 'image' | 'video' | 'document' | 'audio'; fileName?: string },
    ): Promise<any>;
    fetchHistory?(limit: number): Promise<any[]>;
}

export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    instanceName: string;
    webhookUrl?: string;
    [key: string]: any;
}