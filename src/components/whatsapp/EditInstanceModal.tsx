import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

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

interface EditInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance;
  onSuccess: () => void;
}

export const EditInstanceModal = ({ open, onOpenChange, instance, onSuccess }: EditInstanceModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    evolution_api_url: '',
    evolution_api_key: '',
    webhook_url: '',
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  
  const { toast } = useToast();

  const updateInstanceMutation = useSupabaseMutation({
    table: 'whatsapp_instances',
    invalidateKeys: ['whatsapp-instances']
  });

  // Preencher formulário quando a instância mudar
  useEffect(() => {
    if (instance) {
      setFormData({
        name: instance.name || '',
        evolution_api_url: instance.evolution_api_url || '',
        evolution_api_key: instance.evolution_api_key || '',
        webhook_url: instance.webhook_url || '',
        is_active: instance.is_active
      });
    }
  }, [instance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "Nome da instância é obrigatório",
        variant: "destructive"
      });
      return;
    }

    if (!formData.evolution_api_url.trim()) {
      toast({
        title: "Erro",
        description: "URL da Evolution API é obrigatória",
        variant: "destructive"
      });
      return;
    }

    if (!formData.evolution_api_key.trim()) {
      toast({
        title: "Erro",
        description: "Chave da Evolution API é obrigatória",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      await updateInstanceMutation.mutateAsync({
        id: instance.id,
        updates: {
          name: formData.name.trim(),
          evolution_api_url: formData.evolution_api_url.trim(),
          evolution_api_key: formData.evolution_api_key.trim(),
          webhook_url: formData.webhook_url.trim() || null,
          is_active: formData.is_active,
          updated_at: new Date().toISOString()
        }
      });

      toast({
        title: "Sucesso",
        description: "Instância atualizada com sucesso"
      });

      onSuccess();
    } catch (error: any) {
      console.error('Erro ao atualizar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar instância",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Editar Instância WhatsApp</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Instância *</Label>
              <Input
                id="name"
                placeholder="Ex: WhatsApp Vendas"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance_key">Chave da Instância</Label>
              <Input
                id="instance_key"
                value={instance.instance_key}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                A chave da instância não pode ser alterada após a criação.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="evolution_api_url">URL da Evolution API *</Label>
              <Input
                id="evolution_api_url"
                placeholder="https://api.evolution.com"
                value={formData.evolution_api_url}
                onChange={(e) => handleInputChange('evolution_api_url', e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                URL base da sua instância da Evolution API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="evolution_api_key">Chave da Evolution API *</Label>
              <Input
                id="evolution_api_key"
                type="password"
                placeholder="Sua chave da Evolution API"
                value={formData.evolution_api_key}
                onChange={(e) => handleInputChange('evolution_api_key', e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Chave de autenticação da Evolution API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook_url">URL do Webhook (Opcional)</Label>
              <Input
                id="webhook_url"
                placeholder="https://seu-dominio.com/webhook"
                value={formData.webhook_url}
                onChange={(e) => handleInputChange('webhook_url', e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                URL para receber eventos da Evolution API
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => handleInputChange('is_active', checked)}
                disabled={loading}
              />
              <Label htmlFor="is_active">Instância ativa</Label>
            </div>

            {/* Informações de Status */}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h4 className="font-medium text-sm">Informações da Instância</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-2 font-medium">
                    {instance.status === 'open' ? 'Conectado' : 
                     instance.status === 'connecting' ? 'Conectando' : 'Desconectado'}
                  </span>
                </div>
                {instance.phone_number && (
                  <div>
                    <span className="text-muted-foreground">Número:</span>
                    <span className="ml-2 font-medium">{instance.phone_number}</span>
                  </div>
                )}
                {instance.profile_name && (
                  <div>
                    <span className="text-muted-foreground">Perfil:</span>
                    <span className="ml-2 font-medium">{instance.profile_name}</span>
                  </div>
                )}
                {instance.last_connected_at && (
                  <div>
                    <span className="text-muted-foreground">Última conexão:</span>
                    <span className="ml-2 font-medium">
                      {new Date(instance.last_connected_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};