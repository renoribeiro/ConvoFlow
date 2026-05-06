import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCog, Info } from 'lucide-react';

export interface WahaFormValues {
  name: string;
  serverUrl: string;
  apiKey: string;
  sessionName: string;
}

export const initialWahaValues = (): WahaFormValues => ({
  name: '',
  serverUrl: '',
  apiKey: '',
  sessionName: 'default',
});

interface Props {
  values: WahaFormValues;
  onChange: (patch: Partial<WahaFormValues>) => void;
  loading: boolean;
}

export const WahaApiForm = ({ values, onChange, loading }: Props) => {
  return (
    <div className="space-y-4">
      <Alert className="border-sky-200 bg-sky-50/60">
        <ServerCog className="h-4 w-4 text-sky-700" />
        <AlertTitle>WAHA — Servidor self-hosted</AlertTitle>
        <AlertDescription className="text-xs">
          Aponte o ConvoFlow para sua instância WAHA. As mensagens são enviadas e recebidas pelo
          provider WAHA já existente no backend; a sessão deve ser iniciada no painel WAHA antes de
          começar a operar.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="waha-name">Nome da Instância *</Label>
        <Input
          id="waha-name"
          placeholder="Ex: WhatsApp Suporte WAHA"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="waha-url">URL base do servidor WAHA *</Label>
        <Input
          id="waha-url"
          placeholder="https://waha.suaempresa.com"
          value={values.serverUrl}
          onChange={(e) => onChange({ serverUrl: e.target.value })}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="waha-key">API Key (opcional)</Label>
        <Input
          id="waha-key"
          type="password"
          placeholder="Deixe em branco se o servidor não exigir"
          value={values.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          disabled={loading}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="waha-session">Nome da sessão *</Label>
        <Input
          id="waha-session"
          placeholder="default"
          value={values.sessionName}
          onChange={(e) => onChange({ sessionName: e.target.value })}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Deve coincidir com o nome da sessão criada no seu servidor WAHA.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">Próximos passos</AlertTitle>
        <AlertDescription className="text-xs">
          Após salvar, inicie a sessão no painel WAHA e configure o webhook do WAHA para a função{' '}
          <code className="bg-background border px-1.5 py-0.5 rounded text-[11px]">waha-webhook</code>{' '}
          do Supabase.
        </AlertDescription>
      </Alert>
    </div>
  );
};
