import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Webhook,
  XCircle,
} from 'lucide-react';
import { env } from '@/lib/env';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';

export interface EvolutionFormValues {
  name: string;
  instance_key: string;
  enableWebhookAutomation: boolean;
  retryAttempts: number;
  retryDelay: number;
}

export const initialEvolutionValues = (): EvolutionFormValues => ({
  name: '',
  instance_key: '',
  enableWebhookAutomation: true,
  retryAttempts: 3,
  retryDelay: 2000,
});

export type EvolutionWebhookStatus = 'idle' | 'configuring' | 'success' | 'error';

interface Props {
  values: EvolutionFormValues;
  onChange: (patch: Partial<EvolutionFormValues>) => void;
  loading: boolean;
  webhookStatus?: EvolutionWebhookStatus;
  webhookError?: string | null;
}

export const EvolutionApiForm = ({
  values,
  onChange,
  loading,
  webhookStatus = 'idle',
  webhookError = null,
}: Props) => {
  const { getDefaultWebhookUrl } = useEvolutionApi();

  const generateInstanceKey = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    onChange({ instance_key: `instance_${timestamp}_${random}` });
  };

  const webhookUrl =
    (getDefaultWebhookUrl ? getDefaultWebhookUrl() : null) ||
    env.get('EVOLUTION_WEBHOOK_URL') ||
    '';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="evo-name">Nome da Instância *</Label>
        <Input
          id="evo-name"
          placeholder="Ex: WhatsApp Vendas"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="evo-key">Chave da Instância *</Label>
        <div className="flex gap-2">
          <Input
            id="evo-key"
            placeholder="Ex: vendas_001"
            value={values.instance_key}
            onChange={(e) => onChange({ instance_key: e.target.value })}
            disabled={loading}
          />
          <Button type="button" variant="outline" onClick={generateInstanceKey} disabled={loading}>
            Gerar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Identificador único para esta instância. Use apenas letras, números, _ e -.
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm">Configuração Automática de Webhook</CardTitle>
            </div>
            <Switch
              checked={values.enableWebhookAutomation}
              onCheckedChange={(v) => onChange({ enableWebhookAutomation: v })}
              disabled={loading}
            />
          </div>
          <CardDescription className="text-xs">
            Configura automaticamente o webhook da Evolution para receber eventos do WhatsApp.
          </CardDescription>
        </CardHeader>

        {values.enableWebhookAutomation && (
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Status:</Label>
              {webhookStatus === 'idle' && (
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" /> Aguardando
                </Badge>
              )}
              {webhookStatus === 'configuring' && (
                <Badge variant="default" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Configurando
                </Badge>
              )}
              {webhookStatus === 'success' && (
                <Badge variant="default" className="text-xs bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" /> Configurado
                </Badge>
              )}
              {webhookStatus === 'error' && (
                <Badge variant="destructive" className="text-xs">
                  <XCircle className="h-3 w-3 mr-1" /> Erro
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">URL do Webhook:</Label>
              <div className="bg-white border rounded px-2 py-1">
                <code className="text-xs text-gray-600 break-all">{webhookUrl}</code>
              </div>
            </div>

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
                      min={1}
                      max={10}
                      value={values.retryAttempts}
                      onChange={(e) =>
                        onChange({ retryAttempts: parseInt(e.target.value, 10) || 3 })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Delay (ms):</Label>
                    <Input
                      type="number"
                      min={1000}
                      max={10000}
                      step={500}
                      value={values.retryDelay}
                      onChange={(e) =>
                        onChange({ retryDelay: parseInt(e.target.value, 10) || 2000 })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Eventos: QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT, MESSAGES_UPDATE,
                  SEND_MESSAGE
                </p>
              </div>
            </details>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
