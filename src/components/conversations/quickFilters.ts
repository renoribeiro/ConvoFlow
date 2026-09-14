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
 *   - "Minhas" e "Sem responsável" olham `assigned_profile_id` (migração
 *     20260913000001). A coluna é real, mas neste passo elas recortam SÓ o que
 *     já foi carregado, como as derivadas — de propósito: não mexer na query
 *     nem nas contagens de servidor enquanto a visibilidade por pessoa não é
 *     decidida. O número delas é um piso, igual ao de "Aguardando".
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
  | 'minhas'
  | 'sem-responsavel'
  | 'nao-lidas'
  | 'aguardando'
  | 'nao-respondidas'
  | 'em-atendimento'
  | 'responsavel-indisponivel'
  | 'arquivadas';

export const QUICK_FILTERS: ReadonlyArray<{ id: QuickFilterType; label: string; hint: string }> = [
  { id: 'todas', label: 'Todas', hint: 'Todas as conversas ativas.' },
  { id: 'minhas', label: 'Minhas', hint: 'Conversas que estão com você como responsável.' },
  { id: 'sem-responsavel', label: 'Sem responsável', hint: 'Conversas que ninguém assumiu ainda.' },
  { id: 'nao-lidas', label: 'Não lidas', hint: 'Conversas com mensagens ainda não lidas.' },
  { id: 'aguardando', label: 'Aguardando', hint: 'O cliente falou por último e ainda não foi respondido.' },
  { id: 'nao-respondidas', label: 'Não respondidas', hint: 'Conversas pendentes há mais tempo que o limite configurado pela Loja.' },
  { id: 'em-atendimento', label: 'Em atendimento', hint: 'Você respondeu por último e a conversa se mexeu nas últimas 24h.' },
  // Só Gestor e Gerente veem esta: conversas presas com alguém suspenso,
  // excluído, movido de Loja ou em 0 % no rodízio. Quem alimenta é a RPC
  // loja_ineligible_owners (migração 20260915000001).
  { id: 'responsavel-indisponivel', label: 'Responsável indisponível', hint: 'Conversas cujo responsável está suspenso, excluído, fora da Loja ou em 0 % no rodízio — só o Gestor move.' },
  { id: 'arquivadas', label: 'Arquivadas', hint: 'Conversas arquivadas.' },
] as const;

/** True para a pílula reservada a quem administra a Loja. */
export function isAdminOnlyFilter(quickFilter: QuickFilterType): boolean {
  return quickFilter === 'responsavel-indisponivel';
}

/** Configuração de SLA da Loja, quando a sinalização está ligada. */
export interface SlaFilterConfig {
  enabled: boolean;
  thresholds: SlaThresholds;
}

/** O que as pílulas de responsável precisam saber de cada conversa. */
export interface OwnershipInput {
  /** profiles.id do responsável; null/ausente = sem responsável. */
  assigned_profile_id?: string | null;
}

/** Quem está olhando a lista — é o "eu" de "Minhas". */
export interface OwnershipFilterContext {
  /** profiles.id de quem está logado; null enquanto o perfil não carrega. */
  viewerProfileId: string | null;
  /**
   * profiles.id dos responsáveis INDISPONÍVEIS (suspenso, excluído, fora da
   * Loja, 0 %), vindos da RPC loja_ineligible_owners. Ausente = a pílula
   * "Responsável indisponível" não existe para quem está olhando.
   */
  ineligibleOwnerIds?: ReadonlySet<string>;
}

/** Entrada completa de uma conversa para as pílulas. */
export type QuickFilterInput = SlaInput & OwnershipInput;

/**
 * Pílulas visíveis para esta Loja. Com a sinalização de SLA desligada,
 * "Não respondidas" não aparece — não fica desabilitada, some.
 */
