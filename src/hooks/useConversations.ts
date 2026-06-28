import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';

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
  last_message?: {
    content: string;
    direction: 'inbound' | 'outbound';
    message_type: string;
  };
}

interface ConversationsPage {
  data: Conversation[];
  nextCursor?: string;
  hasMore: boolean;
}

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

      // Aplicar filtro de busca
      if (searchQuery.trim()) {
        query = query.or(
          `contacts.name.ilike.%${searchQuery}%,contacts.phone.ilike.%${searchQuery}%`
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

      if (error) {
        throw error;
      }

      const conversations = data || [];
      const hasMore = conversations.length === pageSize;
      const nextCursor = hasMore && conversations.length > 0 
        ? conversations[conversations.length - 1].last_message_at 
        : undefined;

      // Fetch last messages for these conversations
      let conversationsWithMessages = conversations;
      if (conversations.length > 0) {
        conversationsWithMessages = await Promise.all(
          conversations.map(async (conv) => {
            const { data: msg } = await supabase
              .from('messages')
              .select('content, created_at')
              .eq('contact_id', conv.contact_id)
              .eq('tenant_id', tenant.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
              
            return {
              ...conv,
              last_message: msg ? { content: msg.content, created_at: msg.created_at } : undefined
            };
          })
        );
      }

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

// Hook para buscar conversas recentes (dashboard)
export const useRecentConversations = (limit: number = 5) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['recent-conversations', tenant?.id, limit],
    queryFn: async () => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
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
            avatar_url,
            lead_source_id,
            current_stage_id,
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
        .eq('is_archived', false)
        .order('last_message_at', { ascending: false })
        .limit(limit);

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const conversations = data || [];

      // Fetch last messages for these recent conversations
      let conversationsWithMessages = conversations;
      if (conversations.length > 0) {
        conversationsWithMessages = await Promise.all(
          conversations.map(async (conv) => {
            const { data: msg } = await supabase
              .from('messages')
              .select('content, created_at')
              .eq('contact_id', conv.contact_id)
              .eq('tenant_id', tenant.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
              
            return {
              ...conv,
              last_message: msg ? { content: msg.content, created_at: msg.created_at } : undefined
            };
          })
        );
      }

      return conversationsWithMessages;
    },
    enabled: !!tenant?.id,
    staleTime: 1000 * 60 * 1, // 1 minuto
    gcTime: 1000 * 60 * 5, // 5 minutos
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