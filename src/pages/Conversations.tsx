import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConversationsList } from '@/components/conversations/ConversationsList';
import { ChatWindow } from '@/components/conversations/ChatWindow';
import {
  ConversationFiltersModal,
  DEFAULT_FILTER_STATE,
  type ConversationsFilterState,
} from '@/components/conversations/ConversationFiltersModal';
import { useConversationByContact, useCreateConversation } from '@/hooks/useConversations';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/hooks/useNotifications';
import { useGlobalMessageListener } from '@/hooks/useRealtimeMessages';
import { supabase } from '@/integrations/supabase/client';

export default function Conversations() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ConversationsFilterState>(DEFAULT_FILTER_STATE);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const { notifyNewMessage } = useNotifications();

  const contactId = searchParams.get('contact');
  const { data: conversationByContact, isLoading: isLoadingConversation } = useConversationByContact(contactId || '');
  const createConversationMutation = useCreateConversation();

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

  const activeFilterCount =
    (filters.hasUnread ? 1 : 0) +
    (filters.isArchived ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -m-6">
      <div className="px-6 py-4 bg-background border-b border-border flex-shrink-0">
        <PageHeader
          title="Conversas"
          description="Gerencie todas as suas conversas do WhatsApp em um só lugar"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Conversas' },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar conversas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowFilters(true)}>
                <Filter className="w-4 h-4 mr-2" />
                Filtros
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex flex-1 gap-4 p-6 overflow-hidden min-h-0">
        <div className="w-80 flex-shrink-0 h-full">
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
          />
        </div>

        <div className="flex-1 border border-border rounded-lg h-full">
          <ChatWindow conversationId={selectedConversation || undefined} />
        </div>
      </div>

      <ConversationFiltersModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        value={filters}
        onChange={setFilters}
      />
    </div>
  );
}
