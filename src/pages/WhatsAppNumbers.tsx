import { useState, useEffect } from 'react';
import { Plus, Smartphone, Wifi, WifiOff, QrCode, Trash2, RefreshCw, Webhook, Settings, Bug } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { CreateInstanceModal } from '@/components/whatsapp/CreateInstanceModal';
import { DeleteInstanceModal } from '@/components/whatsapp/DeleteInstanceModal';
import { QRCodeModal } from '@/components/whatsapp/QRCodeModal';
import { WebhookConfigModal } from '@/components/whatsapp/WebhookConfigModal';
import { EnvironmentDebug } from '@/components/debug/EnvironmentDebug';
import { SupabaseDebug } from '@/components/debug/SupabaseDebug';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WhatsAppInstance {
  id: string;
  name: string;
  instance_key: string;
  phone_number?: string;
  profile_name?: string;
  profile_picture_url?: string;
  status: 'close' | 'open' | 'connecting';
  is_active: boolean;
  qr_code?: string;
  last_connected_at?: string;
  created_at: string;
  updated_at: string;
  evolution_api_url?: string;
  evolution_api_key?: string;
  webhook_url?: string;
}

export default function WhatsAppNumbers() {
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [refreshingInstance, setRefreshingInstance] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('instances');
  
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { connectInstance, disconnectInstance, getQRCode, refreshInstanceStatus } = useEvolutionApi();

  // Query para buscar instâncias do WhatsApp
  const { 
    data: instances = [], 
    isLoading, 
    error,
    refetch 
  } = useSupabaseQuery({
    table: 'whatsapp_instances',
    queryKey: ['whatsapp-instances'],
    select: '*',
    filters: [
      { column: 'tenant_id', operator: 'eq', value: tenant?.id }
    ],
    orderBy: [{ column: 'created_at', ascending: false }],
    enabled: !!tenant?.id
  });

  // Mutation para atualizar status da instância
  const updateInstanceMutation = useSupabaseMutation({
    table: 'whatsapp_instances',
    invalidateKeys: ['whatsapp-instances']
  });

  // Verificação automática de status a cada 30 segundos
  useEffect(() => {
    const checkConnectionStatus = async () => {
      if (instances.length === 0) return;
      
      for (const instance of instances) {
        try {
          const status = await refreshInstanceStatus(instance.instance_key);
          if (status && status !== instance.status) {
            await updateInstanceMutation.mutateAsync({
              id: instance.id,
              updates: { 
                status,
                last_connected_at: status === 'open' ? new Date().toISOString() : instance.last_connected_at
              }
            });
          }
        } catch (error) {
          console.error(`Erro ao verificar status da instância ${instance.instance_key}:`, error);
        }
      }
    };

    const interval = setInterval(checkConnectionStatus, 30000); // 30 segundos
    
    // Verificação inicial após 5 segundos
    const timeout = setTimeout(checkConnectionStatus, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [instances, refreshInstanceStatus, updateInstanceMutation]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'close':
      default:
        return 'bg-red-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <Wifi className="h-4 w-4 text-green-600" />;
      case 'connecting':
        return <RefreshCw className="h-4 w-4 text-yellow-600 animate-spin" />;
      case 'close':
      default:
        return <WifiOff className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Conectado';
      case 'connecting':
        return 'Conectando';
      case 'close':
      default:
        return 'Desconectado';
    }
  };

  const handleConnect = async (instance: WhatsAppInstance) => {
    try {
      await connectInstance(instance.instance_key);
      toast({
        title: "Sucesso",
        description: "Instância conectada com sucesso"
      });
      refetch();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao conectar instância",
        variant: "destructive"
      });
    }
  };

  const handleDisconnect = async (instance: WhatsAppInstance) => {
    try {
      await disconnectInstance(instance.instance_key);
      toast({
        title: "Sucesso",
        description: "Instância desconectada com sucesso"
      });
      refetch();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao desconectar instância",
        variant: "destructive"
      });
    }
  };

  const handleShowQR = async (instance: WhatsAppInstance) => {
    try {
      const qrCode = await getQRCode(instance.instance_key);
      if (qrCode) {
        setSelectedInstance({ ...instance, qr_code: qrCode });
        setShowQRModal(true);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao obter QR Code",
        variant: "destructive"
      });
    }
  };

  const handleConfigureWebhook = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setShowWebhookModal(true);
  };

  const handleRefreshStatus = async (instance: WhatsAppInstance) => {
    setRefreshingInstance(instance.id);
    try {
      const status = await refreshInstanceStatus(instance.instance_key);
      if (status) {
        await updateInstanceMutation.mutateAsync({
          id: instance.id,
          updates: { status }
        });
        toast({
          title: "Sucesso",
          description: "Status atualizado com sucesso"
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar status",
        variant: "destructive"
      });
    } finally {
      setRefreshingInstance(null);
    }
  };



  const handleDelete = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setShowDeleteModal(true);
  };

  const resetModals = () => {
    setSelectedInstance(null);
    setShowCreateModal(false);
    setShowDeleteModal(false);
    setShowQRModal(false);
    setShowWebhookModal(false);
  };

  const connectedInstances = instances.filter(i => i.status === 'open').length;
  const totalInstances = instances.length;

  // Verificar se tenant ainda está carregando
  if (!tenant) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Números WhatsApp"
          description="Gerencie seus números e instâncias do WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Números WhatsApp' }
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Carregando informações do tenant...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Números WhatsApp"
          description="Gerencie seus números e instâncias do WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Números WhatsApp' }
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              Erro ao carregar instâncias: {error.message}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Números WhatsApp"
        description="Gerencie seus números e instâncias do WhatsApp"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Números WhatsApp' }
        ]}
        actions={
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                refetch();
                toast({
                  title: "Cache atualizado",
                  description: "Os dados foram recarregados do servidor"
                });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Número
            </Button>
          </div>
        }
      />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="instances" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Instâncias
          </TabsTrigger>
          <TabsTrigger value="debug" className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Configurações Técnicas
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="instances" className="space-y-6">

          {/* Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Números</p>
                <p className="text-2xl font-bold">{totalInstances}</p>
              </div>
              <Smartphone className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conectados</p>
                <p className="text-2xl font-bold text-green-600">{connectedInstances}</p>
              </div>
              <Wifi className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Desconectados</p>
                <p className="text-2xl font-bold text-red-600">{totalInstances - connectedInstances}</p>
              </div>
              <WifiOff className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

          {/* Lista de Instâncias */}
          <Card>
        <CardHeader>
          <CardTitle>Instâncias WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Carregando instâncias...</p>
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8">
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhum número cadastrado</h3>
              <p className="text-muted-foreground mb-4">
                Adicione seu primeiro número WhatsApp para começar a usar a plataforma
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Número
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {instances.map((instance) => (
                <div key={instance.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(instance.status)}`} />
                      {getStatusIcon(instance.status)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{instance.name}</h4>
                        <Badge variant={instance.is_active ? 'default' : 'secondary'}>
                          {instance.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Chave: {instance.instance_key}</p>
                        {instance.phone_number && (
                          <p>Número: {instance.phone_number}</p>
                        )}
                        {instance.profile_name && (
                          <p>Perfil: {instance.profile_name}</p>
                        )}
                        {instance.last_connected_at && (
                          <p>Última conexão: {format(new Date(instance.last_connected_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={instance.status === 'open' ? 'default' : 'secondary'}>
                      {getStatusText(instance.status)}
                    </Badge>
                    
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRefreshStatus(instance)}
                        disabled={refreshingInstance === instance.id}
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshingInstance === instance.id ? 'animate-spin' : ''}`} />
                      </Button>
                      
                      {instance.status === 'close' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleShowQR(instance)}
                          title="Conectar via QR Code"
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {instance.status === 'open' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleConfigureWebhook(instance)}
                            title="Configurar Webhook"
                          >
                            <Webhook className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDisconnect(instance)}
                            className="text-red-600 hover:text-red-700"
                            title="Desconectar"
                          >
                            <WifiOff className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(instance)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="debug" className="space-y-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configurações Técnicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <EnvironmentDebug />
                <SupabaseDebug />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modais */}
      <CreateInstanceModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={() => {
          resetModals();
          refetch();
        }}
      />

      {selectedInstance && (
        <>
          <DeleteInstanceModal
            open={showDeleteModal}
            onOpenChange={setShowDeleteModal}
            instance={selectedInstance}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />

          <QRCodeModal
            open={showQRModal}
            onOpenChange={setShowQRModal}
            instance={selectedInstance}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />

          <WebhookConfigModal
            open={showWebhookModal}
            onOpenChange={setShowWebhookModal}
            instance={selectedInstance}
            onSuccess={() => {
              resetModals();
              refetch();
            }}
          />
        </>
      )}
    </div>
  );
}