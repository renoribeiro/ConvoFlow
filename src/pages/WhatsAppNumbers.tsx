import { useState, useEffect } from 'react';
import { Plus, Smartphone, Wifi, WifiOff, QrCode, Trash2, RefreshCw, Webhook, Settings, Bug, Activity, AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shared/PageHeader';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useMetaApi } from '@/hooks/useMetaApi';
import { EmptyState } from '@/components/shared/EmptyState';
import { CreateInstanceModal } from '@/components/whatsapp/CreateInstanceModal';
import { DeleteInstanceModal } from '@/components/whatsapp/DeleteInstanceModal';
import { QRCodeModal } from '@/components/whatsapp/QRCodeModal';
import { WebhookConfigModal } from '@/components/whatsapp/WebhookConfigModal';
import { WebhookDashboard } from '@/components/webhook/WebhookDashboard';
import { EnvironmentDebug } from '@/components/debug/EnvironmentDebug';
import { SupabaseDebug } from '@/components/debug/SupabaseDebug';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ProviderType = 'evolution' | 'waha' | 'official';

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
  provider?: ProviderType;
  connection_config?: Record<string, any>;
}

const PROVIDER_BADGE: Record<ProviderType, { label: string; className: string }> = {
  official: { label: 'Oficial', className: 'bg-emerald-600 hover:bg-emerald-600 text-white' },
  waha: { label: 'WAHA', className: 'bg-sky-600 hover:bg-sky-600 text-white' },
  evolution: { label: 'Evolution', className: 'bg-slate-600 hover:bg-slate-600 text-white' },
};

