import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle, Info, Settings, Smartphone } from 'lucide-react';
import { ValidationSchemas, validateInput, UrlSanitizer } from '@/lib/validation';
import { useTenant } from '@/contexts/TenantContext';

export const WhatsAppApiSettings = () => {
  // A Conta vem do TenantContext, não de uma consulta própria a profiles. A
  // versão anterior relia o tenant_id do PERFIL, o que ignorava a Conta ativa:
  // superadmin (tenant_id nulo) quebrava no .single(), e dentro de uma Loja
  // impersonada gravava na Conta errada.
  const { tenant, updateTenantSettings } = useTenant();
  const [provider, setProvider] = useState<'evolution' | 'waha'>('evolution');
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const { toast } = useToast();

  const tenantSettings = tenant?.settings as any;

  // `settings` já veio carregado no contexto — sem duas queries a cada montagem.
  useEffect(() => {
    if (!tenantSettings) return;

    // Waha primeiro: quando as duas existem, vale o provedor configurado por último.
    if (tenantSettings.wahaApi) {
      setProvider('waha');
      setServerUrl(tenantSettings.wahaApi.serverUrl || '');
      setApiKey(tenantSettings.wahaApi.apiKey || '');
      setIsConfigured(true);
    } else if (tenantSettings.evolutionApi) {
      setProvider('evolution');
      setServerUrl(tenantSettings.evolutionApi.serverUrl || '');
      setApiKey(tenantSettings.evolutionApi.apiKey || '');
      setIsConfigured(true);
    }
  }, [tenantSettings]);

  const testConnection = async () => {
    const urlValidation = validateInput(ValidationSchemas.url, serverUrl);
    if (!urlValidation.success) {
      toast({ title: "Erro de Validação", description: urlValidation.error, variant: "destructive" });
      return;
    }

    const sanitizedUrl = UrlSanitizer.sanitizeUrl(serverUrl)?.replace(/\/$/, '');
    if (!sanitizedUrl) return;

    setTesting(true);
    try {
      let testUrl = '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (provider === 'evolution') {
        testUrl = `${sanitizedUrl}/instance/fetchInstances`;
        headers['apikey'] = apiKey;
      } else {
        // Waha test endpoint (usually version or sessions)
        testUrl = `${sanitizedUrl}/api/sessions`;
        headers['X-Api-Key'] = apiKey;
      }

      const response = await fetch(testUrl, { method: 'GET', headers });

      if (response.ok) {
        toast({ title: "Sucesso", description: `Conexão com ${provider === 'evolution' ? 'Evolution' : 'Waha'} API estabelecida!` });
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error: any) {
      toast({ title: "Erro na Conexão", description: error.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const saveSettings = async () => {
    const urlValidation = validateInput(ValidationSchemas.url, serverUrl);
    if (!urlValidation.success) {
      toast({ title: "Erro de Validação", description: urlValidation.error, variant: "destructive" });
      return;
    }

    const sanitizedUrl = UrlSanitizer.sanitizeUrl(serverUrl)?.replace(/\/$/, '');
    if (!sanitizedUrl) return;

    setLoading(true);
    try {
      // updateTenantSettings faz merge raso e grava pela RPC set_tenant_settings.
      // Antes isto era um UPDATE direto em `tenants`, que não tem policy de
      // UPDATE para gerente/gestor: o RLS descartava a linha, o PostgREST
      // devolvia 204 sem erro e a tela dizia "salvo" sem ter salvado nada.
      await updateTenantSettings(
        {
          [provider === 'evolution' ? 'evolutionApi' : 'wahaApi']: {
            serverUrl: sanitizedUrl,
            apiKey: apiKey,
          },
          whatsapp_provider: provider,
        },
        { silent: true },
      );

      setIsConfigured(true);
      toast({ title: "Sucesso", description: "Configurações salvas com sucesso!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Sem Conta ativa não há onde gravar — dizer isso é melhor que oferecer um
  // formulário que só vai falhar no Salvar.
  if (!tenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Configuração de API WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-muted">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Esta configuração é por Loja. Escolha uma Loja no seletor de Conta, no topo da tela,
              para poder ajustá-la.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Configuração de API WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provedor de API</Label>
            <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o provedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evolution">Evolution API</SelectItem>
                <SelectItem value="waha">Waha API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serverUrl">URL do Servidor *</Label>
            <Input
              id="serverUrl"
              placeholder={provider === 'evolution' ? "https://evolution.seu-dominio.com" : "https://waha.seu-dominio.com"}
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">Chave API (API Key) *</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Sua chave secreta"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={testConnection} disabled={loading || testing || !serverUrl} variant="outline">
              {testing ? "Testando..." : "Testar Conexão"}
            </Button>
            
            <Button onClick={saveSettings} disabled={loading || testing}>
              {loading ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </div>

        <Alert className="bg-muted">
          <Settings className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {provider === 'evolution' ? (
              "Evolution API é uma solução robusta baseada em Baileys. Certifique-se de usar a Global API Key."
            ) : (
              "Waha (WhatsApp HTTP API) é focada em estabilidade e facilidade de uso via Docker."
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
