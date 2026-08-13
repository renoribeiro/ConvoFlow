/**
 * Filtros rápidos da lista de conversas (as "pílulas" no estilo WhatsApp).
 *
 * `conversations` não tem coluna `status`, então cada pílula é traduzida de uma
 * de duas formas:
 *
 *   - "Não lidas" e "Arquivadas" viram filtro DE SERVIDOR (`unread_count > 0` e
 *     `is_archived`), porque são colunas reais. Assim a paginação por cursor
 *     continua trazendo o conjunto certo página após página.
 *   - "Aguardando" e "Em atendimento" são níveis DERIVADOS (a regra vive em
 *     `conversationGroups.ts` e não é duplicada aqui), então só podem ser
 *     aplicados no cliente, sobre o que já foi carregado.
 */

import {
  resolveAttendanceGroup,
  type AttendanceGroup,
  type AttendanceInput,
} from './conversationGroups';

export type QuickFilterType =
  | 'todas'
  | 'nao-lidas'
  | 'aguardando'
  | 'em-atendimento'
  | 'arquivadas';

export const QUICK_FILTERS: ReadonlyArray<{ id: QuickFilterType; label: string; hint: string }> = [
  { id: 'todas', label: 'Todas', hint: 'Todas as conversas ativas.' },
  { id: 'nao-lidas', label: 'Não lidas', hint: 'Conversas com mensagens ainda não lidas.' },
  { id: 'aguardando', label: 'Aguardando', hint: 'O cliente falou por último e ainda não foi respondido.' },
  { id: 'em-atendimento', label: 'Em atendimento', hint: 'Você respondeu por último e a conversa se mexeu nas últimas 24h.' },
  { id: 'arquivadas', label: 'Arquivadas', hint: 'Conversas arquivadas.' },
] as const;

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

/** Predicado do lado do cliente. Só as pílulas derivadas descartam algo aqui. */
export function matchesQuickFilter(
  conversation: AttendanceInput,
  quickFilter: QuickFilterType,
  now: Date = new Date(),
): boolean {
  const required = ATTENDANCE_BY_FILTER[quickFilter];
  if (!required) return true;
  return resolveAttendanceGroup(conversation, now) === required;
}

/** Aplica o recorte derivado preservando a ordem que veio da query. */
export function applyQuickFilter<T extends AttendanceInput>(
  conversations: T[],
  quickFilter: QuickFilterType,
  now: Date = new Date(),
): T[] {
  if (!ATTENDANCE_BY_FILTER[quickFilter]) return conversations;
  return conversations.filter((conversation) => matchesQuickFilter(conversation, quickFilter, now));
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
  conversations: AttendanceInput[],
  scope: QuickFilterScope,
  now: Date = new Date(),
): QuickFilterCounts {
  // Universo dos arquivados: só sabemos o total deles.
  if (scope.isArchived) return { arquivadas: conversations.length };
  // Universo já recortado por não lidas: idem.
  if (scope.hasUnread) return { 'nao-lidas': conversations.length };

  let naoLidas = 0;
  let aguardando = 0;
  let emAtendimento = 0;

  for (const conversation of conversations) {
    if ((conversation.unread_count ?? 0) > 0) naoLidas += 1;
    const group = resolveAttendanceGroup(conversation, now);
    if (group === 'waiting') aguardando += 1;
    else if (group === 'in_progress') emAtendimento += 1;
  }

  return {
    todas: conversations.length,
    'nao-lidas': naoLidas,
    aguardando,
    'em-atendimento': emAtendimento,
  };
}