export function visibleQuickFilters(
  slaEnabled: boolean,
  options: { canSeeIneligible?: boolean } = {},
): typeof QUICK_FILTERS {
  return QUICK_FILTERS.filter((filter) => {
    if (filter.id === 'nao-respondidas' && !slaEnabled) return false;
    if (isAdminOnlyFilter(filter.id) && !options.canSeeIneligible) return false;
    return true;
  });
}

/**
 * Contagem de uma pílula, com o alcance dela junto.
 *
 * As pílulas não são todas do mesmo tipo, então o número delas não pode ser
 * lido do mesmo jeito:
 *
 *   - "Todas", "Não lidas" e "Arquivadas" são colunas reais, então dá para
 *     perguntar o total ao servidor: `exact: true`, é o tamanho da fila.
 *   - "Aguardando", "Não respondidas" e "Em atendimento" são derivadas de
 *     regras que só existem no cliente. Enquanto houver página por carregar, o
 *     número é um PISO, não o total: `exact: false`.
 *
 * Sem essa distinção os dois significados sairiam com a mesma cara no mesmo
 * lugar da tela — que é exatamente o problema que a contagem veio resolver.
 */
export interface QuickFilterCount {
  value: number;
  /** false = só o que já foi carregado; o total real é este número ou maior. */
  exact: boolean;
}

/** Contagem por pílula. Chave ausente = desconhecida no conjunto carregado. */
export type QuickFilterCounts = Partial<Record<QuickFilterType, QuickFilterCount>>;

/**
 * Pílulas cujo total o servidor sabe responder, porque são coluna de verdade
 * em `conversations` (`is_archived`, `unread_count`).
 *
 * As outras três dependem de `conversationGroups.ts` / `slaLevels.ts`. Traduzir
 * essas regras para filtro do PostgREST criaria uma segunda fonte da verdade
 * para uma regra que já mostrou ser sutil (o 'incoming' que a normalização de
 * direção conserta) — e as duas cópias iam divergir na primeira mudança.
 */
export const SERVER_COUNTED_FILTERS: ReadonlyArray<QuickFilterType> = [
  'todas',
  'nao-lidas',
  'arquivadas',
] as const;

export function isServerCountedFilter(quickFilter: QuickFilterType): boolean {
  return SERVER_COUNTED_FILTERS.includes(quickFilter);
}

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

/** Pílulas de responsável: recorte no cliente, sobre o que já foi carregado. */
function isOwnershipFilter(quickFilter: QuickFilterType): boolean {
  return quickFilter === 'minhas' || quickFilter === 'sem-responsavel' || isAdminOnlyFilter(quickFilter);
}

/** True para as pílulas que só existem como regra no cliente. */
function isDerivedFilter(quickFilter: QuickFilterType): boolean {
  return (
    quickFilter === 'nao-respondidas' ||
    isOwnershipFilter(quickFilter) ||
    !!ATTENDANCE_BY_FILTER[quickFilter]
  );
}

