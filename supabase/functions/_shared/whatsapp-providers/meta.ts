import { IWhatsAppProvider, ProviderConfig, SendMessageOptions } from './base.ts';

export interface MetaProviderConfig extends ProviderConfig {
    phoneNumberId: string;
    wabaId?: string;
    accessToken: string;
    graphApiVersion?: string;
}

export class MetaProvider implements IWhatsAppProvider {
    private config: MetaProviderConfig;
    private graphRoot: string;

    constructor(config: MetaProviderConfig) {
        this.config = config;
        const version = config.graphApiVersion || 'v20.0';
        this.graphRoot = `https://graph.facebook.com/${version}`;
    }

    private formatTo(phone: string): string {
        return phone.replace(/\D/g, '');
    }

    async sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any> {
        const url = `${this.graphRoot}/${this.config.phoneNumberId}/messages`;

        const body: Record<string, any> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatTo(to),
            type: 'text',
            text: { body: content, preview_url: false },
        };

        if (options?.quotedMessageId) {
            body.context = { message_id: options.quotedMessageId };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Send media via Meta Cloud API.
     * The media must be accessible via a public URL or pre-uploaded to Meta's
     * media endpoint. We use the link-by-URL approach (supported since Graph v13).
     *
     * TODO: Meta Cloud API media-send is not yet validated against
     * .agent/skills/meta-cloud-api/SKILL.md — add full validation when that
     * SKILL file is available. Current implementation follows the documented
     * Graph API pattern for sending media messages by URL link.
     */
    async sendMedia(
        to: string,
        mediaUrl: string,
        options: { caption?: string; mediaType: 'image' | 'video' | 'document' | 'audio'; fileName?: string },
    ): Promise<any> {
        const { caption, mediaType, fileName } = options;
        const url = `${this.graphRoot}/${this.config.phoneNumberId}/messages`;

        const mediaObj: Record<string, string> = { link: mediaUrl };
        if (caption) mediaObj.caption = caption;
        if (fileName && (mediaType === 'document' || mediaType === 'audio')) {
            mediaObj.filename = fileName;
        }

        const body: Record<string, any> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatTo(to),
            type: mediaType,
            [mediaType]: mediaObj,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Meta Cloud API does not expose a public endpoint to fetch historical
     * conversations — incoming messages must be received via webhook events.
     * Returning an empty array keeps the IWhatsAppProvider contract.
     */
    async fetchHistory(_limit: number = 50): Promise<any[]> {
        return [];
    }
}
