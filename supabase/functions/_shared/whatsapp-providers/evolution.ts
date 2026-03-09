import { IWhatsAppProvider, ProviderConfig, SendMessageOptions } from './base.ts';

export class EvolutionProvider implements IWhatsAppProvider {
    private config: ProviderConfig;

    constructor(config: ProviderConfig) {
        this.config = config;
    }

    async sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any> {
        const url = `${this.config.baseUrl}/message/sendText/${this.config.instanceName}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': this.config.apiKey,
            },
            body: JSON.stringify({
                number: to,
                text: content,
                quoted: options?.quotedMessageId ? { key: { id: options.quotedMessageId } } : undefined,
                mentions: options?.mentions
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Evolution API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    async fetchHistory(limit: number = 50): Promise<any[]> {
        // Evolution typically allows fetching messages by chat. Fetching ALL history might require different endpoint.
        // This is a placeholder for the endpoint /chat/findMessages
        const url = `${this.config.baseUrl}/chat/findMessages/${this.config.instanceName}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': this.config.apiKey,
            },
            body: JSON.stringify({
                where: {},
                limit: limit
            })
        });

        if (!response.ok) return [];
        const data = await response.json();
        return data.messages || []; // Adjust based on actual response structure
    }
}