import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ConversationSkeleton } from '@/components/shared/Skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConversations, getAllConversations } from '@/hooks/useConversations';
import { useInView } from 'react-intersection-observer';
import { AlertCircle, RefreshCw, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NewConversationModal } from './NewConversationModal';
import { useEffect } from 'react';
import { useRealtimeConversations } from '@/hooks/useRealtimeMessages';
import { useChatHistorySync } from '@/hooks/useChatHistorySync';
import { useWhatsAppInstancesWithAdapter } from '@/hooks/useWhatsAppApi';
import { InstanceSelector } from './InstanceSelector';
import { pickMessagePreview } from './MessageBubble';
import { TagBadge } from '@/components/etiquetas/TagBadge';

interface ConversationsListProps {
  searchQuery: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasUnread?: boolean;
  isArchived?: boolean;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  /**
   * Quando definido, lista apenas conversas vinculadas a essa instância.
   * 'all' (ou undefined) lista todas as instâncias da tenant.
   */
  whatsappInstanceId?: string | null;
  onInstanceChange?: (id: string | null) => void;
}

export const ConversationsList = ({
  searchQuery,
  selectedId,
  onSelect,
  hasUnread = false,
  isArchived = false,
  dateFrom = null,
  dateTo = null,
  whatsappInstanceId,
  onInstanceChange,
}: ConversationsListProps) => {
  const { instances } = useWhatsAppInstancesWithAdapter();

  const conversationsQuery = useConversations({
    pageSize: 20,
    searchQuery,
    isArchived,
    enabled: true,
    whatsappInstanceId: whatsappInstanceId ?? undefined,
    hasUnread,
    dateFrom,
    dateTo,
  });

  const conversations = getAllConversations(conversationsQuery);
  const isLoading = conversationsQuery.isLoading;
  const error = conversationsQuery.error;

  const { isSyncing, syncAllChats } = useChatHistorySync();

  useRealtimeConversations();

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px 0px 0px 0px',
  });

  useEffect(() => {
    if (inView && conversationsQuery.hasNextPage && !conversationsQuery.isFetchingNextPage) {
      conversationsQuery.fetchNextPage();
    }
  }, [inView, conversationsQuery.hasNextPage, conversationsQuery.isFetchingNextPage]);

  const filteredConversations = conversations.map((conv: any) => {
    const isGroup =
      typeof conv?.contacts?.phone === 'string' && conv.contacts.phone.endsWith('@g.us');
    const messagePreview = conv.last_message
      ? pickMessagePreview({
          id: 'preview',
          content: conv.last_message.content ?? null,
          created_at: conv.last_message_at,
          direction: 'inbound',
          status: 'sent',
          message_type: conv.last_message.message_type ?? 'text',
          media_url: null,
        })
      : 'Nenhuma mensagem';
    return {
      id: conv.id,
      contact_id: conv.contact_id,
      contact_name: conv.contacts?.name || 'Contato sem nome',
      contact_phone: conv.contacts?.phone || '',
      contact_avatar: (conv.contacts as any)?.avatar_url ?? null,
      last_message: messagePreview,
      last_message_at: conv.last_message_at,
      unread_count: conv.unread_count,
      is_group: isGroup,
      contact_source: conv.contacts?.lead_sources?.name || null,
      contact_current_stage: (conv.contacts as any)?.funnel_stages?.name || conv.contacts?.stage?.name || null,
      tags: (conv.contacts?.contact_tags ?? [])
        .map((ct: any) => ct.tags)
        .filter(Boolean) as Array<{ id: string; name: string; color: string }>,
    };
  });

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg h-full p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Erro ao carregar conversas. Tente novamente.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg h-full flex flex-col">
      <div className="p-4 border-b border-border flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Conversas Ativas</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => syncAllChats(whatsappInstanceId ?? null)}
              disabled={isSyncing}
              title="Sincronizar conversas recentes (Evolution/WAHA)"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>
            <NewConversationModal onConversationCreated={() => { /* lista invalidada via realtime */ }} />
          </div>
        </div>

        {instances.length > 0 && (
          <InstanceSelector
            instances={instances}
            selectedId={whatsappInstanceId ?? null}
            onChange={(id) => onInstanceChange?.(id === '__all__' ? null : id)}
          />
        )}

        <p className="text-xs text-muted-foreground">
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
            filteredConversations.map((conversation) => {
              const hasUnread = conversation.unread_count > 0;
              const isSelected = selectedId === conversation.id;
              return (
              <div
                key={conversation.id}
                className={`relative p-3 rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                  isSelected ? 'bg-accent' : hasUnread ? 'bg-primary/5' : ''
                }`}
                onClick={() => onSelect(conversation.id)}
              >
                {hasUnread && !isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" aria-hidden />
                )}
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      {conversation.contact_avatar && (
                        <AvatarImage src={conversation.contact_avatar} alt={conversation.contact_name} />
                      )}
                      <AvatarFallback>
                        {conversation.is_group ? (
                          <Users className="w-4 h-4" />
                        ) : (
                          conversation.contact_name.split(' ').map((n: string) => n[0] ?? '').join('').toUpperCase().slice(0, 2)
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {hasUnread && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className={`truncate flex items-center gap-1 ${hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                        {conversation.is_group && <Users className="w-3 h-3 text-muted-foreground" />}
                        {conversation.contact_name}
                      </p>
                      <span className={`text-xs ${hasUnread ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        {formatDistanceToNow(new Date(conversation.last_message_at), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </span>
                    </div>

                    <p className={`text-sm truncate mb-2 ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {conversation.last_message}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 min-w-0 flex-wrap">
                        {conversation.contact_source && (
                          <Badge variant="secondary" className="text-xs truncate max-w-[80px]">
                            {conversation.contact_source}
                          </Badge>
                        )}
                        {conversation.contact_current_stage && (
                          <Badge variant="outline" className="text-xs truncate max-w-[80px]">
                            {conversation.contact_current_stage}
                          </Badge>
                        )}
                        {conversation.tags.slice(0, 2).map((tag) => (
                          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                        ))}
                        {conversation.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{conversation.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                      {hasUnread && (
                        <Badge className="bg-primary text-primary-foreground">
                          {conversation.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })
          )}

          {conversationsQuery.hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {conversationsQuery.isFetchingNextPage ? (
                <div className="text-sm text-muted-foreground">Carregando mais conversas...</div>
              ) : (
                <div className="text-sm text-muted-foreground/60">Role para carregar mais</div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
