
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NewConversationModal } from './NewConversationModal';

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
  // Buscar contatos que têm mensagens
  const { data: contactsData = [], isLoading, error } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['contacts-with-messages'],
    select: `
      id,
      name,
      phone,
      lead_source_id,
      current_stage_id,
      created_at,
      funnel_stages:current_stage_id (
        name
      ),
      lead_sources:lead_source_id (
        name
      )
    `,
    orderBy: [{ column: 'created_at', ascending: false }],
    limit: 50,
    refetchInterval: 30000, // Atualiza a cada 30 segundos
    staleTime: 10000 // Considera dados frescos por 10 segundos
  });

  // Buscar últimas mensagens para cada contato
  const { data: messagesData = [] } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['latest-messages'],
    select: `
      contact_id,
      content,
      created_at,
      direction
    `,
    orderBy: [{ column: 'created_at', ascending: false }],
    limit: 200,
    enabled: contactsData.length > 0
  });

  // Processar dados das conversas a partir dos contatos e mensagens
  const processedConversations = contactsData?.map(contact => {
    // Encontrar a última mensagem deste contato
    const contactMessages = messagesData.filter(msg => msg.contact_id === contact.id);
    const lastMessage = contactMessages[0]; // Já ordenado por created_at desc
    
    return {
      id: contact.id,
      contact_id: contact.id,
      contact_name: contact.name || 'Contato sem nome',
      contact_phone: contact.phone || '',
      last_message: lastMessage?.content || 'Nenhuma mensagem',
      last_message_at: lastMessage?.created_at || contact.created_at,
      unread_count: 0, // Por enquanto sem contagem de não lidas
      contact_source: contact.lead_sources?.name || 'Desconhecido',
      contact_current_stage: contact.funnel_stages?.name || 'Sem estágio',
    };
  }) || [];

  // Filtrar apenas contatos que têm mensagens e ordenar por última mensagem
  const conversations = processedConversations
    .filter(conv => conv.last_message !== 'Nenhuma mensagem')
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

  const filteredConversations = conversations.filter(conv =>
    conv.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.last_message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.contact_phone.includes(searchQuery)
  );

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
            // Loading skeleton
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                    <div className="flex justify-between">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-6" />
                    </div>
                  </div>
                </div>
              </div>
            ))
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
        </div>
      </ScrollArea>
    </div>
  );
};
