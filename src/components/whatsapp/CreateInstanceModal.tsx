import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { Loader2, QrCode } from 'lucide-react';
import { env } from '@/lib/env';
import { QRCodeModal } from './QRCodeModal';

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
  const [showQRModal, setShowQRModal] = useState(false);
  const [createdInstanceName, setCreatedInstanceName] = useState('');
  
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { createInstance, getQRCode } = useEvolutionApi();

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

    console.log('🚀 [CreateInstanceModal] Iniciando criação de instância:', {
      name: formData.name,
      instance_key: formData.instance_key,
      tenant_id: tenant?.id
    });

    setLoading(true);

    try {
      // Verificar se o serviço Evolution API está disponível
      if (!createInstance) {
        console.error('❌ [CreateInstanceModal] Serviço Evolution API não está disponível');
        throw new Error('Serviço Evolution API não está disponível. Verifique as configurações.');
      }

      console.log('📡 [CreateInstanceModal] Criando instância na Evolution API e salvando no banco...');
      
      // Usar apenas a função createInstance do hook que já faz tudo:
      // 1. Cria na Evolution API
      // 2. Salva no banco de dados
      // 3. Atualiza a lista de instâncias
      await createInstance(formData.instance_key, env.VITE_EVOLUTION_WEBHOOK_URL);
      
      console.log('✅ [CreateInstanceModal] Instância criada com sucesso!');

      // Show success message
      toast({
        title: "Sucesso",
        description: "Instância criada com sucesso! Conecte seu WhatsApp."
      });
      
      // Store the created instance name and show QR modal
      setCreatedInstanceName(formData.instance_key);
      setShowQRModal(true);
      
      // Reset form and close creation modal
      setFormData({
        name: '',
        instance_key: ''
      });
      onOpenChange(false);

      console.log('🎉 [CreateInstanceModal] Processo de criação concluído com sucesso!');
      onSuccess();
    } catch (error: any) {
      console.error('💥 [CreateInstanceModal] Erro durante criação da instância:', {
        error,
        message: error?.message,
        stack: error?.stack,
        response: error?.response?.data,
        status: error?.response?.status
      });
      
      let errorMessage = 'Erro ao criar instância';
      
      // Identificar tipos específicos de erro
      if (error?.message?.includes('autenticação')) {
        errorMessage = 'Erro de autenticação com a Evolution API. Verifique a chave API.';
      } else if (error?.message?.includes('já existe')) {
        errorMessage = 'Instância já existe. Escolha uma chave diferente.';
      } else if (error?.message?.includes('servidor')) {
        errorMessage = 'Erro interno do servidor Evolution API. Tente novamente.';
      } else if (error?.message?.includes('conexão')) {
        errorMessage = 'Erro de conexão com a Evolution API. Verifique se o serviço está rodando.';
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      console.log('🏁 [CreateInstanceModal] Processo finalizado');
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
    <>
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
      
      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => {
          setShowQRModal(false);
          setCreatedInstanceName('');
        }}
        instanceName={createdInstanceName}
      />
    </>
  );
};

export default CreateInstanceModal;