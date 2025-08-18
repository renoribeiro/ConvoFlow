import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, QrCode, Smartphone, Copy } from 'lucide-react';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { toast } from '@/hooks/use-toast';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceName: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  instanceName,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connectInstance } = useEvolutionApi();

  const fetchConnectionData = async () => {
    if (!instanceName) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log(`🔄 [QRCodeModal] Conectando instância: ${instanceName}`);
      
      const connectionData = await connectInstance(instanceName);
      
      if (connectionData) {
        console.log(`✅ [QRCodeModal] Dados de conexão obtidos:`, connectionData);
        setQrCode(connectionData.code);
        setPairingCode(connectionData.pairingCode);
      } else {
        console.log(`❌ [QRCodeModal] Dados de conexão não disponíveis`);
        setError('Dados de conexão não disponíveis. A instância pode já estar conectada.');
      }
    } catch (err) {
      console.error('❌ [QRCodeModal] Erro ao conectar instância:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar instância';
      setError(errorMessage);
      
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchConnectionData();
  };

  const copyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      toast({
        title: "Copiado!",
        description: "Código de pareamento copiado para a área de transferência",
      });
    }
  };

  useEffect(() => {
    if (isOpen && instanceName) {
      fetchConnectionData();
    }
  }, [isOpen, instanceName]);

  const handleClose = () => {
    setQrCode(null);
    setPairingCode(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Conecte sua instância <strong>{instanceName}</strong> escaneando o QR Code ou usando o código de pareamento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">Conectando instância...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="text-red-500 text-center">
                <p className="font-medium">Erro ao conectar instância</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          )}

          {(qrCode || pairingCode) && !loading && !error && (
            <div className="space-y-6">
              {/* Código de Pareamento */}
              {pairingCode && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-blue-900">Código de Pareamento</h3>
                    <Button 
                      onClick={copyPairingCode} 
                      variant="outline" 
                      size="sm"
                      className="h-8 px-2"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <div className="bg-white border rounded p-3 font-mono text-lg text-center tracking-wider">
                    {pairingCode}
                  </div>
                  <p className="text-sm text-blue-700 mt-2">
                    Digite este código no WhatsApp em <strong>Aparelhos conectados</strong> &gt; <strong>Conectar com código</strong>
                  </p>
                </div>
              )}

              {/* QR Code */}
              {qrCode && (
                <div className="flex flex-col items-center space-y-4">
                  <h3 className="font-medium text-gray-900">Ou escaneie o QR Code</h3>
                  <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                    <img 
                      src={qrCode} 
                      alt="QR Code para conexão WhatsApp" 
                      className="w-64 h-64 object-contain"
                    />
                  </div>
                  
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                      <Smartphone className="h-4 w-4" />
                      <span>Abra o WhatsApp no seu celular</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Vá em <strong>Configurações</strong> &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong>
                    </p>
                    <p className="text-sm text-gray-600">
                      Aponte a câmera para este QR Code
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-center">
                <Button onClick={handleRefresh} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar conexão
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleClose} variant="outline">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};