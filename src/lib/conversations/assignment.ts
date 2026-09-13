/**
 * Responsável por conversa — regras puras e as duas escritas (assumir e
 * transferir), sem React. O hook `useConversationAssignment` só embrulha isto
 * com cache, toast e a identidade de quem está logado.
 *
 * O que existe no banco (migração 20260913000001): três colunas em
 * `conversations` — `assigned_profile_id`, `assigned_at`, `assigned_by`. NULL
 * nas três = ninguém assumiu. Não há status, fila nem restrição de leitura:
 * todo mundo da Loja continua vendo todas as conversas.
 *
 * CONCORRÊNCIA — a lista se atualiza a cada 30 s, então duas pessoas podem
 * clicar "Assumir" na mesma conversa dentro dessa janela. `assumeConversation`
 * resolve isso no próprio UPDATE: a condição `assigned_profile_id IS NULL` vai
 * junto no WHERE, e o PostgreSQL só atualiza a linha se ela AINDA estiver sem
 * responsável no instante da escrita. Quem chega depois recebe zero linhas —
 * e aí lemos a conversa de novo para dizer QUEM ficou com ela. Nada de
 * realtime: é a semântica do banco fazendo o trabalho.
 */

export interface AssignmentFields {
  assigned_profile_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
}

export interface AssignmentPatch {
  assigned_profile_id: string;
  assigned_at: string;
  assigned_by: string;
}

/**
 * As três colunas gravadas juntas, sempre. `assigned_by === assigned_profile_id`
 * é o que distingue "assumi para mim" de "alguém me transferiu" — o trigger que
 * avisa o sino usa exatamente essa comparação para não notificar quem assumiu
 * sozinho.
 */
export const buildAssignmentPatch = (
  toProfileId: string,
  byProfileId: string,
  now: Date = new Date(),
): AssignmentPatch => ({
  assigned_profile_id: toProfileId,
  assigned_at: now.toISOString(),
  assigned_by: byProfileId,
});

/** Sem responsável = a coluna nula (ou ausente, enquanto a migração não roda). */
export const isUnassigned = (
  conversation: Partial<Pick<AssignmentFields, 'assigned_profile_id'>> | null | undefined,
): boolean => !conversation?.assigned_profile_id;

/** True quando a conversa está com o perfil informado. */
export const isAssignedTo = (
  conversation: Partial<Pick<AssignmentFields, 'assigned_profile_id'>> | null | undefined,
  profileId: string | null | undefined,
): boolean => !!profileId && conversation?.assigned_profile_id === profileId;

// ---------------------------------------------------------------------------
// Escritas. O cliente é descrito pelo mínimo que estas duas funções usam, para
// o teste poder passar um dublê e afirmar exatamente o que foi pedido ao banco.
// ---------------------------------------------------------------------------

export interface DbError {
  code?: string | null;
  message?: string | null;
}

interface UpdateResult {
  data: Array<{ id: string }> | null;
  error: DbError | null;
}

interface ReadResult {
  data: { assigned_profile_id: string | null } | null;
  error: DbError | null;
}

export interface GuardedUpdateChain {
  eq(column: string, value: string): GuardedUpdateChain;
  is(column: string, value: null): GuardedUpdateChain;
  select(columns: string): PromiseLike<UpdateResult>;
}

export interface ReadChain {
  eq(column: string, value: string): ReadChain;
  maybeSingle(): PromiseLike<ReadResult>;
}

export interface ConversationsClient {
  from(table: 'conversations'): {
    update(patch: AssignmentPatch): GuardedUpdateChain;
    select(columns: string): ReadChain;
  };
}

export type AssumeResult =
  | { status: 'assigned' }
  /**
   * O UPDATE não pegou nenhuma linha: alguém assumiu antes. `holderProfileId`
   * é quem está com a conversa AGORA (null se, entre a escrita e a leitura,
   * ela voltou a ficar sem responsável — ou se sumiu do alcance do usuário).
   */
  | { status: 'taken'; holderProfileId: string | null };

export interface AssumeArgs {
  conversationId: string;
  tenantId: string;
  /** profiles.id de quem está assumindo. */
  profileId: string;
  now?: Date;
}

/**
 * Assume uma conversa SEM responsável. Se ela já tiver um, não sobrescreve —
 * devolve `taken` com quem ficou. Para trocar de mãos, use
 * `transferConversation`.
 */
export async function assumeConversation(
  client: ConversationsClient,
  { conversationId, tenantId, profileId, now }: AssumeArgs,
): Promise<AssumeResult> {
  const { data, error } = await client
    .from('conversations')
    .update(buildAssignmentPatch(profileId, profileId, now))
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    // A guarda de concorrência: só escreve se AINDA estiver sem responsável.
    .is('assigned_profile_id', null)
    .select('id');

  if (error) throw error;
  if (data && data.length > 0) return { status: 'assigned' };

  // Zero linhas: outra pessoa chegou primeiro. Lê de novo para dizer quem.
  const { data: row, error: readError } = await client
    .from('conversations')
    .select('assigned_profile_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (readError) throw readError;
  return { status: 'taken', holderProfileId: row?.assigned_profile_id ?? null };
}

export interface TransferArgs {
  conversationId: string;
  tenantId: string;
  /** profiles.id de quem vai receber. */
  toProfileId: string;
  /** profiles.id de quem está transferindo. */
  byProfileId: string;
  now?: Date;
}

/**
 * Transfere (ou atribui) a conversa a alguém, com ou sem responsável atual —
 * grava as três colunas de uma vez. Quem recebe é avisado no sino pelo
 * trigger `trg_notify_conversation_assigned`, no banco, na mesma transação;
 * o front não insere notificação nenhuma.
 */
export async function transferConversation(
  client: ConversationsClient,
  { conversationId, tenantId, toProfileId, byProfileId, now }: TransferArgs,
): Promise<{ status: 'transferred' }> {
  const { data, error } = await client
    .from('conversations')
    .update(buildAssignmentPatch(toProfileId, byProfileId, now))
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .select('id');

  if (error) throw error;
  // Um UPDATE que o RLS filtra devolve 204 sem erro. Sem esta checagem a tela
  // diria "transferida" e nada teria acontecido.
  if (!data || data.length === 0) {
    throw new Error('Conversa não encontrada ou fora do seu alcance.');
  }
  return { status: 'transferred' };
}
