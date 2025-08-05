
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConversationsList } from '@/components/conversations/ConversationsList';
import { ChatWindow } from '@/components/conversations/ChatWindow';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Conversations() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex flex-col h-full">
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
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filtros
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 gap-4 mt-6 overflow-hidden">
        <div className="w-80 flex-shrink-0">
          <ConversationsList
            searchQuery={searchQuery}
            selectedId={selectedConversation}
            onSelect={setSelectedConversation}
          />
        </div>
        
        <div className="flex-1 border border-border rounded-lg">
          <ChatWindow conversationId={selectedConversation} />
        </div>
      </div>
    </div>
  );
}