/** Predicado do lado do cliente. Só as pílulas derivadas descartam algo aqui. */
export function matchesQuickFilter(
  conversation: QuickFilterInput,
  quickFilter: QuickFilterType,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
  ownership?: OwnershipFilterContext,
): boolean {
  if (quickFilter === 'minhas') {
    // Sem perfil carregado nada é "meu" — a lista fica vazia em vez de mentir.
    const viewer = ownership?.viewerProfileId ?? null;
    return !!viewer && conversation.assigned_profile_id === viewer;
  }
  if (quickFilter === 'sem-responsavel') {
    return !conversation.assigned_profile_id;
  }
  if (quickFilter === 'responsavel-indisponivel') {
    // Sem a lista (ainda carregando, ou quem olha não é gestor) nada é "indisponível".
    const ids = ownership?.ineligibleOwnerIds;
    return !!ids && !!conversation.assigned_profile_id && ids.has(conversation.assigned_profile_id);
  }

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
export function applyQuickFilter<T extends QuickFilterInput>(
  conversations: T[],
  quickFilter: QuickFilterType,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
  ownership?: OwnershipFilterContext,
): T[] {
  if (!isDerivedFilter(quickFilter)) return conversations;
  if (quickFilter === 'nao-respondidas' && !sla?.enabled) return conversations;
  return conversations.filter((conversation) =>
    matchesQuickFilter(conversation, quickFilter, now, sla, ownership),
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
 * `allLoaded` diz se a última página já chegou. Com ela falsa, todo número
 * daqui é um piso — a contagem sai marcada `exact: false` e a pílula mostra
 * isso. Com ela verdadeira, o conjunto carregado É a fila inteira e o número
 * vira exato sem precisar perguntar nada ao servidor.
 *
 * As chaves de `SERVER_COUNTED_FILTERS` continuam saindo daqui como fallback:
 * valem enquanto a contagem do servidor não chega (ou se ela falhar), e são
 * sobrescritas por `mergeServerTotals` assim que chega.
 */
export function buildQuickFilterCounts(
  conversations: QuickFilterInput[],
  scope: QuickFilterScope,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
  allLoaded: boolean = false,
  ownership?: OwnershipFilterContext,
): QuickFilterCounts {
  const conta = (value: number): QuickFilterCount => ({ value, exact: allLoaded });

  // Universo dos arquivados: só sabemos o total deles.
  if (scope.isArchived) return { arquivadas: conta(conversations.length) };
  // Universo já recortado por não lidas: idem.
  if (scope.hasUnread) return { 'nao-lidas': conta(conversations.length) };

  const viewer = ownership?.viewerProfileId ?? null;
  const ineligible = ownership?.ineligibleOwnerIds;

  let naoLidas = 0;
  let aguardando = 0;
  let emAtendimento = 0;
  let naoRespondidas = 0;
  let minhas = 0;
  let semResponsavel = 0;
  let indisponivel = 0;

  for (const conversation of conversations) {
    if ((conversation.unread_count ?? 0) > 0) naoLidas += 1;
    const group = resolveAttendanceGroup(conversation, now);
    if (group === 'waiting') aguardando += 1;
    else if (group === 'in_progress') emAtendimento += 1;
    if (sla?.enabled && resolveSlaLevel(conversation, sla.thresholds, now) !== 'ok') {
      naoRespondidas += 1;
    }
    if (!conversation.assigned_profile_id) semResponsavel += 1;
    else if (viewer && conversation.assigned_profile_id === viewer) minhas += 1;
    if (ineligible && conversation.assigned_profile_id && ineligible.has(conversation.assigned_profile_id)) {
      indisponivel += 1;
    }
  }

  const counts: QuickFilterCounts = {
    todas: conta(conversations.length),
    minhas: conta(minhas),
    'sem-responsavel': conta(semResponsavel),
    'nao-lidas': conta(naoLidas),
    aguardando: conta(aguardando),
    'em-atendimento': conta(emAtendimento),
  };

  // Com o SLA desligado a chave nem é publicada — a pílula não existe.
  if (sla?.enabled) counts['nao-respondidas'] = conta(naoRespondidas);
  // Idem para quem não administra a Loja: sem a lista, sem a chave.
  if (ineligible) counts['responsavel-indisponivel'] = conta(indisponivel);

  return counts;
}

/**
 * Sobrepõe os totais vindos do servidor às contagens do conjunto carregado.
 *
 * Só as chaves de `SERVER_COUNTED_FILTERS` são aceitas, e só com número
 * definido — uma contagem ainda carregando (ou que falhou) devolve `undefined`
 * e a pílula segue com o piso do conjunto carregado, marcado como tal, em vez
 * de piscar ou mentir um total.
 */
export function mergeServerTotals(
  loaded: QuickFilterCounts,
  totals: Partial<Record<QuickFilterType, number | undefined>>,
): QuickFilterCounts {
  const merged: QuickFilterCounts = { ...loaded };

  for (const id of SERVER_COUNTED_FILTERS) {
    const total = totals[id];
    if (typeof total === 'number') {
      merged[id] = { value: total, exact: true };
    }
  }

  return merged;
}
