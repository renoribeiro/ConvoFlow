import { Smartphone, Wifi, WifiOff, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface WhatsAppInstance {
  id: string;
  name: string;
  number: string;
  status: 'connected' | 'disconnected' | 'connecting';
  lastSeen: string;
  messagesCount: number;
}

const mockInstances: WhatsAppInstance[] = [
  {
    id: '1',
    name: 'Vendas Principal',
    number: '+55 11 99999-9999',
    status: 'connected',
    lastSeen: 'Online',
    messagesCount: 47
  },
  {
    id: '2',
    name: 'Suporte Técnico',
    number: '+55 11 99999-9998',
    status: 'connected',
    lastSeen: '2 min atrás',
    messagesCount: 23
  },
  {
    id: '3',
    name: 'Marketing',
    number: '+55 11 99999-9997',
    status: 'disconnected',
    lastSeen: '1h atrás',
    messagesCount: 0
  },
];

const statusConfig = {
  connected: {
    icon: Wifi,
    color: 'bg-status-success text-white',
    label: 'Conectado'
  },
  disconnected: {
    icon: WifiOff,
    color: 'bg-status-error text-white',
    label: 'Desconectado'
  },
  connecting: {
    icon: Wifi,
    color: 'bg-status-warning text-white',
    label: 'Conectando...'
  }
};

export const WhatsAppStatus = () => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Status WhatsApp</CardTitle>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Gerenciar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {mockInstances.map((instance) => {
          const StatusIcon = statusConfig[instance.status].icon;
          
          return (
            <div
              key={instance.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-whatsapp-primary rounded-full flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-white" />
                </div>
                
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="text-sm font-medium text-foreground">
                      {instance.name}
                    </h4>
                    <Badge className={statusConfig[instance.status].color}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusConfig[instance.status].label}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {instance.number}
                  </p>
                  
                  <p className="text-xs text-muted-foreground">
                    Último acesso: {instance.lastSeen}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm font-medium text-foreground">
                  {instance.messagesCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  mensagens hoje
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};