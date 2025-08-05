import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, QrCode, CheckCircle, AlertCircle, Smartphone } from 'lucide-react';

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

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance;
  onSuccess: () => void;
}

export const QRCodeModal = ({ open, onOpenChange, instance, onSuccess }: QRCodeModalProps) => {
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(instance.qr_code || null);
  const [connectionStatus, setConnectionStatus] = useState(instance.status);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  const { toast } = useToast();
  const { getQRCode, getInstanceStatus } = useEvolutionApi();

  const fetchQRCode = async () => {
    setLoading(true);
    try {
      const qrData = await getQRCode(instance.instance_key);
      if (qrData?.qrcode) {
        setQrCode(qrData.qrcode);
      } else {
        throw new Error('QR Code não disponível');
      }
    } catch (error: any) {
      console.error('Erro ao buscar QR Code:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao buscar QR Code",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const checkConnectionStatus = async () => {
    try {
      const status = await getInstanceStatus(instance.instance_key);
      if (status?.instance?.state) {
        setConnectionStatus(status.instance.state);
        if (status.instance.state === 'open') {
          setAutoRefresh(false);
          onSuccess();
          toast({
            title: "Sucesso",
            description: "WhatsApp conectado com sucesso!"
          });
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
  };

  // Auto-refresh do status da conexão
  useEffect(() => {
    if (!open || !autoRefresh || connectionStatus === 'open') return;

    const interval = setInterval(() => {
      checkConnectionStatus();
    }, 3000); // Verifica a cada 3 segundos

    return () => clearInterval(interval);
  }, [open, autoRefresh, connectionStatus]);

  // Buscar QR Code quando o modal abrir
  useEffect(() => {
    if (open && connectionStatus !== 'open') {
      if (!qrCode) {
        fetchQRCode();
      }
      setAutoRefresh(true);
    }
  }, [open]);

  const handleRefreshQR = () => {
    setQrCode(null);
    fetchQRCode();
  };

  const getStatusInfo = () => {
    switch (connectionStatus) {
      case 'open':
        return {
          icon: <CheckCircle className="h-5 w-5 text-green-600" />,
          text: 'Conectado',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'connecting':
        return {
          icon: <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />,
          text: 'Conectando...',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200'
        };
      default:
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          text: 'Desconectado',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Conectar WhatsApp - {instance.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status da Conexão */}
          <Alert className={`${statusInfo.bgColor} ${statusInfo.borderColor}`}>
            <div className="flex items-center gap-2">
              {statusInfo.icon}
              <span className={`font-medium ${statusInfo.color}`}>
                Status: {statusInfo.text}
              </span>
            </div>
          </Alert>

          {connectionStatus === 'open' ? (
            // WhatsApp já conectado
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-600">WhatsApp Conectado!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Sua instância está conectada e pronta para uso.
                </p>
                {instance.phone_number && (
                  <p className="text-sm font-medium mt-2">
                    Número: {instance.phone_number}
                  </p>
                )}
                {instance.profile_name && (
                  <p className="text-sm text-muted-foreground">
                    Perfil: {instance.profile_name}
                  </p>
                )}
              </div>
            </div>
          ) : (
            // Mostrar QR Code para conexão
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Escaneie o QR Code</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Abra o WhatsApp no seu celular e escaneie o código abaixo:
                </p>
              </div>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-300">
                  {loading ? (
                    <div className="w-64 h-64 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : qrCode ? (
                    <img 
                      src={qrCode} 
                      alt="QR Code WhatsApp" 
                      className="w-64 h-64 object-contain"
                    />
                  ) : (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-muted-foreground">
                      <QrCode className="h-12 w-12 mb-2" />
                      <p className="text-sm text-center">
                        QR Code não disponível
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Instruções */}
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Como conectar:</p>
                    <ol className="text-sm space-y-1 ml-4">
                      <li>1. Abra o WhatsApp no seu celular</li>
                      <li>2. Toque em "Mais opções" (⋮) e depois em "Aparelhos conectados"</li>
                      <li>3. Toque em "Conectar um aparelho"</li>
                      <li>4. Aponte a câmera para este QR code</li>
                    </ol>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Botão para atualizar QR Code */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleRefreshQR}
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar QR Code
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};