export default function WhatsAppNumbers() {
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [refreshingInstance, setRefreshingInstance] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('instances');

  const [registeringInstance, setRegisteringInstance] = useState<string | null>(null);
  const [pinDialogInstance, setPinDialogInstance] = useState<WhatsAppInstance | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const { tenant, loading: tenantLoading } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { connectInstance, disconnectInstance, getQRCode, refreshInstanceStatus } = useEvolutionApi();
  const { verifyConnection: verifyMetaConnection } = useMetaApi();

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
    operation: 'update',
    invalidateQueries: [['whatsapp-instances']]
  });

  // Verificação automática de status a cada 30 segundos
  useEffect(() => {
    const checkConnectionStatus = async () => {
      if (instances.length === 0) return;
      
      for (const instance of instances) {
        // Polling de status Evolution não se aplica a Meta/WAHA
        if (instance.provider && instance.provider !== 'evolution') continue;
        try {
          const status = await refreshInstanceStatus(instance.instance_key);
          if (status && status !== instance.status) {
            await updateInstanceMutation.mutateAsync({
              data: { 
                status,
                last_connected_at: status === 'open' ? new Date().toISOString() : instance.last_connected_at
              },
              options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
            });
          }
        } catch (error) {
          console.error(`Erro ao verificar status da instância ${instance.instance_key}:`, error);
          // If the API returns an error, the instance likely no longer exists on the API side.
          // Mark it as 'close' so the UI reflects reality.
          if (instance.status === 'open' || instance.status === 'connecting') {
            try {
              await updateInstanceMutation.mutateAsync({
                data: { status: 'close' },
                options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
              });
            } catch (updateErr) {
              console.warn('Failed to update instance status to close:', updateErr);
            }
          }
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
          data: { status },
          options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
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

  const doRegisterNumber = async (instance: WhatsAppInstance, pin?: string) => {
    try {
      const body: Record<string, string> = { instanceId: instance.id };
      if (pin) body.pin = pin;

      const { data, error } = await supabase.functions.invoke('register-meta-number', { body });

      if (error) {
        logger.error('register-meta-number invoke error', { instanceId: instance.id, error });
        toast({ title: 'Erro', description: 'Falha ao chamar o serviço de registro.', variant: 'destructive' });
        return;
      }

      if (data?.pin_required) {
        setPinDialogInstance(instance);
        setPinValue('');
        return;
      }

      if (!data?.success) {
        toast({ title: 'Erro ao registrar', description: data?.error ?? 'Erro desconhecido.', variant: 'destructive' });
        return;
      }

      const pinInfo = data.pin ? ` PIN de verificação em duas etapas: ${data.pin} — guarde este PIN.` : '';
      toast({ title: 'Número registrado!', description: `Registro concluído com sucesso.${pinInfo}` });

      if (data.warning) {
        toast({ title: 'Aviso', description: data.warning, variant: 'destructive' });
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('register-meta-number falhou', { instanceId: instance.id, message });
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  const handleRegisterNumber = async (instance: WhatsAppInstance) => {
    setRegisteringInstance(instance.id);
    try {
      await doRegisterNumber(instance);
    } finally {
      setRegisteringInstance(null);
    }
  };

  const handlePinSubmit = async () => {
    if (!pinDialogInstance || pinValue.length !== 6) return;
    setPinSubmitting(true);
    try {
      await doRegisterNumber(pinDialogInstance, pinValue);
      setPinDialogInstance(null);
      setPinValue('');
    } finally {
      setPinSubmitting(false);
    }
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

  // Tenant ainda carregando — skeletons
  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Instâncias e APIs"
          description="Gerencie suas instâncias e integrações de WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Instâncias e APIs' }
          ]}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  // Usuário sem tenant (superadmin/account_manager sem vínculo).
  // Instâncias do WhatsApp pertencem a tenants, então não há o que gerenciar aqui.
  if (!tenant) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Instâncias e APIs"
          description="Gerencie suas instâncias e integrações de WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Instâncias e APIs' }
          ]}
        />
        <Card>
          <CardContent className="p-12">
            <EmptyState
              icon={<Smartphone className="h-6 w-6" />}
              title="Nenhuma Conta selecionada"
              description="Instâncias de WhatsApp são gerenciadas por Conta. Como superadmin, você não possui instâncias próprias — acesse a administração para gerenciar as Contas."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Instâncias e APIs"
          description="Gerencie suas instâncias e integrações de WhatsApp"
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Instâncias e APIs' }
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Erro ao carregar instâncias: {error.message}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instâncias e APIs"
        description="Gerencie suas instâncias e integrações de WhatsApp"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Instâncias e APIs' }
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
              Nova Instância
            </Button>
          </div>
        }
      />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="instances" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Instâncias
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoramento
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
                <p className="text-sm font-medium text-muted-foreground">Total de Instâncias</p>
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
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8">
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhuma instância cadastrada</h3>
              <p className="text-muted-foreground mb-4">
                Crie sua primeira instância de WhatsApp para começar a usar a plataforma
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Instância
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold">{instance.name}</h4>
                        <Badge
                          className={PROVIDER_BADGE[instance.provider || 'evolution'].className}
                        >
                          {PROVIDER_BADGE[instance.provider || 'evolution'].label}
                        </Badge>
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
                      {(!instance.provider || instance.provider === 'evolution') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRefreshStatus(instance)}
                          disabled={refreshingInstance === instance.id}
                          title="Atualizar status"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshingInstance === instance.id ? 'animate-spin' : ''}`} />
                        </Button>
                      )}

                      {(!instance.provider || instance.provider === 'evolution') &&
                        instance.status === 'close' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleShowQR(instance)}
                            title="Conectar via QR Code"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                        )}

                      {(!instance.provider || instance.provider === 'evolution') &&
                        instance.status === 'open' && (
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

                      {instance.provider === 'official' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => verifyMetaConnection(instance.id)}
                            title="Testar conexão Meta"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRegisterNumber(instance)}
                            disabled={registeringInstance === instance.id}
                            title="Registrar número na Cloud API"
                          >
                            {registeringInstance === instance.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <KeyRound className="h-4 w-4" />}
                          </Button>
                        </>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(instance)}
                        className="text-red-600 hover:text-red-700"
                        title="Excluir instância"
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
        
        <TabsContent value="monitoring" className="space-y-6">
          <WebhookDashboard />
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
                {/* <EnvironmentDebug /> */}
                {/* <SupabaseDebug /> */}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Diálogo de PIN para registro Meta */}
      <Dialog open={!!pinDialogInstance} onOpenChange={(open) => { if (!open) { setPinDialogInstance(null); setPinValue(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>PIN necessário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este número já possui um PIN de verificação em duas etapas configurado. Informe o PIN de 6 dígitos para prosseguir com o registro.
          </p>
          <div className="space-y-2">
            <Label htmlFor="register-pin">PIN (6 dígitos)</Label>
            <Input
              id="register-pin"
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPinDialogInstance(null); setPinValue(''); }} disabled={pinSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handlePinSubmit} disabled={pinValue.length !== 6 || pinSubmitting}>
              {pinSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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