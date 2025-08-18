
import React, { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, Paperclip, Smile, Phone, Video, MoreVertical, AlertCircle, Edit, User, Tag, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useMessages, useSendMessage, useMarkMessagesAsRead, getAllMessages } from '@/hooks/useMessages';
import { useInView } from 'react-intersection-observer';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useConversation, useMarkConversationAsRead } from '@/hooks/useConversations';

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_type: 'user' | 'contact';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document';
  media_url?: string;
  contact_id: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  lead_source_id?: string;
  current_stage_id?: string;
  stage?: {
    name: string;
  };
  lead_sources?: {
    name: string;
  };
}

interface Conversation {
  id: string;
  contact_id: string;
  last_message_at: string;
  unread_count: number;
  contacts: Contact;
}

interface ChatWindowProps {
  conversationId?: string;
}

export const ChatWindow = ({ conversationId }: ChatWindowProps) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    lead_source_id: '',
    current_stage_id: ''
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { tenant } = useTenant();

  // Buscar conversa por ID da conversa para obter contact_id e dados do contato
  const { data: conversation, isLoading: conversationLoading, error: conversationError } = useConversation(conversationId || '');
  const contact = conversation?.contacts;
  const contactId = conversation?.contact_id;

  // Query para buscar mensagens com paginação infinita (usando contact_id derivado da conversa)
  const messagesQuery = useMessages({
    contactId: contactId || '',
    pageSize: 50,
    enabled: !!contactId
  });

  const messages = getAllMessages(messagesQuery);
  const messagesLoading = messagesQuery.isLoading;
  const messagesError = messagesQuery.error;

  // Hook para detectar quando carregar mais mensagens
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px 0px 0px 0px'
  });

  // Query para buscar lead sources
  const { data: leadSources = [] } = useSupabaseQuery({
    table: 'lead_sources',
    select: 'id, name',
    filters: tenant?.id ? [{ column: 'tenant_id', operator: 'eq', value: tenant.id }] : [],
    enabled: !!tenant?.id
  });

  // Query para buscar funnel stages
  const { data: funnelStages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    select: 'id, name',
    filters: tenant?.id ? [{ column: 'tenant_id', operator: 'eq', value: tenant.id }] : [],
    enabled: !!tenant?.id
  });

  // Mutation para enviar mensagem
  const sendMessageMutation = useSendMessage();
  
  // Mutation para marcar mensagens como lidas
  const markAsReadMutation = useMarkMessagesAsRead();
  
  // Mutation para marcar conversa como lida
  const markConversationAsReadMutation = useMarkConversationAsRead();

  // Mutation para atualizar contato
  const updateContactMutation = useSupabaseMutation({
    table: 'contacts',
    operation: 'update',
    onSuccess: () => {
      toast.success('Contato atualizado com sucesso!');
      setIsEditModalOpen(false);
    },
    onError: (error) => {
      console.error('Erro ao atualizar contato:', error);
      toast.error('Erro ao atualizar contato. Tente novamente.');
    }
  });

  // Carregar mais mensagens quando o usuário rola para cima
  useEffect(() => {
    if (inView && messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      messagesQuery.fetchNextPage();
    }
  }, [inView, messagesQuery.hasNextPage, messagesQuery.isFetchingNextPage]);

  // Scroll para o final quando novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fechar seletor de emoji ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEmojiPicker && !(event.target as Element).closest('.emoji-picker')) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Marcar mensagens como lidas quando a conversa é aberta
  useEffect(() => {
    if (contactId && messages.length > 0) {
      const unreadMessages = messages.filter(msg => 
        msg.direction === 'inbound' && msg.status !== 'read'
      );
      
      if (unreadMessages.length > 0) {
        markAsReadMutation.mutate({
          contactId: contactId,
          messageIds: unreadMessages.map(msg => msg.id)
        });
      }
    }
  }, [contactId, messages.length]);

  // Marcar conversa como lida quando a conversa é aberta
  useEffect(() => {
    if (conversationId && conversation?.unread_count && conversation.unread_count > 0) {
      markConversationAsReadMutation.mutate(conversationId);
    }
  }, [conversationId, conversation?.unread_count]);

  // Early returns APÓS todos os hooks serem chamados
  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          title="Nenhuma conversa selecionada"
          description="Selecione uma conversa da lista para começar a conversar"
        />
      </div>
    );
  }

  if (conversationError || messagesError) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar a conversa. Tente novamente.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Função para abrir modal de edição
  const handleEditContact = () => {
    if (contact) {
      setEditForm({
        name: contact.name || '',
        phone: contact.phone || '',
        lead_source_id: contact.lead_source_id || '',
        current_stage_id: contact.current_stage_id || ''
      });
      setIsEditModalOpen(true);
    }
  };

  // Função para salvar alterações do contato
  const handleSaveContact = () => {
    if (!contact?.id) return;

    updateContactMutation.mutate({
      id: contact.id,
      ...editForm
    });
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !contactId || isSending || !tenant?.id) return;

    setIsSending(true);

    try {
      await sendMessageMutation.mutateAsync({
        contact_id: contactId,
        whatsapp_instance_id: tenant.whatsapp_instances?.[0]?.id, // Usar primeira instância disponível
        content: message.trim(),
        direction: 'outbound',
        message_type: 'text',
        status: 'sent',
        is_from_bot: false
      });

      setMessage('');
      setIsSending(false);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  // Função para lidar com seleção de emoji
  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Função para lidar com seleção de arquivo
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Aqui você pode implementar o upload do arquivo
      toast.success(`Arquivo selecionado: ${file.name}`);
    }
  };

  // Função para abrir seletor de arquivo
  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Lista de emojis comuns
  const commonEmojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🔥', '💯', '🎉', '😢', '😡', '🙏', '👏', '💪'];

  if (conversationLoading || messagesLoading) {
    return (
      <div className="flex flex-col h-full bg-card border border-border rounded-lg">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="w-8 h-8" />
            <Skeleton className="w-8 h-8" />
            <Skeleton className="w-8 h-8" />
          </div>
        </div>
        
        {/* Messages Skeleton */}
        <div className="flex-1 p-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <div className="max-w-[70%] space-y-2">
                <Skeleton className="h-12 w-48" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
        
        {/* Input Skeleton */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8" />
            <Skeleton className="w-8 h-8" />
            <Skeleton className="flex-1 h-10" />
            <Skeleton className="w-8 h-8" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback>
              {contact?.name ? contact.name.split(' ').map((n) => n?.[0] ?? '').join('').toUpperCase() : 'C'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-foreground">
              {contact?.name || 'Contato'}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {contact?.phone}
              </span>
              {contact?.stage?.name && (
                <Badge variant="outline" className="text-xs">
                  {contact.stage.name}
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {contact?.lead_sources?.name || 'Desconhecido'}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEditContact}>
                <Edit className="w-4 h-4 mr-2" />
                Editar Contato
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="w-4 h-4 mr-2" />
                Ver Perfil
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Tag className="w-4 h-4 mr-2" />
                Alterar Etapa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhuma mensagem ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Envie a primeira mensagem para iniciar a conversa
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[70%] p-3 rounded-lg ${
                    msg.direction === 'inbound'
                      ? 'bg-muted text-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs opacity-70">
                      {formatDistanceToNow(new Date(msg.created_at), { 
                        locale: ptBR, 
                        addSuffix: true 
                      })}
                    </span>
                    {msg.direction === 'outbound' && (
                      <Badge 
                        variant={msg.status === 'failed' ? 'destructive' : 'secondary'} 
                        className="text-xs"
                      >
                        {msg.status === 'sent' ? 'Enviado' :
                         msg.status === 'delivered' ? 'Entregue' :
                         msg.status === 'read' ? 'Lido' : 'Falhou'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border flex-shrink-0">
        {/* Input de arquivo oculto */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        />
        
        {/* Seletor de emoji */}
         {showEmojiPicker && (
           <div className="emoji-picker mb-2 p-2 border border-border rounded-lg bg-background">
             <div className="grid grid-cols-8 gap-1">
               {commonEmojis.map((emoji, index) => (
                 <Button
                   key={index}
                   type="button"
                   variant="ghost"
                   size="sm"
                   className="h-8 w-8 p-0 text-lg hover:bg-muted"
                   onClick={() => handleEmojiSelect(emoji)}
                 >
                   {emoji}
                 </Button>
               ))}
             </div>
           </div>
         )}
        
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            onClick={handleAttachClick}
            title="Anexar arquivo"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Adicionar emoji"
          >
            <Smile className="w-4 h-4" />
          </Button>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua mensagem..."
            className="flex-1"
            disabled={isSending}
          />
          <Button 
            type="submit" 
            size="sm" 
            disabled={!message.trim() || isSending}
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>

      {/* Modal de Edição do Contato */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
            <DialogDescription>
              Atualize as informações do contato abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nome
              </Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">
                Telefone
              </Label>
              <Input
                id="phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lead_source" className="text-right">
                Fonte
              </Label>
              <Select
                value={editForm.lead_source_id}
                onValueChange={(value) => setEditForm({ ...editForm, lead_source_id: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione uma fonte" />
                </SelectTrigger>
                <SelectContent>
                  {leadSources.map((source: any) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stage" className="text-right">
                Etapa
              </Label>
              <Select
                value={editForm.current_stage_id}
                onValueChange={(value) => setEditForm({ ...editForm, current_stage_id: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione uma etapa" />
                </SelectTrigger>
                <SelectContent>
                  {funnelStages.map((stage: any) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveContact}
              disabled={updateContactMutation.isPending}
            >
              {updateContactMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
