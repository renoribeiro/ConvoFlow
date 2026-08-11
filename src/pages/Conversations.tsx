import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConversationsList } from '@/components/conversations/ConversationsList';
import { ChatWindow } from '@/components/conversations/ChatWindow';
import {
  ConversationFiltersModal,
  DEFAULT_FILTER_STATE,
  type ConversationsFilterState,
} from '@/components/conversations/ConversationFiltersModal';
import { useConversationByContact, useCreateConversation } from '@/hooks/useConversations';
import { EtiquetasManagerSheet } from '@/components/etiquetas/EtiquetasManagerSheet';
import { Search, Filter, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNotifications } from '@/hooks/useNotifications';
import { useGlobalMessageListener } from '@/hooks/useRealtimeMessages';
import { useConversationShortcuts } from '@/hooks/useConversationShortcuts';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const CONTACT_PANEL_STORAGE_KEY = 'convoflow:contact-panel-open';

export default function Conversations() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showEtiquetas, setShowEtiquetas] = useState(false);
  // Busca compacta do mobile: fica como lupa e expande em campo ao toque.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [filters, setFilters] = useState<ConversationsFilterState>(DEFAULT_FILTER_STATE);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const { notifyNewMessage } = useNotifications();
  const isMobile = useIsMobile();

  // In-conversation search + contact panel are lifted here so the keyboard
  // shortcut hook can drive the ESC priority chain.
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(CONTACT_PANEL_STORAGE_KEY) === 'true';
  });

  const listSearchRef = useRef<HTMLInputElement>(null);
  const [itemIds, setItemIds] = useState<string[]>([]);

  const contactId = searchParams.get('contact');
  const { data: conversationByContact, isLoading: isLoadingConversation } = useConversationByContact(contactId || '');
  const createConversationMutation = useCreateConversation();

  useEffect(() => {
    localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(isContactPanelOpen));
  }, [isContactPanelOpen]);

  // Reset transient chat state whenever the active conversation changes.
  useEffect(() => {
    setIsChatSearchOpen(false);
  }, [selectedConversation]);

  const handleNewInboundMessage = useCallback(
    async (message: {
      contactId: string;
      content: string;
      direction: string;
      messageType: string;
    }) => {
      let contactName = 'Novo contato';
      let contactPhone = '';
      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('name, phone')
          .eq('id', message.contactId)
          .limit(1)
          .maybeSingle();
        if (contact) {
          contactName = contact.name || contact.phone || 'Contato';
          contactPhone = contact.phone || '';
        }
      } catch {
        /* fallback */
      }

      let preview = message.content;
      if (message.messageType === 'image') preview = '📷 Imagem';
      else if (message.messageType === 'audio') preview = '🎤 Áudio';
      else if (message.messageType === 'video') preview = '📹 Vídeo';
      else if (message.messageType === 'document') preview = '📄 Documento';
      else if (message.messageType === 'sticker') preview = '🖼️ Figurinha';
      else if (message.messageType === 'location') preview = '📍 Localização';

      notifyNewMessage({ contactName, messagePreview: preview || 'Nova mensagem', contactPhone });
    },
    [notifyNewMessage],
  );

  useGlobalMessageListener(handleNewInboundMessage);

  useEffect(() => {
    if (!contactId) return;
    if (selectedConversation) return;

    if (conversationByContact) {
      setSelectedConversation(conversationByContact.id);
      return;
    }

    if (!isLoadingConversation && !createConversationMutation.isPending) {
      createConversationMutation.mutate(contactId, {
        onSuccess: (conversationId) => {
          setSelectedConversation((prev) => prev ?? conversationId);
        },
      });
    }
  }, [contactId, conversationByContact, isLoadingConversation, createConversationMutation.isPending, selectedConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateList = useCallback(
    (direction: 'up' | 'down') => {
      if (!itemIds.length) return;
      const idx = selectedConversation ? itemIds.indexOf(selectedConversation) : -1;
      let nextIdx = direction === 'down' ? idx + 1 : idx - 1;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= itemIds.length) nextIdx = itemIds.length - 1;
      const nextId = itemIds[nextIdx];
      if (nextId) {
        setSelectedConversation(nextId);
        document.querySelector(`[data-conversation-id="${nextId}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    },
    [itemIds, selectedConversation],
  );

  useConversationShortcuts({
    enabled: !isMobile,
    isSearchOpen: isChatSearchOpen,
    isPanelOpen: isContactPanelOpen,
    hasSelection: !!selectedConversation,
    closeSearch: () => setIsChatSearchOpen(false),
    closePanel: () => setIsContactPanelOpen(false),
    deselect: () => setSelectedConversation(null),
    focusListSearch: () => listSearchRef.current?.focus(),
    openChatSearch: () => {
      if (selectedConversation) setIsChatSearchOpen(true);
    },
    openNewConversation: () => {
      (document.querySelector('[data-new-conversation]') as HTMLElement | null)?.click();
    },
    navigateList,
  });

  const openMobileSearch = useCallback(() => {
    setMobileSearchOpen(true);
    // O campo só existe no DOM depois do estado virar — foca no frame seguinte.
    requestAnimationFrame(() => listSearchRef.current?.focus());
  }, []);

  const activeFilterCount =
    (filters.hasUnread ? 1 : 0) +
    (filters.isArchived ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  const list = (
    <ConversationsList
      searchQuery={searchQuery}
      selectedId={selectedConversation}
      onSelect={setSelectedConversation}
      hasUnread={filters.hasUnread}
      isArchived={filters.isArchived}
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      whatsappInstanceId={activeInstanceId}
      onInstanceChange={setActiveInstanceId}
      onItemsChange={setItemIds}
    />
  );

  // No celular, conversa aberta ocupa a tela inteira: o cabeçalho da página não
  // ajuda a conversar e custa ~230px de altura. `dvh` em vez de `vh` porque no
  // navegador do celular a barra de endereço entra na conta.
  const chatEmTelaCheia = isMobile && !!selectedConversation;

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)] -m-6">
      <div
        className={cn(
          'px-6 py-4 bg-background border-b border-border flex-shrink-0',
          chatEmTelaCheia && 'hidden',
        )}
      >
        <PageHeader
          title="Conversas"
          description="Gerencie todas as suas conversas do WhatsApp em um só lugar"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Conversas' },
          ]}
          actions={
            <div className="flex items-center gap-2">
              {/* Mobile: lupa que expande o campo. Desktop (lg+): campo sempre visível. */}
              {!mobileSearchOpen && (
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden h-9 w-9 flex-shrink-0"
                  onClick={openMobileSearch}
                  aria-label="Buscar conversas"
                >
                  <Search className="w-4 h-4" />
                </Button>
              )}

              <div className={cn('relative lg:block', mobileSearchOpen ? 'block' : 'hidden')}>
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input
                      ref={listSearchRef}
                      placeholder="Buscar conversas..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      // Campo vazio ao perder o foco volta a ser lupa (só no mobile).
                      onBlur={() => {
                        if (!searchQuery) setMobileSearchOpen(false);
                      }}
                      className="pl-10 w-40 sm:w-56 lg:w-64"
                    />
                  </TooltipTrigger>
                  {!isMobile && <TooltipContent className="text-xs">Buscar conversas (Ctrl+K)</TooltipContent>}
                </Tooltip>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="px-2 lg:px-3 flex-shrink-0"
                onClick={() => setShowFilters(true)}
                aria-label="Filtros"
              >
                <Filter className="w-4 h-4 lg:mr-2" />
                <span className="hidden lg:inline">Filtros</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 lg:ml-2 h-5 px-1.5 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="px-2 lg:px-3 flex-shrink-0"
                onClick={() => setShowEtiquetas(true)}
                aria-label="Etiquetas"
              >
                <Tag className="w-4 h-4 lg:mr-2" />
                <span className="hidden lg:inline">Etiquetas</span>
              </Button>
            </div>
          }
        />
      </div>

      {isMobile ? (
        // Mobile: show ONLY the list OR the chat (never both).
        <div className={cn('flex-1 overflow-hidden min-h-0', chatEmTelaCheia ? 'p-0' : 'p-4')}>
          {selectedConversation ? (
            <div
              className={cn(
                'h-full overflow-hidden',
                // Sem moldura na tela cheia — a conversa encosta nas bordas.
                !chatEmTelaCheia && 'border border-border rounded-lg',
              )}
            >
              <ChatWindow
                conversationId={selectedConversation}
                onBack={() => setSelectedConversation(null)}
                searchOpen={isChatSearchOpen}
                onSearchOpenChange={setIsChatSearchOpen}
                panelOpen={isContactPanelOpen}
                onPanelOpenChange={setIsContactPanelOpen}
              />
            </div>
          ) : (
            <div className="h-full">{list}</div>
          )}
        </div>
      ) : (
        // Desktop: list + chat (+ contact panel rendered inside ChatWindow).
        // Superfície contínua: sem molduras nem respiro entre as colunas — a
        // separação é uma divisória só, como num cliente de mensagens.
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="w-80 flex-shrink-0 h-full border-r border-border">{list}</div>

          <div className="flex-1 h-full overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selectedConversation ?? 'empty'}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="h-full"
              >
                <ChatWindow
                  conversationId={selectedConversation || undefined}
                  searchOpen={isChatSearchOpen}
                  onSearchOpenChange={setIsChatSearchOpen}
                  panelOpen={isContactPanelOpen}
                  onPanelOpenChange={setIsContactPanelOpen}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      <ConversationFiltersModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        value={filters}
        onChange={setFilters}
      />

      <EtiquetasManagerSheet open={showEtiquetas} onOpenChange={setShowEtiquetas} />
    </div>
  );
}
