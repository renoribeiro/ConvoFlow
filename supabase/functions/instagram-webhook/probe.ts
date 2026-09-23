// =============================================================================
// probe.ts — o que a sonda do Instagram precisa saber sobre UMA entrega,
// sem I/O (mesma convenção de `_shared/meta-webhook-delivery.ts`).
// =============================================================================
//
// Esta fatia é uma SONDA, não uma funcionalidade. Ela existe para responder
// UMA pergunta que a documentação da Meta não responde: qual segredo assina a
// entrega de webhook do Instagram no caminho "Instagram API with Instagram
// login" — o segredo do app de Instagram (1445899737404624), o segredo do app
// principal, ou nenhum dos dois.
//
// Tudo o que está aqui é função pura: entra um payload, sai uma descrição de
// FORMATO. Nenhuma linha daqui devolve conteúdo de mensagem. É de propósito, e
// é testado em `src/lib/instagramWebhookProbe.test.ts` — inclusive o teste que
// afirma que o texto da mensagem NUNCA aparece no resumo.
//
// ⚠️ NOMES DE CAMPO: o `EdgeLogger` (_shared/logger.ts) censura qualquer chave
// cujo NOME contenha 'token', 'secret', 'key', 'apikey', 'password' ou
// 'authorization' — a chave vira '***'. Por isso nada aqui se chama
// `...Secret`, `...Token` ou `keys`: o campo sairia mascarado no log e a sonda
// não responderia nada. Se acrescentar campo, confira essa lista antes.
// =============================================================================

import { verifyMetaSignature } from '../_shared/cryptoSignature.ts';

// -----------------------------------------------------------------------------
// 1. Os candidatos a segredo
// -----------------------------------------------------------------------------

/**
 * Os três candidatos, NA ORDEM em que a sonda os recebe. São nomes de variável
 * de ambiente, nunca valores.
 *
 *   instagram      → INSTAGRAM_APP_SECRET       (o app de Instagram, novo)
 *   meta           → META_APP_SECRET            (o app principal, do WhatsApp)
 *   meta_secondary → META_APP_SECRET_SECONDARY  (slot de rotação de app do WhatsApp)
 *
 * O terceiro entra por completude: se ele ainda estiver preenchido desde a
 * troca de app de setembro, queremos saber — tanto para a resposta quanto para
 * o inventário do que ficou para trás.
 */
export const SIGNATURE_CANDIDATES = ['instagram', 'meta', 'meta_secondary'] as const;
export type SignatureCandidate = (typeof SIGNATURE_CANDIDATES)[number];

/** Mapa candidato → booleano. Usado para "configurado?" e para "bateu?". */
export type CandidateFlags = Record<SignatureCandidate, boolean>;

const emptyFlags = (): CandidateFlags => ({ instagram: false, meta: false, meta_secondary: false });

/** Um candidato só conta se for string não vazia. */
const usable = (v: string | null | undefined): v is string => typeof v === 'string' && v.length > 0;

/**
 * Quais candidatos EXISTEM no ambiente. Responde "o segredo está configurado?"
 * sem revelar nada sobre ele — a diferença entre "não bateu" e "nem estava lá",
 * que é a primeira coisa a conferir quando a sonda diz `none`.
 */
export function configuredCandidates(values: ReadonlyArray<string | null | undefined>): CandidateFlags {
  const out = emptyFlags();
  SIGNATURE_CANDIDATES.forEach((name, i) => {
    out[name] = usable(values[i]);
  });
  return out;
}

/**
 * Quantos VALORES DISTINTOS não vazios foram configurados.
 *
 * Não é curiosidade: é a rede contra o erro de digitação que arruinaria a
 * resposta. Se o segredo do app principal for colado por engano no
 * INSTAGRAM_APP_SECRET, os dois candidatos batem ao mesmo tempo e a sonda
 * diria "instagram" sem que isso signifique coisa alguma. Com três
 * configurados e este número em 2, a leitura certa é "dois slots têm o mesmo
 * valor, confira antes de concluir".
 *
 * Devolve só a contagem — nunca qual, nunca o valor.
 */
export function distinctConfiguredCount(values: ReadonlyArray<string | null | undefined>): number {
  return new Set(values.filter(usable)).size;
}

/**
 * Testa TODOS os candidatos, um por um, e devolve quem bateu.
 *
 * Diferente de `verifyMetaSignatureAny` (que para no primeiro acerto, porque em
 * produção só interessa "é válido?"), aqui interessa o conjunto completo: um
 * acerto em mais de um candidato é o sinal de que dois slots guardam o mesmo
 * valor, e é isso que separa uma resposta de uma coincidência.
 */
export async function matchAllCandidates(
  rawBody: string,
  signatureHeader: string | null,
  values: ReadonlyArray<string | null | undefined>,
): Promise<CandidateFlags> {
  const out = emptyFlags();
  for (let i = 0; i < SIGNATURE_CANDIDATES.length; i++) {
    const secret = values[i];
    if (!usable(secret)) continue;
    out[SIGNATURE_CANDIDATES[i]] = await verifyMetaSignature(rawBody, signatureHeader, secret);
  }
  return out;
}

