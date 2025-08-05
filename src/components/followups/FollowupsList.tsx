
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/shared/EmptyState';
import { CheckCircle, Clock, Phone, Mail, MessageSquare, Calendar } from 'lucide-react';

interface Followup {
  id: string;
  clientName: string;
  clientPhone: string;
  task: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  type: 'call' | 'email' | 'whatsapp';
  notes?: string;
}

interface FollowupsListProps {
  status: 'pending' | 'today' | 'completed' | 'overdue';
}

const mockFollowups: Record<string, Followup[]> = {
  pending: [
    {
      id: '1',
      clientName: 'Ana Silva',
      clientPhone: '+55 11 99999-1111',
      task: 'Ligar para apresentar nova proposta',
      dueDate: 'Amanhã, 14:00',
      priority: 'high',
      type: 'call',
      notes: 'Cliente interessado em plano premium'
    },
    {
      id: '2',
      clientName: 'Carlos Santos',
      clientPhone: '+55 11 99999-2222',
      task: 'Enviar material complementar por email',
      dueDate: '25/01, 09:00',
      priority: 'medium',
      type: 'email'
    }
  ],
  today: [
    {
      id: '3',
      clientName: 'Maria Oliveira',
      clientPhone: '+55 11 99999-3333',
      task: 'Follow-up sobre proposta enviada',
      dueDate: 'Hoje, 15:30',
      priority: 'high',
      type: 'whatsapp'
    }
  ],
  completed: [
    {
      id: '4',
      clientName: 'João Pereira',
      clientPhone: '+55 11 99999-4444',
      task: 'Ligação de acompanhamento',
      dueDate: 'Hoje, 10:00',
      priority: 'medium',
      type: 'call',
      notes: 'Cliente confirmou interesse, agendou reunião'
    }
  ],
  overdue: [
    {
      id: '5',
      clientName: 'Pedro Costa',
      clientPhone: '+55 11 99999-5555',
      task: 'Retorno sobre dúvidas técnicas',
      dueDate: 'Ontem, 16:00',
      priority: 'high',
      type: 'whatsapp'
    }
  ]
};

export const FollowupsList = ({ status }: FollowupsListProps) => {
  const followups = mockFollowups[status] || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'whatsapp': return <MessageSquare className="w-4 h-4" />;
      default: return <Calendar className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'overdue': return 'border-l-red-500 bg-red-50';
      case 'today': return 'border-l-blue-500 bg-blue-50';
      case 'completed': return 'border-l-green-500 bg-green-50';
      default: return 'border-l-gray-300';
    }
  };

  if (followups.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-full h-full" />}
        title={`Nenhum follow-up ${status === 'pending' ? 'pendente' : status}`}
        description="Quando houver tarefas neste status, elas aparecerão aqui"
      />
    );
  }

  return (
    <div className="space-y-4">
      {followups.map((followup) => (
        <Card key={followup.id} className={`border-l-4 ${getStatusColor(status)}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback>
                    {followup.clientName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold">{followup.clientName}</h4>
                  <p className="text-sm text-muted-foreground">{followup.clientPhone}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge className={getPriorityColor(followup.priority)}>
                  {followup.priority}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  {getTypeIcon(followup.type)}
                  {followup.type}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium">{followup.task}</p>
              <p className="text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 inline mr-1" />
                {followup.dueDate}
              </p>
              {followup.notes && (
                <p className="text-sm bg-muted p-2 rounded">
                  <strong>Notas:</strong> {followup.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              {status !== 'completed' && (
                <Button size="sm" variant="default">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Concluir
                </Button>
              )}
              <Button size="sm" variant="outline">
                {getTypeIcon(followup.type)}
              </Button>
              <Button size="sm" variant="outline">
                Editar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
