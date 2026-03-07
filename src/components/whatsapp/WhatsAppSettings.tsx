
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Smartphone, 
  Plus, 
  Settings, 
  Wifi, 
  WifiOff, 
  QrCode,
  MessageSquare,
  Webhook,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { InstanceManager } from './InstanceManager';
import { WebhookConfig } from './WebhookConfig';
import { MessageTemplates } from './MessageTemplates';
import { SetupWizard } from './SetupWizard';
import { WhatsAppApiSettings } from './WhatsAppApiSettings';

export const WhatsAppSettings: React.FC = () => {
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [instances, setInstances] = useState([
    {
      instanceName: 'principal',
      status: 'open' as const,
      profileName: 'Empresa Demo',
      profilePicUrl: '',
      lastActivity: new Date(),
      messagesCount: 1247,
      webhookStatus: 'active'
    },
    {
      instanceName: 'vendas',
      status: 'close' as const,
      profileName: '',
      profilePicUrl: '',
      lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1000),
      messagesCount: 523,
      webhookStatus: 'inactive'
    }
  ]);

  const activeInstances = instances.filter(i => i.status === 'open').length;
  const totalMessages = instances.reduce((acc, i) => acc + i.messagesCount, 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-500';
      case 'close': return 'bg-red-500';
      case 'connecting': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <Wifi className="h-4 w-4" />;
      case 'close': return <WifiOff className="h-4 w-4" />;
      case 'connecting': return <Settings className="h-4 w-4 animate-spin" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Instâncias Ativas</p>
                <p className="text-2xl font-bold text-green-600">{activeInstances}</p>
              </div>
              <Smartphone className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Mensagens</p>
                <p className="text-2xl font-bold">{totalMessages.toLocaleString()}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Webhook Status</p>
                <p className="text-2xl font-bold text-purple-600">Ativo</p>
              </div>
              <Webhook className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Status das Instâncias</CardTitle>
            <Button onClick={() => setShowSetupWizard(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {instances.map((instance) => (
              <div key={instance.instanceName} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(instance.status)}`} />
                    {getStatusIcon(instance.status)}
                  </div>
                  <div>
                    <h4 className="font-semibold">{instance.instanceName}</h4>
                    <p className="text-sm text-muted-foreground">
                      {instance.profileName || 'Não conectado'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={instance.status === 'open' ? 'default' : 'secondary'}>
                    {instance.status === 'open' ? 'Conectado' : 'Desconectado'}
                  </Badge>
                  <Badge variant="outline">
                    {instance.messagesCount} mensagens
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Alertas */}
      <div className="space-y-4">
        {activeInstances === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Nenhuma instância do WhatsApp está conectada. Configure uma instância para começar a receber mensagens.
            </AlertDescription>
          </Alert>
        )}

        {instances.some(i => i.webhookStatus === 'inactive') && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Algumas instâncias estão com webhook inativo. Verifique as configurações de webhook para garantir o funcionamento dos chatbots.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Configurações detalhadas */}
      <Tabs defaultValue="instances" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="evolution">Evolution API</TabsTrigger>
          <TabsTrigger value="instances">Instâncias</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="evolution">
          <WhatsAppApiSettings />
        </TabsContent>

        <TabsContent value="instances">
          <InstanceManager 
            onInstancesChange={setInstances}
          />
        </TabsContent>

        <TabsContent value="webhooks">
          <WebhookConfig />
        </TabsContent>

        <TabsContent value="templates">
          <MessageTemplates />
        </TabsContent>
      </Tabs>

      {/* Setup Wizard Modal */}
      {showSetupWizard && (
        <SetupWizard 
          onClose={() => setShowSetupWizard(false)}
          onComplete={(instanceData) => {
            setInstances(prev => [...prev, instanceData]);
            setShowSetupWizard(false);
          }}
        />
      )}
    </div>
  );
};
