
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ConversationSkeleton } from '@/components/shared/Skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useConversations, getAllConversations } from '@/hooks/useConversations';
import { useInView } from 'react-intersection-observer';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NewConversationModal } from './NewConversationModal';
import { useEffect } from 'react';

interface Conversation {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  contact_source?: string;
  contact_current_stage?: string;
}

interface ConversationsListProps {
  searchQuery: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}



export const ConversationsList = ({ searchQuery, selectedId, onSelect }: ConversationsListProps) => {
  // Buscar conversas com paginação infinita
  const conversationsQuery = useConversations({
    pageSize: 20,
    searchQuery,
    isArchived: false,
    enabled: true
  });

  const conversations = getAllConversations(conversationsQuery);
  const isLoading = conversationsQuery.isLoading;
  const error = conversationsQuery.error;

  // Hook para detectar quando carregar mais conversas
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px 0px 0px 0px'
  });

  // Carregar mais conversas quando o usuário rola para baixo
  useEffect(() => {
    if (inView && conversationsQuery.hasNextPage && !conversationsQuery.isFetchingNextPage) {
      conversationsQuery.fetchNextPage();
    }
  }, [inView, conversationsQuery.hasNextPage, conversationsQuery.isFetchingNextPage]);

  // Mapear conversas para o formato esperado pelo componente
  const filteredConversations = conversations.map(conv => ({
    id: conv.id,
    contact_id: conv.contact_id,
    contact_name: conv.contacts?.name || 'Contato sem nome',
    contact_phone: conv.contacts?.phone || '',
    last_message: conv.last_message?.content || 'Nenhuma mensagem',
    last_message_at: conv.last_message_at,
    unread_count: conv.unread_count,
    contact_source: conv.contacts?.lead_sources?.name || 'Desconhecido',
    contact_current_stage: conv.contacts?.funnel_stages?.name || 'Sem estágio',
  }));

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg h-full p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar conversas. Tente novamente.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg h-full flex flex-col">
      <div className="p-4 border-b border-border flex-shrink-0">
        <h3 className="font-semibold text-foreground">Conversas Ativas</h3>
        <NewConversationModal onConversationCreated={(contactId) => {
          // Atualizar a lista de conversas quando uma nova conversa for criada
          // O hook useSupabaseQuery irá automaticamente revalidar os dados
        }} />
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Carregando...' : `${filteredConversations.length} conversas`}
        </p>
      </div>
      
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-1 p-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <ConversationSkeleton key={i} />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                  selectedId === conversation.id ? 'bg-accent' : ''
                }`}
                onClick={() => onSelect(conversation.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback>
                        {conversation.contact_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {conversation.unread_count > 0 && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-foreground truncate">
                        {conversation.contact_name}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conversation.last_message_at), { 
                          locale: ptBR, 
                          addSuffix: true 
                        })}
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground truncate mb-2">
                      {conversation.last_message}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {conversation.contact_source}
                        </Badge>
                        {conversation.contact_current_stage && (
                          <Badge variant="outline" className="text-xs">
                            {conversation.contact_current_stage}
                          </Badge>
                        )}
                      </div>
                      {conversation.unread_count > 0 && (
                        <Badge className="bg-primary text-primary-foreground">
                          {conversation.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          
          {/* Elemento para carregar mais conversas */}
          {conversationsQuery.hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {conversationsQuery.isFetchingNextPage ? (
                <div className="text-sm text-gray-500">Carregando mais conversas...</div>
              ) : (
                <div className="text-sm text-gray-400">Role para carregar mais</div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
