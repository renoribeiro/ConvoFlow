import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ConversationSkeleton } from '@/components/shared/Skeleton';
import { format, isToday, isYesterday, differenceInMinutes, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConversations, getAllConversations } from '@/hooks/useConversations';
import { useInView } from 'react-intersection-observer';
import { AlertCircle, ChevronDown, ChevronRight, LayoutList, RefreshCw, Rows3, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NewConversationModal } from './NewConversationModal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeConversations } from '@/hooks/useRealtimeMessages';
import { useChatHistorySync } from '@/hooks/useChatHistorySync';
import { useWhatsAppInstancesWithAdapter } from '@/hooks/useWhatsAppApi';
import { InstanceSelector } from './InstanceSelector';
import { pickMessagePreview } from './MessageBubble';
import { MessageStatusIcon } from './MessageStatusIcon';
import { TagBadge } from '@/components/etiquetas/TagBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ATTENDANCE_GROUP_META,
  DEFAULT_COLLAPSED_GROUPS,
  groupByAttendance,
  type AttendanceGroup,
} from './conversationGroups';

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
  /** Permite que o pai (atalhos de teclado) controle qual item está em foco. */
  onItemsChange?: (ids: string[]) => void;
}

/** "Online" se houve interação nos últimos 5 minutos. */
const PRESENCE_THRESHOLD_MIN = 5;

/** Preferências de visualização da lista (por usuário, por navegador). */
const GROUP_BY_ATTENDANCE_KEY = 'convoflow:conversations-group-by-attendance';
const COLLAPSED_GROUPS_KEY = 'convoflow:conversations-collapsed-groups';

function readGroupByPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(GROUP_BY_ATTENDANCE_KEY) === 'true';
}

function readCollapsedGroups(): Set<AttendanceGroup> {
  if (typeof window === 'undefined') return new Set(DEFAULT_COLLAPSED_GROUPS);
  const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
  if (raw === null) return new Set(DEFAULT_COLLAPSED_GROUPS);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as AttendanceGroup[]) : new Set();
  } catch {
    return new Set(DEFAULT_COLLAPSED_GROUPS);
  }
}

