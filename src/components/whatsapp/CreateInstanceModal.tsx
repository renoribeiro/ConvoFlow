import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { Loader2 } from 'lucide-react';

interface CreateInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateInstanceModal = ({ open, onOpenChange, onSuccess }: CreateInstanceModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    instance_key: '',
    evolution_api_url: '',
    evolution_api_key: '',
    webhook_url: '',
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { createInstance } = useEvolutionApi();

  const createInstanceMutation = useSupabaseMutation({
    table: 'whatsapp_instances',
    invalidateKeys: ['whatsapp-instances']
  });

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

    if (!formData.instance_key.trim()) {
      toast({
        title: "Erro",
        description: "Chave da instância é obrigatória",
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
      // Primeiro, criar a instância na Evolution API
      await createInstance(formData.instance_key, {
        instanceName: formData.instance_key,
        token: formData.evolution_api_key,
        qrcode: true,
        webhook: formData.webhook_url || undefined,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE'
        ]
      });

      // Depois, salvar no banco de dados
      await createInstanceMutation.mutateAsync({
        name: formData.name.trim(),
        instance_key: formData.instance_key.trim(),
        evolution_api_url: formData.evolution_api_url.trim(),
        evolution_api_key: formData.evolution_api_key.trim(),
        webhook_url: formData.webhook_url.trim() || null,
        is_active: formData.is_active,
        status: 'close',
        tenant_id: tenant?.id
      });

      toast({
        title: "Sucesso",
        description: "Instância criada com sucesso"
      });

      // Reset form
      setFormData({
        name: '',
        instance_key: '',
        evolution_api_url: '',
        evolution_api_key: '',
        webhook_url: '',
        is_active: true
      });

      onSuccess();
    } catch (error: any) {
      console.error('Erro ao criar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar instância",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const generateInstanceKey = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const key = `instance_${timestamp}_${random}`;
    handleInputChange('instance_key', key);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Número WhatsApp</DialogTitle>
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
              <Label htmlFor="instance_key">Chave da Instância *</Label>
              <div className="flex gap-2">
                <Input
                  id="instance_key"
                  placeholder="Ex: vendas_001"
                  value={formData.instance_key}
                  onChange={(e) => handleInputChange('instance_key', e.target.value)}
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateInstanceKey}
                  disabled={loading}
                >
                  Gerar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Identificador único para esta instância. Use apenas letras, números e underscore.
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
              Criar Instância
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};