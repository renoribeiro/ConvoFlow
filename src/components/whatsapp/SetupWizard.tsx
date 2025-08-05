
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Smartphone } from 'lucide-react';

interface SetupWizardProps {
  onClose: () => void;
  onComplete: (instanceData: any) => void;
}

export const SetupWizard = ({ onClose, onComplete }: SetupWizardProps) => {
  const [step, setStep] = useState(1);
  const [instanceData, setInstanceData] = useState({
    instanceName: '',
    serverUrl: '',
    apiKey: '',
    status: 'close' as const,
    profileName: '',
    profilePicUrl: '',
    lastActivity: new Date(),
    messagesCount: 0,
    webhookStatus: 'inactive' as const
  });

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleComplete = () => {
    onComplete(instanceData);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <Smartphone className="h-16 w-16 mx-auto mb-4 text-blue-500" />
              <h3 className="text-lg font-semibold">Configuração Inicial</h3>
              <p className="text-muted-foreground">
                Vamos configurar sua primeira instância do WhatsApp
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input
                  id="instanceName"
                  value={instanceData.instanceName}
                  onChange={(e) => setInstanceData({...instanceData, instanceName: e.target.value})}
                  placeholder="Ex: principal, vendas, suporte"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serverUrl">URL do Servidor Evolution API</Label>
                <Input
                  id="serverUrl"
                  value={instanceData.serverUrl}
                  onChange={(e) => setInstanceData({...instanceData, serverUrl: e.target.value})}
                  placeholder="https://api.evolution.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">Chave da API</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={instanceData.apiKey}
                  onChange={(e) => setInstanceData({...instanceData, apiKey: e.target.value})}
                  placeholder="Sua chave da API"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold">Conectando...</h3>
              <p className="text-muted-foreground">
                Estabelecendo conexão com o servidor Evolution API
              </p>
            </div>
            
            <Card>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Validando credenciais...</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Criando instância...</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Configurando webhook...</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold">Configuração Concluída!</h3>
              <p className="text-muted-foreground">
                Sua instância foi criada com sucesso
              </p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-medium text-green-800 mb-2">Próximos Passos:</h4>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Conecte seu WhatsApp escaneando o QR Code</li>
                <li>• Configure os chatbots para esta instância</li>
                <li>• Teste o funcionamento enviando mensagens</li>
              </ul>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assistente de Configuração</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i <= step ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {i}
                </div>
                {i < 3 && <div className={`w-16 h-1 ${i < step ? 'bg-blue-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {renderStep()}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  Voltar
                </Button>
              )}
              {step < 3 ? (
                <Button onClick={handleNext}>
                  Próximo
                </Button>
              ) : (
                <Button onClick={handleComplete}>
                  Concluir
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