/** Lista dos que bateram, para uma linha de log legível. `[]` = nenhum. */
export function matchedNames(flags: CandidateFlags): SignatureCandidate[] {
  return SIGNATURE_CANDIDATES.filter((name) => flags[name]);
}

/** `sha256=` + 64 hex. Distingue "header ausente" de "header estranho". */
export function isWellFormedSignatureHeader(header: string | null): boolean {
  return typeof header === 'string' && /^sha256=[0-9a-f]{64}$/.test(header);
}

// -----------------------------------------------------------------------------
// 2. O formato da entrega
// -----------------------------------------------------------------------------

/**
 * Um item do array `messaging` (formato Messenger) descrito SEM conteúdo.
 *
 * `isEcho` é o campo mais importante da sonda depois da assinatura: o Instagram
 * devolve no MESMO campo `messages` as mensagens que o próprio negócio enviou,
 * marcadas com `is_echo: true` — inclusive as enviadas do aplicativo no celular.
 * Sem filtrar isso, a resposta do atendente entraria como mensagem do cliente.
 * Queremos ver com os próprios olhos se elas chegam, antes de escrever parser.
 */
export interface InstagramMessagingShape {
  /** Posição no array — só para correlacionar linhas do log. */
  i: number;
  /** Que tipo de evento é: message | read | reaction | postback | referral | other. */
  kind: string;
  /** NOMES dos campos presentes no item. Nunca valores. */
  fields: string[];
  hasSender: boolean;
  hasRecipient: boolean;
  /** `true`/`false` quando o campo vem; `null` quando nem existe no payload. */
  isEcho: boolean | null;
  hasMid: boolean;
  /** Tamanho do mid, não o mid. Confirma o formato sem carregar o identificador. */
  midLength: number;
  hasText: boolean;
  /** Tamanho do texto, não o texto. Separa "texto vazio" de "sem texto". */
  textLength: number;
  hasAttachments: boolean;
}

export interface InstagramEntryShape {
  /** `entry[].id` — a conta profissional que RECEBEU (o negócio), não o cliente. */
  entryId: string | null;
  /** Instagram usa `messaging` (estilo Messenger). WhatsApp usa `changes`. */
  hasMessaging: boolean;
  hasChanges: boolean;
  messagingCount: number;
  changesCount: number;
  /** `changes[].field`, se por algum motivo vier no formato do WhatsApp. */
  changeFields: string[];
  messaging: InstagramMessagingShape[];
}

export interface InstagramPayloadSummary {
  /** Esperado: 'instagram'. O WhatsApp manda 'whatsapp_business_account'. */
  object: string | null;
  entryCount: number;
  entries: InstagramEntryShape[];
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const len = (v: unknown): number => (typeof v === 'string' ? v.length : 0);

function describeMessaging(item: unknown, i: number): InstagramMessagingShape {
  const o = (item ?? {}) as Record<string, unknown>;
  const message = (o.message ?? null) as Record<string, unknown> | null;

  // O tipo do evento sai do NOME do campo presente, não de um discriminador —
  // o payload do Instagram não tem `type` como o do WhatsApp.
  let kind = 'other';
  if (message) kind = 'message';
  else if (o.read) kind = 'read';
  else if (o.reaction) kind = 'reaction';
  else if (o.postback) kind = 'postback';
  else if (o.referral) kind = 'referral';

  const echo = message && typeof message.is_echo === 'boolean' ? (message.is_echo as boolean) : null;

  return {
    i,
    kind,
    fields: Object.keys(o).sort(),
    hasSender: !!o.sender,
    hasRecipient: !!o.recipient,
    isEcho: echo,
    hasMid: !!(message && typeof message.mid === 'string'),
    midLength: len(message?.mid),
    hasText: !!(message && typeof message.text === 'string'),
    textLength: len(message?.text),
    hasAttachments: !!(message && Array.isArray(message.attachments) && message.attachments.length > 0),
  };
}

/**
 * Resumo de FORMATO de um payload de webhook, para uma linha de log por
 * entrega. Tolerante a lixo: qualquer coisa que não seja o formato esperado sai
 * como zeros e listas vazias, nunca levanta.
 */
export function summarizeInstagramPayload(payload: unknown): InstagramPayloadSummary {
  const root = (payload ?? {}) as Record<string, unknown>;
  const entries = Array.isArray(root.entry) ? root.entry : [];

  return {
    object: str(root.object),
    entryCount: entries.length,
    entries: entries.map((raw) => {
      const e = (raw ?? {}) as Record<string, unknown>;
      const messaging = Array.isArray(e.messaging) ? e.messaging : [];
      const changes = Array.isArray(e.changes) ? e.changes : [];
      return {
        entryId: str(e.id),
        hasMessaging: messaging.length > 0,
        hasChanges: changes.length > 0,
        messagingCount: messaging.length,
        changesCount: changes.length,
        changeFields: changes
          .map((c) => str((c as Record<string, unknown>)?.field))
          .filter((f): f is string => f !== null),
        messaging: messaging.map(describeMessaging),
      };
    }),
  };
}