/** Timestamp relativo compacto: "agora", "5min", "2h", "ontem", "23/06". */
function compactTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const mins = differenceInMinutes(new Date(), date);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  if (isToday(date)) return `${differenceInHours(new Date(), date)}h`;
  if (isYesterday(date)) return 'ontem';
  return format(date, 'dd/MM', { locale: ptBR });
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
  onItemsChange,
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

  // Memoize so the flattened array keeps a stable identity between renders
  // (otherwise the derived list + onItemsChange effect would fire every render).
  const conversations = useMemo(
    () => getAllConversations(conversationsQuery),
    [conversationsQuery.data], // eslint-disable-line react-hooks/exhaustive-deps
  );
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

  const filteredConversations = useMemo(
    () =>
      conversations.map((conv: any) => {
        const isGroup =
          typeof conv?.contacts?.phone === 'string' && conv.contacts.phone.endsWith('@g.us');
        const lastDirection = conv.last_message?.direction ?? 'inbound';
        const lastStatus = conv.last_message?.status ?? null;
        const messagePreview = conv.last_message
          ? pickMessagePreview({
              id: 'preview',
              content: conv.last_message.content ?? null,
              created_at: conv.last_message_at,
              direction: lastDirection,
              status: lastStatus ?? 'sent',
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
          last_interaction_at: (conv.contacts as any)?.last_interaction_at ?? null,
          last_message: messagePreview,
          last_message_at: conv.last_message_at,
          last_message_direction: lastDirection as 'inbound' | 'outbound',
          last_message_status: lastStatus,
          unread_count: conv.unread_count,
          is_group: isGroup,
          contact_source: conv.contacts?.lead_sources?.name || null,
          contact_current_stage: (conv.contacts as any)?.funnel_stages?.name || conv.contacts?.stage?.name || null,
          tags: (conv.contacts?.contact_tags ?? [])
            .map((ct: any) => ct.tags)
            .filter(Boolean) as Array<{ id: string; name: string; color: string }>,
        };
      }),
    [conversations],
  );

  // --- Agrupamento por nível de atendimento (opt-in, persistido no navegador) ---
  const [groupByAttendanceEnabled, setGroupByAttendanceEnabled] = useState(readGroupByPreference);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<AttendanceGroup>>(readCollapsedGroups);

  useEffect(() => {
    localStorage.setItem(GROUP_BY_ATTENDANCE_KEY, String(groupByAttendanceEnabled));
  }, [groupByAttendanceEnabled]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);

  const toggleGroup = (group: AttendanceGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const attendanceBuckets = useMemo(
    () => (groupByAttendanceEnabled ? groupByAttendance(filteredConversations) : []),
    [groupByAttendanceEnabled, filteredConversations],
  );

  // Ids na ordem em que aparecem na tela — itens dentro de grupos recolhidos
  // ficam de fora para que a navegação por teclado não pule para o invisível.
  const visibleIds = useMemo(() => {
    if (!groupByAttendanceEnabled) return filteredConversations.map((c) => c.id);
    return attendanceBuckets
      .filter((bucket) => !collapsedGroups.has(bucket.group))
      .flatMap((bucket) => bucket.items.map((c) => c.id));
  }, [groupByAttendanceEnabled, attendanceBuckets, collapsedGroups, filteredConversations]);

  // Publish the ordered ids so keyboard navigation in the parent can move between
  // items — only when the set actually changes (avoids re-render cascades).
  const lastIdsSignature = useRef<string>('');
  useEffect(() => {
    const ids = visibleIds;
    const signature = ids.join('|');
    if (signature !== lastIdsSignature.current) {
      lastIdsSignature.current = signature;
      onItemsChange?.(ids);
    }
  }, [visibleIds, onItemsChange]);

  // Flash a non-selected conversation briefly when a new message arrives.
  const prevTimestamps = useRef<Record<string, string>>({});
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next: Record<string, string> = {};
    const newlyFlashing: string[] = [];
    filteredConversations.forEach((c) => {
      next[c.id] = c.last_message_at;
      const prev = prevTimestamps.current[c.id];
      if (prev && prev !== c.last_message_at && c.id !== selectedId) {
        newlyFlashing.push(c.id);
      }
    });
    const isFirstRun = Object.keys(prevTimestamps.current).length === 0;
    prevTimestamps.current = next;
    if (!isFirstRun && newlyFlashing.length) {
      setFlashing((prev) => new Set([...prev, ...newlyFlashing]));
      newlyFlashing.forEach((id) => {
        window.setTimeout(() => {
          setFlashing((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
        }, 600);
      });
    }
  }, [filteredConversations, selectedId]);

  const renderConversation = (conversation: (typeof filteredConversations)[number]) => {
    const hasUnreadMsgs = conversation.unread_count > 0;
    const isSelected = selectedId === conversation.id;
    const isFlashing = flashing.has(conversation.id);
    const isOnline =
      conversation.last_interaction_at &&
      differenceInMinutes(new Date(), new Date(conversation.last_interaction_at)) < PRESENCE_THRESHOLD_MIN;
    const isNewLead = !conversation.contact_current_stage;
    return (
      <div
        key={conversation.id}
        data-conversation-id={conversation.id}
        className={`relative cursor-pointer rounded-lg border-b border-border/50 p-3 ${
          isSelected
            ? 'bg-primary/20 border-l-[3px] border-l-primary transition-all duration-150'
            : hasUnreadMsgs
              ? `bg-[hsl(var(--unread-bg))] border-l-4 border-l-[hsl(var(--unread-strong))] hover:bg-[hsl(var(--unread-bg-hover))] shadow-[inset_0_0_0_1px_hsl(var(--unread-strong)/0.18)] transition-colors duration-100 ${isFlashing ? 'animate-flash-highlight' : ''}`
              : `hover:bg-accent/[0.08] transition-colors duration-100 ${isFlashing ? 'animate-flash-highlight' : ''}`
        }`}
        onClick={() => onSelect(conversation.id)}
      >
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
            {/* Presence indicator */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-card ${
                isOnline ? 'bg-success' : 'bg-muted-foreground/40'
              }`}
              aria-hidden
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className={`truncate flex items-center gap-1 text-sm text-foreground ${hasUnreadMsgs && !isSelected ? 'font-bold' : isSelected ? 'font-semibold' : 'font-medium'}`}>
                {conversation.is_group && <Users className="w-3 h-3 text-muted-foreground" />}
                {conversation.contact_name}
              </p>
              <span className={`text-xs flex-shrink-0 ${hasUnreadMsgs && !isSelected ? 'text-[hsl(var(--unread-strong))] font-semibold' : 'text-muted-foreground'}`}>
                {compactTimestamp(conversation.last_message_at)}
              </span>
            </div>

            <div className={`flex items-center gap-1 mb-2 min-w-0 ${hasUnreadMsgs && !isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
              {conversation.last_message_direction === 'outbound' && (
                <span className="flex-shrink-0">
                  <MessageStatusIcon status={(conversation.last_message_status as any) ?? 'sent'} />
                </span>
              )}
              <p className={`text-sm truncate ${hasUnreadMsgs && !isSelected ? 'font-semibold' : ''}`}>
                {conversation.last_message}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1 min-w-0 flex-wrap">
                {isNewLead && (
                  <Badge variant="outline" className="border-0 bg-accent/15 text-accent text-[10px] font-medium px-1.5">
                    Novo Lead
                  </Badge>
                )}
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
              {hasUnreadMsgs && (
                <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--unread-strong))] px-1.5 text-[11px] font-bold text-[hsl(var(--unread-on-strong))] shadow-sm">
                  {conversation.unread_count}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

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
    // A moldura só existe no celular, onde a lista é um cartão solto. De `md`
    // para cima ela faz parte da superfície contínua e quem separa é a divisória.
    <div className="bg-card border border-border rounded-lg md:border-0 md:rounded-none h-full flex flex-col">
      <div className="p-4 border-b border-border flex-shrink-0 space-y-3">
        {/* Título + ações de ícone numa linha; "Nova Conversa" ganha a linha de
            baixo. Na coluna de 320px os três lado a lado não cabiam e o botão
            era cortado. */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground truncate">Conversas Ativas</h3>
          <div className="flex gap-2 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={groupByAttendanceEnabled ? 'secondary' : 'outline'}
                  size="icon"
                  aria-pressed={groupByAttendanceEnabled}
                  onClick={() => setGroupByAttendanceEnabled((prev) => !prev)}
                >
                  {groupByAttendanceEnabled ? (
                    <Rows3 className="h-4 w-4" />
                  ) : (
                    <LayoutList className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {groupByAttendanceEnabled
                  ? 'Voltar para lista única'
                  : 'Separar por nível de atendimento'}
              </TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              size="icon"
              onClick={() => syncAllChats(whatsappInstanceId ?? null)}
              disabled={isSyncing}
              title="Sincronizar conversas recentes (Evolution/WAHA)"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <NewConversationModal onConversationCreated={() => { /* lista invalidada via realtime */ }} />

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
        <div className="p-2">
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
          ) : !groupByAttendanceEnabled ? (
            filteredConversations.map(renderConversation)
          ) : (
            attendanceBuckets.map(({ group, items }) => {
              const meta = ATTENDANCE_GROUP_META[group];
              const isCollapsed = collapsedGroups.has(group);
              return (
                <section key={group} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-expanded={!isCollapsed}
                    title={meta.hint}
                    className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-md bg-card/95 px-2 py-1.5 text-left backdrop-blur-sm transition-colors hover:bg-accent/[0.08]"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    )}
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${meta.dotClass}`} aria-hidden />
                    <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </span>
                    <Badge variant="secondary" className="h-5 flex-shrink-0 px-1.5 text-[10px]">
                      {items.length}
                    </Badge>
                  </button>
                  {!isCollapsed && <div>{items.map(renderConversation)}</div>}
                </section>
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
