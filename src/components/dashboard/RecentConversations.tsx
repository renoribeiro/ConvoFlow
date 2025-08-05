import { MessageCircle, Clock, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Conversation {
  id: string;
  contactName: string;
  lastMessage: string;
  timestamp: string;
  status: 'new' | 'in_progress' | 'waiting' | 'closed';
  assignedTo?: string;
  whatsappNumber: string;
}

const mockConversations: Conversation[] = [
  {
    id: '1',
    contactName: 'Maria Silva',
    lastMessage: 'Gostaria de saber mais sobre o produto...',
    timestamp: '2 min atrás',
    status: 'new',
    whatsappNumber: '+55 11 99999-9999'
  },
  {
    id: '2',
    contactName: 'João Santos',
    lastMessage: 'Quando posso agendar uma reunião?',
    timestamp: '15 min atrás',
    status: 'in_progress',
    assignedTo: 'Ana Costa',
    whatsappNumber: '+55 11 99999-9998'
  },
  {
    id: '3',
    contactName: 'Pedro Oliveira',
    lastMessage: 'Obrigado pelas informações!',
    timestamp: '1h atrás',
    status: 'waiting',
    assignedTo: 'Carlos Lima',
    whatsappNumber: '+55 11 99999-9997'
  },
];

const statusColors = {
  new: 'bg-status-info text-white',
  in_progress: 'bg-status-warning text-white',
  waiting: 'bg-status-success text-white',
  closed: 'bg-muted text-muted-foreground'
};

const statusLabels = {
  new: 'Nova',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  closed: 'Fechada'
};

export const RecentConversations = () => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Conversas Recentes</CardTitle>
        <Button variant="outline" size="sm">
          Ver todas
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {mockConversations.map((conversation) => (
          <div
            key={conversation.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="text-sm font-medium text-foreground">
                    {conversation.contactName}
                  </h4>
                  <Badge className={statusColors[conversation.status]}>
                    {statusLabels[conversation.status]}
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground truncate max-w-xs">
                  {conversation.lastMessage}
                </p>
                
                {conversation.assignedTo && (
                  <div className="flex items-center space-x-1 mt-1">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {conversation.assignedTo}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <div className="flex items-center space-x-1 text-xs text-muted-foreground mb-1">
                <Clock className="h-3 w-3" />
                <span>{conversation.timestamp}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {conversation.whatsappNumber}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};