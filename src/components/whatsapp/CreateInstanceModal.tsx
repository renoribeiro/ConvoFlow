import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { Loader2, QrCode } from 'lucide-react';
import { env } from '@/lib/env';

interface CreateInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateInstanceModal = ({ open, onOpenChange, onSuccess }: CreateInstanceModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    instance_key: ''
  });
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { createInstance, getQRCode } = useEvolutionApi();

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



    setLoading(true);

    try {
      // Primeiro, criar a instância na Evolution API com configurações padrão
      await createInstance(formData.instance_key, {
        instanceName: formData.instance_key,
        token: env.VITE_EVOLUTION_API_KEY,
        qrcode: true,
        webhook: env.VITE_EVOLUTION_WEBHOOK_URL || undefined,
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

      // Salvar no banco de dados com configurações padrão
      await createInstanceMutation.mutateAsync({
        name: formData.name.trim(),
        instance_key: formData.instance_key.trim(),
        evolution_api_url: env.VITE_EVOLUTION_API_URL,
        evolution_api_key: env.VITE_EVOLUTION_API_KEY,
        webhook_url: env.VITE_EVOLUTION_WEBHOOK_URL || null,
        is_active: true,
        status: 'close',
        tenant_id: tenant?.id
      });

      // Aguardar um momento e obter o QR Code
      setTimeout(async () => {
        try {
          const qrCodeData = await getQRCode(formData.instance_key);
          if (qrCodeData) {
            setQrCode(qrCodeData);
            setShowQrCode(true);
          }
        } catch (error) {
          console.error('Erro ao obter QR Code:', error);
        }
      }, 2000);

      toast({
        title: "Sucesso",
        description: "Instância criada com sucesso! Aguarde o QR Code..."
      });

      // Reset form apenas se não estiver mostrando QR Code
      if (!showQrCode) {
        setFormData({
          name: '',
          instance_key: ''
        });
      }

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

            {showQrCode && qrCode && (
              <div className="space-y-2 text-center">
                <Label>QR Code para Conexão</Label>
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <img src={qrCode} alt="QR Code" className="max-w-[200px] max-h-[200px]" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Escaneie este QR Code com o WhatsApp para conectar sua instância
                </p>
              </div>
            )}
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
            {showQrCode ? (
              <Button
                type="button"
                onClick={() => {
                  setShowQrCode(false);
                  setQrCode(null);
                  setFormData({ name: '', instance_key: '' });
                  onSuccess();
                }}
              >
                <QrCode className="mr-2 h-4 w-4" />
                Finalizar
              </Button>
            ) : (
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Instância
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};