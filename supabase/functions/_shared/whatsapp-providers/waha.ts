import { IWhatsAppProvider, ProviderConfig, SendMessageOptions } from './base.ts';

export class WahaProvider implements IWhatsAppProvider {
    private config: ProviderConfig;

    constructor(config: ProviderConfig) {
        this.config = config;
    }

    private formatChatId(phone: string): string {
        const numericPhone = phone.replace(/\D/g, '');
        return `${numericPhone}@c.us`;
    }

    async sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any> {
        const url = `${this.config.baseUrl}/api/send/text`;
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Api-Key': this.config.apiKey
        };

        const body = {
            chatId: this.formatChatId(to),
            text: content,
            session: this.config.instanceName,
            reply_to: options?.quotedMessageId 
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Waha API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    async fetchHistory(limit: number = 50): Promise<any[]> {
        const url = `${this.config.baseUrl}/api/messages?limit=${limit}&session=${this.config.instanceName}`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Api-Key': this.config.apiKey
        };

        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) return [];
        return await response.json();
    }
}