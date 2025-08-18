import { Smartphone, Wifi, WifiOff, Loader2, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';

export const WhatsAppStatus = () => {
  const navigate = useNavigate();
  const { instances, isLoading, error } = useWhatsAppInstances();
  
  const handleManage = () => {
    navigate('/dashboard/whatsapp-numbers');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting':
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Conectado';
      case 'connecting':
        return 'Conectando';
      default:
        return 'Desconectado';
    }
  };
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Status WhatsApp</CardTitle>
        <Button variant="outline" size="sm" onClick={handleManage}>
          <Settings className="h-4 w-4 mr-2" />
          Gerenciar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
              <div className="text-right space-y-1">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))
        ) : error ? (
          <div className="text-center py-4 text-muted-foreground">
            Erro ao carregar instâncias do WhatsApp
          </div>
        ) : instances.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            Nenhuma instância do WhatsApp configurada
          </div>
        ) : (
          instances.map((instance) => (
            <div key={instance.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                {getStatusIcon(instance.status)}
                
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium text-foreground">{instance.name}</h4>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${getStatusColor(instance.status)} text-white`}
                    >
                      {getStatusText(instance.status)}
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
          ))
        )}
      </CardContent>
    </Card>
  );
};