import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';

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

interface DeleteInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance;
  onSuccess: () => void;
}

export const DeleteInstanceModal = ({ open, onOpenChange, instance, onSuccess }: DeleteInstanceModalProps) => {
  const [loading, setLoading] = useState(false);
  
  const { toast } = useToast();
  const { deleteInstance } = useEvolutionApi();

  const deleteInstanceMutation = useSupabaseMutation({
    table: 'whatsapp_instances',
    invalidateKeys: ['whatsapp-instances']
  });

  const handleDelete = async () => {
    setLoading(true);

    try {
      // Primeiro, tentar deletar da Evolution API
      try {
        await deleteInstance(instance.instance_key);
      } catch (evolutionError) {
        console.warn('Erro ao deletar da Evolution API (continuando):', evolutionError);
        // Continua mesmo se falhar na Evolution API
      }

      // Deletar do banco de dados
      await deleteInstanceMutation.mutateAsync({
        id: instance.id
      });

      toast({
        title: "Sucesso",
        description: "Instância deletada com sucesso"
      });

      onSuccess();
    } catch (error: any) {
      console.error('Erro ao deletar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao deletar instância",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Deletar Instância WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Atenção!</strong> Esta ação não pode ser desfeita.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Você está prestes a deletar a seguinte instância:
            </p>
            
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">Nome:</span>
                <span>{instance.name}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Chave:</span>
                <code className="bg-background px-2 py-1 rounded text-xs">
                  {instance.instance_key}
                </code>
              </div>
              
              {instance.phone_number && (
                <div className="flex justify-between">
                  <span className="font-medium">Número:</span>
                  <span>{instance.phone_number}</span>
                </div>
              )}
              
              {instance.profile_name && (
                <div className="flex justify-between">
                  <span className="font-medium">Perfil:</span>
                  <span>{instance.profile_name}</span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span className="font-medium">Status:</span>
                <span className={`font-medium ${
                  instance.status === 'open' ? 'text-green-600' : 
                  instance.status === 'connecting' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {instance.status === 'open' ? 'Conectado' : 
                   instance.status === 'connecting' ? 'Conectando' : 'Desconectado'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">O que será deletado:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• A instância será removida da Evolution API</li>
                <li>• Todos os dados da instância serão removidos do sistema</li>
                <li>• As mensagens associadas a esta instância permanecerão no sistema</li>
                <li>• A conexão WhatsApp será encerrada permanentemente</li>
              </ul>
            </div>

            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Importante:</strong> Se você quiser usar este número novamente, 
                precisará criar uma nova instância e reconectar o WhatsApp.
              </AlertDescription>
            </Alert>
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
          <Button 
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deletar Instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};