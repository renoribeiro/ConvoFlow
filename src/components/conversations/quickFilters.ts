/**
 * Filtros rápidos da lista de conversas (as "pílulas" no estilo WhatsApp).
 *
 * `conversations` não tem coluna `status`, então cada pílula é traduzida de uma
 * de duas formas:
 *
 *   - "Não lidas" e "Arquivadas" viram filtro DE SERVIDOR (`unread_count > 0` e
 *     `is_archived`), porque são colunas reais. Assim a paginação por cursor
 *     continua trazendo o conjunto certo página após página.
 *   - "Aguardando", "Não respondidas" e "Em atendimento" são níveis DERIVADOS
 *     (as regras vivem em `conversationGroups.ts` e `slaLevels.ts` e não são
 *     duplicadas aqui), então só podem ser aplicados no cliente, sobre o que já
 *     foi carregado.
 *
 * "Não respondidas" ainda depende da Loja ter ligado a sinalização de SLA — com
 * ela desligada a pílula não existe (ver `visibleQuickFilters`).
 */

import {
  resolveAttendanceGroup,
  type AttendanceGroup,
  type AttendanceInput,
} from './conversationGroups';
import { resolveSlaLevel, type SlaInput, type SlaThresholds } from './slaLevels';

export type QuickFilterType =
  | 'todas'
  | 'nao-lidas'
  | 'aguardando'
  | 'nao-respondidas'
  | 'em-atendimento'
  | 'arquivadas';

export const QUICK_FILTERS: ReadonlyArray<{ id: QuickFilterType; label: string; hint: string }> = [
  { id: 'todas', label: 'Todas', hint: 'Todas as conversas ativas.' },
  { id: 'nao-lidas', label: 'Não lidas', hint: 'Conversas com mensagens ainda não lidas.' },
  { id: 'aguardando', label: 'Aguardando', hint: 'O cliente falou por último e ainda não foi respondido.' },
  { id: 'nao-respondidas', label: 'Não respondidas', hint: 'Conversas pendentes há mais tempo que o limite configurado pela Loja.' },
  { id: 'em-atendimento', label: 'Em atendimento', hint: 'Você respondeu por último e a conversa se mexeu nas últimas 24h.' },
  { id: 'arquivadas', label: 'Arquivadas', hint: 'Conversas arquivadas.' },
] as const;

/** Configuração de SLA da Loja, quando a sinalização está ligada. */
export interface SlaFilterConfig {
  enabled: boolean;
  thresholds: SlaThresholds;
}

/**
 * Pílulas visíveis para esta Loja. Com a sinalização de SLA desligada,
 * "Não respondidas" não aparece — não fica desabilitada, some.
 */
export function visibleQuickFilters(slaEnabled: boolean): typeof QUICK_FILTERS {
  if (slaEnabled) return QUICK_FILTERS;
  return QUICK_FILTERS.filter((filter) => filter.id !== 'nao-respondidas');
}

/** Contagem por pílula. Chave ausente = desconhecida no conjunto carregado. */
export type QuickFilterCounts = Partial<Record<QuickFilterType, number>>;

/** Nível de atendimento exigido por cada pílula — só as derivadas aparecem. */
const ATTENDANCE_BY_FILTER: Partial<Record<QuickFilterType, AttendanceGroup>> = {
  aguardando: 'waiting',
  'em-atendimento': 'in_progress',
};

/** Recorte que a query aceita hoje (colunas reais de `conversations`). */
export interface QuickFilterScope {
  hasUnread: boolean;
  isArchived: boolean;
}

/**
 * Compõe a pílula ativa com o que veio do modal "Filtros".
 *
 * Desempate: só "Arquivadas" sobrescreve o modal — a pílula vence. As demais
 * apenas somam ao que o modal pediu, para não desfazer escolha do usuário sem
 * ele perceber.
 */
export function resolveQuickFilterScope(
  quickFilter: QuickFilterType,
  modal: QuickFilterScope,
): QuickFilterScope {
  return {
    hasUnread: quickFilter === 'nao-lidas' ? true : modal.hasUnread,
    isArchived: quickFilter === 'arquivadas' ? true : modal.isArchived,
  };
}

/** True para as pílulas que só existem como regra no cliente. */
function isDerivedFilter(quickFilter: QuickFilterType): boolean {
  return quickFilter === 'nao-respondidas' || !!ATTENDANCE_BY_FILTER[quickFilter];
}

/** Predicado do lado do cliente. Só as pílulas derivadas descartam algo aqui. */
export function matchesQuickFilter(
  conversation: SlaInput,
  quickFilter: QuickFilterType,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
): boolean {
  if (quickFilter === 'nao-respondidas') {
    // Sem SLA ligado a pílula nem aparece; se chegar aqui (estado antigo na
    // tela), não recorta nada em vez de esvaziar a lista.
    if (!sla?.enabled) return true;
    return resolveSlaLevel(conversation, sla.thresholds, now) !== 'ok';
  }

  const required = ATTENDANCE_BY_FILTER[quickFilter];
  if (!required) return true;
  return resolveAttendanceGroup(conversation, now) === required;
}

/** Aplica o recorte derivado preservando a ordem que veio da query. */
export function applyQuickFilter<T extends SlaInput>(
  conversations: T[],
  quickFilter: QuickFilterType,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
): T[] {
  if (!isDerivedFilter(quickFilter)) return conversations;
  if (quickFilter === 'nao-respondidas' && !sla?.enabled) return conversations;
  return conversations.filter((conversation) =>
    matchesQuickFilter(conversation, quickFilter, now, sla),
  );
}

/**
 * Contagens tiradas do que já está em memória — sem query extra.
 *
 * O conjunto carregado muda junto com o recorte de servidor ativo, então só dá
 * para contar aquilo que esse recorte cobre. As chaves não cobertas ficam de
 * fora do retorno e quem chama mantém o último valor conhecido, em vez de
 * exibir um zero mentiroso.
 *
 * Limitação assumida: conta apenas as páginas já carregadas, como o
 * agrupamento por nível de atendimento já fazia.
 */
export function buildQuickFilterCounts(
  conversations: SlaInput[],
  scope: QuickFilterScope,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
): QuickFilterCounts {
  // Universo dos arquivados: só sabemos o total deles.
  if (scope.isArchived) return { arquivadas: conversations.length };
  // Universo já recortado por não lidas: idem.
  if (scope.hasUnread) return { 'nao-lidas': conversations.length };

  let naoLidas = 0;
  let aguardando = 0;
  let emAtendimento = 0;
  let naoRespondidas = 0;

  for (const conversation of conversations) {
    if ((conversation.unread_count ?? 0) > 0) naoLidas += 1;
    const group = resolveAttendanceGroup(conversation, now);
    if (group === 'waiting') aguardando += 1;
    else if (group === 'in_progress') emAtendimento += 1;
    if (sla?.enabled && resolveSlaLevel(conversation, sla.thresholds, now) !== 'ok') {
      naoRespondidas += 1;
    }
  }

  const counts: QuickFilterCounts = {
    todas: conversations.length,
    'nao-lidas': naoLidas,
    aguardando,
    'em-atendimento': emAtendimento,
  };

  // Com o SLA desligado a chave nem é publicada — a pílula não existe.
  if (sla?.enabled) counts['nao-respondidas'] = naoRespondidas;

  return counts;
}
