
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConversationsList } from '@/components/conversations/ConversationsList';
import { ChatWindow } from '@/components/conversations/ChatWindow';
import { ConversationFiltersModal } from '@/components/conversations/ConversationFiltersModal';
import { useConversationByContact, useCreateConversation } from '@/hooks/useConversations';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Conversations() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [searchParams] = useSearchParams();
  
  // Obter contact_id da URL
  const contactId = searchParams.get('contact');
  
  // Buscar conversa por contact_id se fornecido
  const { data: conversationByContact, isLoading: isLoadingConversation } = useConversationByContact(contactId || '');
  
  // Hook para criar nova conversa
  const createConversationMutation = useCreateConversation();

  // Efeito para selecionar automaticamente a conversa quando encontrada ou criar uma nova
  // Importante: não sobrescrever a seleção manual do usuário. Só auto-selecionar quando ainda não há uma conversa selecionada.
  useEffect(() => {
    if (!contactId) return; // só atua quando a URL define um contato

    // Se o usuário já selecionou uma conversa manualmente, não sobrescreva
    if (selectedConversation) return;

    if (conversationByContact) {
      // Se encontrou a conversa, seleciona ela uma única vez
      setSelectedConversation(conversationByContact.id);
      return;
    }

    // Se não encontrou e não está carregando, cria uma nova conversa para o contato
    if (!isLoadingConversation && !createConversationMutation.isPending) {
      createConversationMutation.mutate(contactId, {
        onSuccess: (conversationId) => {
          // Só definir se ainda não houver seleção (evitar travar após clique do usuário durante a criação)
          setSelectedConversation(prev => prev ?? conversationId);
        }
      });
    }
  }, [contactId, conversationByContact, isLoadingConversation, createConversationMutation.isPending, selectedConversation]);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -m-6">
      <div className="px-6 py-4 bg-background border-b border-border flex-shrink-0">
        <PageHeader
          title="Conversas"
          description="Gerencie todas as suas conversas do WhatsApp em um só lugar"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Conversas' }
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
          />
        </div>
        
        <div className="flex-1 border border-border rounded-lg h-full">
          <ChatWindow conversationId={selectedConversation || undefined} />
        </div>
      </div>
      
      <ConversationFiltersModal 
        isOpen={showFilters} 
        onClose={() => setShowFilters(false)} 
      />
    </div>
  );
}
