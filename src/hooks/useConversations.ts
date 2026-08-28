import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';

interface Contact {
  id: string;
  name: string;
  phone: string;
  lead_source_id?: string;
  current_stage_id?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  stage?: {
    name: string;
  };
  lead_sources?: {
    name: string;
  };
  contact_tags?: Array<{
    tag_id: string;
    tags: {
      id: string;
      name: string;
      color: string;
    } | null;
  }>;
}

interface Conversation {
  id: string;
  contact_id: string;
  last_message_at: string;
  unread_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  contacts: Contact;
  /**
   * Prévia da última mensagem. `undefined` = conversa sem mensagem nenhuma.
   *
   * Contrato inalterado para quem lê (ConversationsList). Só o `created_at` que
   * o código antigo carregava saiu: a lista sempre usou `last_message_at` da
   * própria conversa para o horário, e nunca leu esse campo.
   */
  last_message?: {
    content: string | null;
    direction: 'inbound' | 'outbound';
    message_type: string;
    status?: string | null;
  };
}

interface ConversationsPage {
  data: Conversation[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Colunas desnormalizadas da última mensagem, mantidas pela trigger
 * `update_conversation_on_message` (AFTER INSERT em `messages`).
 *
 * Antes disto a lista buscava a última mensagem de CADA conversa em uma query
 * separada — 1 + 20 idas ao servidor por página, repetidas a cada 10s pelo
 * polling. Lendo as quatro colunas junto com a conversa, a página inteira volta
 * a ser 1 query.
 */
const LAST_MESSAGE_COLUMNS = `last_message_content,
          last_message_direction,
          last_message_status,
          last_message_type,
          `;

/** Linha crua da conversa; as colunas novas podem não existir ainda no banco. */
interface LastMessageColumns {
  last_message_content?: string | null;
  last_message_direction?: string | null;
  last_message_status?: string | null;
  last_message_type?: string | null;
}

type ConversationRow = Omit<Conversation, 'last_message'> & LastMessageColumns;

/**
 * Traduz a direção vinda do banco para o vocabulário do front.
 *
 * O banco aceita 'incoming' como sinônimo histórico de 'inbound' (a trigger
 * sempre casou `IN ('inbound','incoming')`), mas aqui a união é
 * 'inbound' | 'outbound' e TODO leitor testa `!== 'inbound'` — agrupamento por
 * atendimento, nível de SLA, pílulas de filtro e o ícone de confirmação. Um
 * 'incoming' sem normalizar seria lido como mensagem NOSSA e a conversa sairia
 * da fila de trabalho sem ninguém perceber.
 *
 * Espelha o CASE da trigger: qualquer valor que não seja entrada conta como
 * saída. Vazio/ausente significa "conversa sem mensagem".
 */
export const normalizeLastMessageDirection = (
  value: unknown,
): 'inbound' | 'outbound' | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value === 'inbound' || value === 'incoming' ? 'inbound' : 'outbound';
};

/**
 * Monta `last_message` a partir das colunas desnormalizadas.
 *
 * Devolve `undefined` quando a conversa não tem mensagem — é o mesmo valor que
 * o código antigo produzia quando a busca não achava nada. A lista mostra
 * "Nenhuma mensagem" e, por aplicar `?? 'inbound'` na direção, mantém a conversa
 * no grupo "Aguardando".
 *
 * A direção é a sentinela de "existe mensagem": a trigger e o backfill sempre a
 * preenchem, enquanto conteúdo, status e tipo podem ser nulos legitimamente
 * (mídia sem legenda, por exemplo).
 */
export const mapLastMessage = (
  row: LastMessageColumns | null | undefined,
): Conversation['last_message'] => {
  const direction = normalizeLastMessageDirection(row?.last_message_direction);
  if (!direction) return undefined;

  return {
    content: row?.last_message_content ?? null,
    direction,
    message_type: row?.last_message_type ?? 'text',
    status: row?.last_message_status ?? null,
  };
};

/**
 * As migrações deste projeto são aplicadas à mão, então o frontend pode subir
 * antes do SQL. Sem tratamento, pedir colunas inexistentes faz o PostgREST
 * responder 42703 e a lista INTEIRA some da tela.
 *
 * Detectando o caso, repetimos a query sem as colunas novas: a lista aparece
 * sem prévia até a migração rodar, em vez de quebrar.
 */
export type SupabaseQueryError = { code?: string | null; message?: string | null } | null;

export const isMissingLastMessageColumnsError = (
  error: SupabaseQueryError | undefined,
): boolean => {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /last_message_(content|direction|status|type)/.test(error.message ?? '');
};

/** Vira false na primeira resposta 42703 e não tenta de novo nesta sessão. */
let lastMessageColumnsAvailable = true;

interface UseConversationsOptions {
  pageSize?: number;
  searchQuery?: string;
  isArchived?: boolean;
  enabled?: boolean;
  whatsappInstanceId?: string;
  /** Quando true, traz apenas conversas com unread_count > 0. */
  hasUnread?: boolean;
  /** Filtro por janela de tempo (last_message_at). */
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

// Hook para buscar conversas com paginação infinita
export const useConversations = ({
  pageSize = 20,
  searchQuery = '',
  isArchived = false,
  enabled = true,
  whatsappInstanceId,
  hasUnread = false,
  dateFrom = null,
  dateTo = null,
}: UseConversationsOptions = {}) => {
  const { tenant } = useTenant();

  return useInfiniteQuery({
    queryKey: [
      'conversations',
      tenant?.id,
      whatsappInstanceId,
      searchQuery,
      isArchived,
      pageSize,
      hasUnread,
      dateFrom?.toISOString() ?? null,
      dateTo?.toISOString() ?? null,
    ],
    queryFn: async ({ pageParam = null }) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const term = searchQuery.trim();

      // O PostgREST só descarta a linha-pai por causa de um filtro no embed
      // quando o join é `!inner`. Sem essa dica o `.or()` abaixo era aplicado
      // apenas ao embed e a busca devolvia a lista inteira. Fora da busca o
      // embed continua LEFT, para não sumir com conversas cujo contato não
      // veio junto.
      const contactsEmbed = term ? 'contacts!inner' : 'contacts';

      // Uma única query monta a página inteira, prévia incluída. `comPrevia`
      // existe só para o caso da migração ainda não ter rodado (ver
      // `isMissingLastMessageColumnsError`).
      const executarQuery = async (
        comPrevia: boolean,
      ): Promise<{ data: ConversationRow[] | null; error: SupabaseQueryError }> => {
        let query = supabase
          .from('conversations')
          .select(`
            id,
            contact_id,
            last_message_at,
            unread_count,
            is_archived,
            created_at,
            updated_at,
            tenant_id,
            ${comPrevia ? LAST_MESSAGE_COLUMNS : ''}${contactsEmbed} (
              id,
              name,
              phone,
              avatar_url,
              lead_source_id,
              current_stage_id,
              last_interaction_at,
              created_at,
              updated_at,
              tenant_id,
              stage:funnel_stages!contacts_current_stage_id_fkey (
                name
              ),
              lead_sources:lead_source_id (
                name
              ),
              contact_tags (
                tag_id,
                tags (
                  id,
                  name,
                  color
                )
              )
            )
          `)
          .eq('tenant_id', tenant.id)
          .eq('is_archived', isArchived)
          .order('last_message_at', { ascending: false })
          .limit(pageSize);

        // Only filter by instance if explicitly specified
        if (whatsappInstanceId) {
          query = query.eq('whatsapp_instance_id', whatsappInstanceId);
        }

        // Aplicar filtro de busca — o `.or()` vai no recurso embutido (`contacts`)
        // e, com o join inner acima, recorta as conversas. O valor vai entre aspas
        // porque nome e telefone podem conter vírgula e parênteses, que são
        // separadores na gramática de filtros do PostgREST.
        if (term) {
          const escaped = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          query = query.or(
            `name.ilike."%${escaped}%",phone.ilike."%${escaped}%"`,
            { referencedTable: 'contacts' }
          );
        }

        if (hasUnread) {
          query = query.gt('unread_count', 0);
        }
        if (dateFrom) {
          query = query.gte('last_message_at', dateFrom.toISOString());
        }
        if (dateTo) {
          query = query.lte('last_message_at', dateTo.toISOString());
        }

        // Aplicar cursor para paginação
        if (pageParam) {
          query = query.lt('last_message_at', pageParam);
        }

        const { data, error } = await query;
        return {
          data: data as unknown as ConversationRow[] | null,
          error: error as SupabaseQueryError,
        };
      };

      let { data, error } = await executarQuery(lastMessageColumnsAvailable);

      // Migração ainda não aplicada: repete sem as colunas novas para a lista
      // aparecer sem prévia, em vez de sumir inteira da tela.
      if (error && lastMessageColumnsAvailable && isMissingLastMessageColumnsError(error)) {
        lastMessageColumnsAvailable = false;
        logger.warn(
          'Colunas de prévia da última mensagem ausentes em conversations. A lista segue sem prévia até a migração ser aplicada.',
          { code: error.code },
        );
        ({ data, error } = await executarQuery(false));
      }

      if (error) {
        throw error;
      }

      const conversations = data || [];
      const hasMore = conversations.length === pageSize;
      const nextCursor = hasMore && conversations.length > 0
        ? conversations[conversations.length - 1].last_message_at
        : undefined;

      // A prévia vem desnormalizada na própria linha da conversa: nenhuma query
      // extra por conversa. Sem as colunas (migração pendente) `mapLastMessage`
      // devolve undefined e a lista mostra "Nenhuma mensagem".
      const conversationsWithMessages = conversations.map((conv) => ({
        ...conv,
        last_message: mapLastMessage(conv),
      }));

      return {
        data: conversationsWithMessages,
        nextCursor,
        hasMore
      } as ConversationsPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && !!tenant?.id,
    staleTime: 1000 * 15, // 15 segundos
    gcTime: 1000 * 60 * 15, // 15 minutos
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 1000 * 10, // Polling a cada 10s como fallback do Realtime
    initialPageParam: null
  });
};

/** Recorte de servidor de uma contagem — as mesmas colunas que a lista filtra. */
export interface UseConversationsCountOptions {
  searchQuery?: string;
  isArchived?: boolean;
  hasUnread?: boolean;
  whatsappInstanceId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  enabled?: boolean;
}

/**
 * Total de conversas que casam com um recorte — o tamanho da fila, não da página.
 *
 * A lista é paginada por cursor e recarrega sozinha a cada 10s. Numa fila
 * filtrada ("Não lidas"), isso faz o fim da lista se refazer por baixo enquanto
 * a pessoa trabalha, e é impossível distinguir de mensagem nova chegando: some
 * uma conversa lida, entra outra que estava fora da página. Sem um total, não
 * existe fundo visível.
 *
 * `head: true` traz só o cabeçalho `Content-Range` — nenhuma linha viaja, então
 * a contagem custa muito menos que uma página. `count: 'exact'` conta a tabela
 * inteira sob RLS, e não apenas o que já foi carregado.
 *
 * Os filtros aqui espelham exatamente os de `useConversations`, MENOS o cursor
 * de paginação — é essa ausência que transforma "a página" em "a fila".
 */
export const useConversationsCount = ({
  searchQuery = '',
  isArchived = false,
  hasUnread = false,
  whatsappInstanceId,
  dateFrom = null,
  dateTo = null,
  enabled = true,
}: UseConversationsCountOptions = {}) => {
  const { tenant } = useTenant();

  return useQuery({
    // Primeiro segmento 'conversations' de propósito: cai no nível "realtime" do
    // createQueryClient e, mais importante, as invalidações que já existem
    // (`['conversations']` ao ler, arquivar ou apagar) alcançam a contagem por
    // prefixo. É o que faz o número cair na hora em que ela lê uma conversa.
    queryKey: [
      'conversations',
      'total',
      tenant?.id,
      whatsappInstanceId,
      searchQuery,
      isArchived,
      hasUnread,
      dateFrom?.toISOString() ?? null,
      dateTo?.toISOString() ?? null,
    ],
    queryFn: async () => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const term = searchQuery.trim();

      // Mesmo motivo do `!inner` da lista: sem ele o `.or()` recortaria apenas
      // o recurso embutido e a contagem viria com a Loja inteira.
      let query = supabase
        .from('conversations')
        .select(term ? 'id, contacts!inner(id)' : 'id', {
          count: 'exact',
          head: true,
        })
        .eq('tenant_id', tenant.id)
        .eq('is_archived', isArchived);

      if (whatsappInstanceId) {
        query = query.eq('whatsapp_instance_id', whatsappInstanceId);
      }
      if (term) {
        const escaped = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        query = query.or(
          `name.ilike."%${escaped}%",phone.ilike."%${escaped}%"`,
          { referencedTable: 'contacts' },
        );
      }
      if (hasUnread) {
        query = query.gt('unread_count', 0);
      }
      if (dateFrom) {
        query = query.gte('last_message_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('last_message_at', dateTo.toISOString());
      }

      const { count, error } = await query;
      if (error) {
        throw error;
      }
      return count ?? 0;
    },
    enabled: enabled && !!tenant?.id,
    staleTime: 1000 * 15,
    // Mais espaçado que os 10s da lista de propósito: são três contagens em
    // paralelo (uma por pílula de servidor) e elas já são invalidadas na hora
    // por qualquer ação da pessoa. O intervalo só cobre o que chega de fora.
    refetchInterval: 1000 * 30,
    refetchOnWindowFocus: true,
  });
};

// Hook para buscar uma conversa específica
export const useConversation = (conversationId: string) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['conversation', conversationId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !conversationId) {
        throw new Error('Tenant ID and Conversation ID are required');
      }

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          contact_id,
          whatsapp_instance_id,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at,
          tenant_id,
          contacts (
            id,
            name,
            phone,
            email,
            avatar_url,
            notes,
            custom_fields,
            lead_source_id,
            current_stage_id,
            last_interaction_at,
            created_at,
            updated_at,
            tenant_id,
            stage:funnel_stages!contacts_current_stage_id_fkey (
              name,
              color
            ),
            lead_sources:lead_source_id (
              name
            ),
            contact_tags (
              tag_id,
              tags (
                id,
                name,
                color
              )
            )
          )
        `)
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
    enabled: !!tenant?.id && !!conversationId,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30, // 30 minutos
  });
};

// Hook para marcar conversa como lida
export const useMarkConversationAsRead = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { error } = await supabase
        .from('conversations')
        .update({ 
          unread_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id);

      if (error) {
        throw error;
      }

      return conversationId;
    },
    onSuccess: (conversationId) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations', tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['conversation', conversationId, tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['recent-conversations', tenant?.id] 
      });
    },
    onError: (error) => {
      console.error('Error marking conversation as read:', error);
    },
  });
};

// Hook para arquivar/desarquivar conversa
export const useArchiveConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ conversationId, isArchived }: { conversationId: string; isArchived: boolean }) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { error } = await supabase
        .from('conversations')
        .update({ 
          is_archived: isArchived,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id);

      if (error) {
        throw error;
      }

      return { conversationId, isArchived };
    },
    onSuccess: ({ conversationId, isArchived }) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations', tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['conversation', conversationId, tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['recent-conversations', tenant?.id] 
      });
      
      toast({
        title: isArchived ? 'Conversa arquivada' : 'Conversa desarquivada',
        description: `A conversa foi ${isArchived ? 'arquivada' : 'desarquivada'} com sucesso.`,
      });
    },
    onError: (error) => {
      console.error('Error archiving conversation:', error);
      toast({
        title: 'Erro ao arquivar conversa',
        description: 'Ocorreu um erro ao arquivar a conversa. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

// Hook para deletar conversa
export const useDeleteConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      // Primeiro buscar a conversa para pegar o contact_id real
      const { data: conversation, error: fetchError } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (conversation?.contact_id) {
        // Deletar todas as mensagens vinculadas a este contato
        const { error: messagesError } = await supabase
          .from('messages')
          .delete()
          .eq('contact_id', conversation.contact_id)
          .eq('tenant_id', tenant.id);

        if (messagesError) {
          throw messagesError;
        }
      }

      // Depois deletar a conversa
      const { error: conversationError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id);

      if (conversationError) {
        throw conversationError;
      }

      return conversationId;
    },
    onSuccess: (conversationId) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations'] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['messages'] 
      });
      
      toast({
        title: 'Conversa deletada',
        description: 'A conversa e todas as mensagens foram removidas com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Erro ao deletar conversa',
        description: 'Ocorreu um erro ao deletar a conversa. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

// Hook para buscar conversa por contact_id
export const useConversationByContact = (contactId: string) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['conversation-by-contact', contactId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !contactId) {
        return null;
      }

      let query = supabase
        .from('conversations')
        .select(`
          id,
          contact_id,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at,
          tenant_id,
          contacts (
            id,
            name,
            phone,
            lead_source_id,
            current_stage_id,
            created_at,
            updated_at,
            tenant_id,
            stage:funnel_stages!contacts_current_stage_id_fkey (
              name
            ),
            lead_sources:lead_source_id (
              name
            ),
            contact_tags (
              tag_id,
              tags (
                id,
                name,
                color
              )
            )
          )
        `)
        .eq('contact_id', contactId)
        .eq('tenant_id', tenant.id)
        .eq('is_archived', false);

      const { data, error } = await query
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
    enabled: !!tenant?.id && !!contactId,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30, // 30 minutos
  });
};

// Hook para estatísticas de conversas
export const useConversationStats = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['conversation-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const baseQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);



      const unreadQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gt('unread_count', 0);
        


      const archivedQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_archived', true);



      // Buscar estatísticas básicas
      const [totalResult, unreadResult, archivedResult] = await Promise.all([
        baseQuery,
        unreadQuery,
        archivedQuery
      ]);

      return {
        total: totalResult.count || 0,
        unread: unreadResult.count || 0,
        archived: archivedResult.count || 0,
        active: (totalResult.count || 0) - (archivedResult.count || 0)
      };
    },
    enabled: !!tenant?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30, // 30 minutos
  });
};

// Função utilitária para obter todas as conversas de todas as páginas
export const getAllConversations = (conversationsQuery: ReturnType<typeof useConversations>) => {
  return conversationsQuery.data?.pages.flatMap(page => page.data) || [];
};

// Função utilitária para filtrar conversas não lidas
export const getUnreadConversations = (conversations: Conversation[]) => {
  return conversations.filter(conv => conv.unread_count > 0);
};

// Função utilitária para agrupar conversas por status
export const groupConversationsByStatus = (conversations: Conversation[]) => {
  return {
    unread: conversations.filter(conv => conv.unread_count > 0),
    read: conversations.filter(conv => conv.unread_count === 0 && !conv.is_archived),
    archived: conversations.filter(conv => conv.is_archived)
  };
};

// Hook para criar uma nova conversa
export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (contactId: string) => {
      if (!tenant?.id || !contactId) {
        throw new Error('Tenant ID and Contact ID are required');
      }

      // Verificar se já existe uma conversa para este contato
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenant.id)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle();

      if (existingConversation) {
        return existingConversation.id;
      }

      // Buscar dados do contato
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('whatsapp_instance_id')
        .eq('id', contactId)
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle();

      if (contactError) {
        throw contactError;
      }

      // Criar nova conversa
      const { data: newConversation, error } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenant.id,
          contact_id: contactId,
          whatsapp_instance_id: contact.whatsapp_instance_id,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          is_archived: false
        })
        .select('id')
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return newConversation.id;
    },
    onSuccess: (conversationId) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations', tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['conversation-by-contact'] 
      });
    },
    onError: (error) => {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Erro ao criar conversa',
        description: 'Ocorreu um erro ao criar a conversa. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

export type { Conversation, Contact, ConversationsPage, UseConversationsOptions };