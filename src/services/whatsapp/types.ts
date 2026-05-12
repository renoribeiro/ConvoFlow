/**
 * Tipos compartilhados pelo adapter unificado de WhatsApp.
 * Toda interação com APIs (Evolution, WAHA, Meta Cloud) passa por aqui.
 *
 * Antes de alterar este arquivo, leia .agent/skills/{evolution-v2,waha,meta-cloud-api}/SKILL.md
 * conforme a regra registrada em CLAUDE.md "Regras Obrigatórias para Trabalho com APIs de WhatsApp".
 */

export type ProviderType = 'evolution' | 'waha' | 'official';

export interface ProviderInstance {
  id: string;
  tenantId: string;
  name: string;
  instanceKey: string;
  provider: ProviderType;
  status: 'connected' | 'disconnected' | 'connecting' | 'open' | 'close' | 'qrcode' | string;
  phoneNumber?: string | null;
  profileName?: string | null;
  profilePictureUrl?: string | null;
  /**
   * Configuração específica do provider. Forma esperada por tipo:
   *  - evolution: { baseUrl, apiKey }                       (com fallback para evolutionApiUrl/Key legados)
   *  - waha:      { baseUrl, apiKey, sessionName }
   *  - official:  { phoneNumberId, wabaId, graphApiVersion } (token fica no Vault)
   */
  connectionConfig: Record<string, unknown>;
  legacyEvolutionApiUrl?: string | null;
  legacyEvolutionApiKey?: string | null;
}

export interface ProviderCapabilities {
  groups: boolean;
  polls: boolean;
  buttons: boolean;
  lists: boolean;
  stickers: boolean;
  fetchHistory: boolean;
  templates: boolean;
  markUnread: boolean;
  pin: boolean;
  archive: boolean;
  block: boolean;
  typingIndicator: boolean;
  /**
   * Quando true, a API obriga a enviar templates pré-aprovados após 24h sem
   * mensagem do contato (caso da Meta Cloud API).
   */
  requiresTemplateOutsideWindow: boolean;
  /**
   * Quando false, o provider expõe envio direto a partir do navegador.
   * Quando true, o envio precisa passar por edge function porque o token é
   * sensível (caso da Meta — token vive no Vault).
   */
  serverSideOnlySend: boolean;
}

export type SendStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';

export interface SendResult {
  /** Identificador devolvido pela API do provider (`wamid.*`, `evt-id`, etc.). */
  providerMessageId?: string;
  status: SendStatus;
  error?: string;
}

export interface SendTextOptions {
  /** ID da mensagem citada (formato dependente do provider). */
  quotedMessageId?: string;
  /** Pré-visualização de link em mensagens de texto. */
  linkPreview?: boolean;
}

export interface SendMediaPayload {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mimeType?: string;
  fileName?: string;
  caption?: string;
  /** Apenas relevante para áudio: marca como PTT/voice note. */
  ptt?: boolean;
  quotedMessageId?: string;
}

export interface SendLocationPayload {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendReactionPayload {
  messageId: string;
  emoji: string;
}

/**
 * Erros de adapter. `code` é estável e inspecionável; UI deve mapear para
 * mensagens em PT-BR.
 */
export class WhatsAppAdapterError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INSTANCE_DISCONNECTED'
      | 'CAPABILITY_UNSUPPORTED'
      | 'SERVER_SIDE_ONLY'
      | 'INVALID_NUMBER'
      | 'OUTSIDE_24H_WINDOW'
      | 'AUTH_FAILED'
      | 'RATE_LIMITED'
      | 'NETWORK_ERROR'
      | 'UNKNOWN',
    public readonly providerType?: ProviderType,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WhatsAppAdapterError';
  }
}
