
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QrCode, Smartphone, Trash2, Settings, Plus, Loader2 } from 'lucide-react';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useToast } from '@/hooks/use-toast';

interface InstanceManagerProps {
  onInstancesChange?: (instances: any[]) => void;
}

export const InstanceManager = ({ onInstancesChange }: InstanceManagerProps) => {
  const { 
    instances, 
    loading, 
    error, 
    createInstance, 
    deleteInstance, 
    connectInstance, 
    getQRCode,
    refreshInstances 
  } = useEvolutionApi();
  
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (onInstancesChange) {
      onInstancesChange(instances);
    }
  }, [instances, onInstancesChange]);

  const handleConnect = async (instanceName: string) => {
    try {
      setConnecting(instanceName);
      await connectInstance(instanceName);
      
      // Get QR code
      const qr = await getQRCode(instanceName);
      if (qr) {
        setQrCode(qr);
      } else {
        toast({
          title: "Aviso",
          description: "Não foi possível obter o QR Code. Tente novamente.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error connecting instance:', error);
    } finally {
      setConnecting(null);
    }
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast({
        title: "Erro",
        description: "Nome da instância é obrigatório",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use Supabase Edge Function URL for webhook
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;
      await createInstance(newInstanceName.trim(), webhookUrl);
      setNewInstanceName('');
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Error creating instance:', error);
    }
  };

  const handleDeleteInstance = async (instanceName: string) => {
    if (!confirm('Tem certeza que deseja excluir esta instância?')) {
      return;
    }

    try {
      await deleteInstance(instanceName);
    } catch (error) {
      console.error('Error deleting instance:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'default';
      case 'connecting': return 'secondary';
      case 'qrcode': return 'outline';
      default: return 'destructive';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open': return 'Conectado';
      case 'connecting': return 'Conectando';
      case 'qrcode': return 'Aguardando QR';
      case 'close': return 'Desconectado';
      default: return 'Desconhecido';
    }
  };

  if (loading && instances.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Carregando instâncias...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <p className="text-destructive mb-4">Erro ao carregar Evolution API:</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={refreshInstances}>Tentar Novamente</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Instâncias WhatsApp</h2>
          <p className="text-muted-foreground">Gerencie suas conexões do WhatsApp</p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Instância</DialogTitle>
              <DialogDescription>
                Crie uma nova instância do WhatsApp para conectar um número
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input
                  id="instanceName"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Ex: whatsapp-vendas"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateInstance} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Criar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {instances.map((instance) => (
          <Card key={instance.instanceName}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{instance.instanceName}</CardTitle>
                <Badge variant={getStatusColor(instance.status)}>
                  {getStatusText(instance.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {instance.profileName && (
                  <p>Perfil: {instance.profileName}</p>
                )}
                <p>Criado em: {new Date(instance.createdAt).toLocaleDateString()}</p>
                {instance.lastActivity && (
                  <p>Última atividade: {new Date(instance.lastActivity).toLocaleString()}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {(instance.status === 'close' || instance.status === 'qrcode') && (
                  <Button 
                    size="sm" 
                    onClick={() => handleConnect(instance.instanceName)}
                    disabled={connecting === instance.instanceName}
                  >
                    {connecting === instance.instanceName ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <QrCode className="h-4 w-4 mr-2" />
                    )}
                    {connecting === instance.instanceName ? 'Conectando...' : 'Conectar'}
                  </Button>
                )}
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDeleteInstance(instance.instanceName)}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {qrCode && (
        <Card>
          <CardHeader>
            <CardTitle>QR Code para Conexão</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="bg-white p-4 rounded-lg inline-block">
              <img src={qrCode} alt="QR Code" className="mx-auto mb-4 w-64 h-64" />
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Escaneie este código QR com seu WhatsApp para conectar
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              O código expira em alguns minutos. Se não funcionar, tente gerar novamente.
            </p>
            <div className="flex gap-2 justify-center mt-4">
              <Button 
                variant="outline" 
                onClick={() => setQrCode(null)}
              >
                Fechar
              </Button>
              <Button 
                onClick={() => {
                  setQrCode(null);
                  // Trigger refresh to get new QR code
                  setTimeout(() => refreshInstances(), 1000);
                }}
              >
                Atualizar QR Code
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
