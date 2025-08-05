import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Users, 
  TrendingUp, 
  Settings,
  Check,
  X,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  timestamp: string;
  icon: React.ReactNode;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Nova mensagem recebida',
    message: 'Ana Silva enviou uma nova mensagem no WhatsApp',
    type: 'info',
    isRead: false,
    timestamp: '2 minutos atrás',
    icon: <MessageSquare className="w-4 h-4" />
  },
  {
    id: '2',
    title: 'Lead movido no funil',
    message: 'Carlos Santos foi movido para "Proposta"',
    type: 'success',
    isRead: false,
    timestamp: '15 minutos atrás',
    icon: <TrendingUp className="w-4 h-4" />
  },
  {
    id: '3',
    title: 'Follow-up agendado',
    message: 'Lembrete: Ligar para Maria Oliveira às 14:00',
    type: 'warning',
    isRead: true,
    timestamp: '1 hora atrás',
    icon: <Clock className="w-4 h-4" />
  },
  {
    id: '4',
    title: 'Novo contato adicionado',
    message: 'João Pereira foi adicionado aos contatos',
    type: 'info',
    isRead: true,
    timestamp: '2 horas atrás',
    icon: <Users className="w-4 h-4" />
  },
  {
    id: '5',
    title: 'Problema de conexão',
    message: 'WhatsApp desconectado - verificar configurações',
    type: 'error',
    isRead: false,
    timestamp: '3 horas atrás',
    icon: <AlertCircle className="w-4 h-4" />
  }
];

export default function Notifications() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: true,
    whatsappMessages: true,
    funnelUpdates: true,
    followupReminders: true,
    systemAlerts: true
  });
  const { toast } = useToast();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    toast({
      title: "Todas as notificações foram marcadas como lidas",
    });
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-blue-600 bg-blue-100';
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description={`Gerencie suas notificações e preferências (${unreadCount} não lidas)`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Notificações' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <Check className="w-4 h-4 mr-2" />
              Marcar todas como lidas
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Notifications List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notificações Recentes
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {unreadCount}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border transition-all duration-200 ${
                    notification.isRead 
                      ? 'bg-muted/20 border-muted' 
                      : 'bg-card border-primary/20 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${getTypeColor(notification.type)}`}>
                      {notification.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className={`font-medium text-sm ${
                            notification.isRead ? 'text-muted-foreground' : 'text-foreground'
                          }`}>
                            {notification.title}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-muted-foreground">
                              {notification.timestamp}
                            </span>
                            <Badge variant="outline" className={getTypeBadge(notification.type)}>
                              {notification.type}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!notification.isRead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsRead(notification.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteNotification(notification.id)}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Preferences */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Preferências
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-notifications">Email</Label>
                    <p className="text-xs text-muted-foreground">
                      Receber notificações por email
                    </p>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={preferences.emailNotifications}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({...prev, emailNotifications: checked}))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="push-notifications">Push</Label>
                    <p className="text-xs text-muted-foreground">
                      Notificações push no navegador
                    </p>
                  </div>
                  <Switch
                    id="push-notifications"
                    checked={preferences.pushNotifications}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({...prev, pushNotifications: checked}))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="whatsapp-messages">WhatsApp</Label>
                    <p className="text-xs text-muted-foreground">
                      Novas mensagens recebidas
                    </p>
                  </div>
                  <Switch
                    id="whatsapp-messages"
                    checked={preferences.whatsappMessages}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({...prev, whatsappMessages: checked}))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="funnel-updates">Funil</Label>
                    <p className="text-xs text-muted-foreground">
                      Mudanças no funil de vendas
                    </p>
                  </div>
                  <Switch
                    id="funnel-updates"
                    checked={preferences.funnelUpdates}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({...prev, funnelUpdates: checked}))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="followup-reminders">Follow-ups</Label>
                    <p className="text-xs text-muted-foreground">
                      Lembretes de follow-up
                    </p>
                  </div>
                  <Switch
                    id="followup-reminders"
                    checked={preferences.followupReminders}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({...prev, followupReminders: checked}))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="system-alerts">Sistema</Label>
                    <p className="text-xs text-muted-foreground">
                      Alertas do sistema
                    </p>
                  </div>
                  <Switch
                    id="system-alerts"
                    checked={preferences.systemAlerts}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({...prev, systemAlerts: checked}))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
