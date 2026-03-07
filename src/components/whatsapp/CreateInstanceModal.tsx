import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { Loader2, QrCode, Webhook, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
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
  
  // Webhook automation states
  const [enableWebhookAutomation, setEnableWebhookAutomation] = useState(true);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'configuring' | 'success' | 'error'>('idle');
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [retryAttempts, setRetryAttempts] = useState(3);
  const [retryDelay, setRetryDelay] = useState(2000);
  
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { createInstance, getQRCode, getDefaultWebhookUrl } = useEvolutionApi();

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
      tenant_id: tenant?.id,
      enableWebhookAutomation
    });

    setLoading(true);
    setWebhookStatus('idle');
    setWebhookError(null);

    try {
      // Verificar se o serviço Evolution API está disponível
      if (!createInstance) {
        console.error('❌ [CreateInstanceModal] Serviço Evolution API não está disponível');
        throw new Error('Serviço Evolution API não está disponível. Verifique as configurações.');
      }

      console.log('📡 [CreateInstanceModal] Criando instância na Evolution API e salvando no banco...');
      
      if (enableWebhookAutomation) {
        setWebhookStatus('configuring');
        console.log('🔗 [CreateInstanceModal] Configuração automática de webhook habilitada');
      }
      
      // Usar a função createInstance com configurações de webhook
      await createInstance(
        formData.instance_key, 
        import.meta.env.VITE_EVOLUTION_WEBHOOK_URL,
        {
          enableWebhookAutomation,
          retryAttempts,
          retryDelay
        }
      );
      
      if (enableWebhookAutomation) {
        setWebhookStatus('success');
        console.log('✅ [CreateInstanceModal] Webhook configurado automaticamente!');
      }
      
      console.log('✅ [CreateInstanceModal] Instância criada com sucesso!');

      // Show success message
      const successMessage = enableWebhookAutomation 
        ? "Instância criada com sucesso! Webhook configurado automaticamente. Conecte seu WhatsApp."
        : "Instância criada com sucesso! Conecte seu WhatsApp.";
        
      toast({
        title: "Sucesso",
        description: successMessage
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
      
      if (enableWebhookAutomation && error?.message?.includes('webhook')) {
        setWebhookStatus('error');
        setWebhookError(error.message);
      }
      
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
      } else if (error?.message?.includes('webhook')) {
        errorMessage = `Instância criada, mas erro na configuração do webhook: ${error.message}`;
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

              {/* Webhook Automation Section */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-4 w-4 text-blue-600" />
                      <CardTitle className="text-sm">Configuração Automática de Webhook</CardTitle>
                    </div>
                    <Switch
                      checked={enableWebhookAutomation}
                      onCheckedChange={setEnableWebhookAutomation}
                      disabled={loading}
                    />
                  </div>
                  <CardDescription className="text-xs">
                    Configura automaticamente o webhook para receber eventos do WhatsApp
                  </CardDescription>
                </CardHeader>
                
                {enableWebhookAutomation && (
                  <CardContent className="pt-0 space-y-3">
                    {/* Webhook Status */}
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium">Status:</Label>
                      {webhookStatus === 'idle' && (
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          Aguardando
                        </Badge>
                      )}
                      {webhookStatus === 'configuring' && (
                        <Badge variant="default" className="text-xs">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Configurando
                        </Badge>
                      )}
                      {webhookStatus === 'success' && (
                        <Badge variant="default" className="text-xs bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Configurado
                        </Badge>
                      )}
                      {webhookStatus === 'error' && (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1" />
                          Erro
                        </Badge>
                      )}
                    </div>

                    {/* Webhook URL */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">URL do Webhook:</Label>
                      <div className="bg-white border rounded px-2 py-1">
                        <code className="text-xs text-gray-600">
                          {getDefaultWebhookUrl ? getDefaultWebhookUrl() : env.VITE_EVOLUTION_WEBHOOK_URL}
                        </code>
                      </div>
                    </div>

                    {/* Error Message */}
                    {webhookError && (
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-red-800">Erro na configuração:</p>
                            <p className="text-xs text-red-700 mt-1">{webhookError}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Advanced Settings */}
                    <details className="group">
                      <summary className="text-xs font-medium cursor-pointer text-blue-600 hover:text-blue-800">
                        Configurações Avançadas
                      </summary>
                      <div className="mt-2 space-y-2 pl-4 border-l-2 border-blue-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Tentativas:</Label>
                            <Input
                              type="number"
                              min="1"
                              max="10"
                              value={retryAttempts}
                              onChange={(e) => setRetryAttempts(parseInt(e.target.value) || 3)}
                              className="h-7 text-xs"
                              disabled={loading}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Delay (ms):</Label>
                            <Input
                              type="number"
                              min="1000"
                              max="10000"
                              step="500"
                              value={retryDelay}
                              onChange={(e) => setRetryDelay(parseInt(e.target.value) || 2000)}
                              className="h-7 text-xs"
                              disabled={loading}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          Eventos configurados: QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT, MESSAGES_UPDATE, SEND_MESSAGE
                        </p>
                      </div>
                    </details>
                  </CardContent>
                )}
              </Card>


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