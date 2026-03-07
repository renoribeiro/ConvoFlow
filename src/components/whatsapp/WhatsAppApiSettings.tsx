import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle, Settings, Smartphone } from 'lucide-react';
import { logger } from '@/lib/logger';
import { ValidationSchemas, validateInput, UrlSanitizer } from '@/lib/validation';

export const WhatsAppApiSettings = () => {
  const [provider, setProvider] = useState<'evolution' | 'waha'>('evolution');
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  const loadCurrentSettings = async () => {
    try {
      logger.info('Loading WhatsApp API settings');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      const { data: tenant } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', profile.tenant_id)
        .single();

      if (tenant?.settings) {
        const settings = tenant.settings as any;
        
        // Check for Waha first if preferred or Evolution
        if (settings.wahaApi) {
            setProvider('waha');
            setServerUrl(settings.wahaApi.serverUrl || '');
            setApiKey(settings.wahaApi.apiKey || '');
            setIsConfigured(true);
        } else if (settings.evolutionApi) {
            setProvider('evolution');
            setServerUrl(settings.evolutionApi.serverUrl || '');
            setApiKey(settings.evolutionApi.apiKey || '');
            setIsConfigured(true);
        }
      }
    } catch (error: any) {
      logger.error('Failed to load API settings', { error: error.message });
    }
  };

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
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };

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
    const sanitizedUrl = UrlSanitizer.sanitizeUrl(serverUrl)?.replace(/\/$/, '');
    if (!sanitizedUrl) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('user_id', user!.id).single();

      const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', profile!.tenant_id).single();
      const currentSettings = (tenant?.settings as any) || {};
      
      const apiConfig = {
        serverUrl: sanitizedUrl,
        apiKey: apiKey,
      };

      // Clean up previous configs to avoid confusion, or keep both? 
      // Better to store under the specific key but maybe a "preferred_provider" too.
      const updatedSettings = {
        ...currentSettings,
        [provider === 'evolution' ? 'evolutionApi' : 'wahaApi']: apiConfig,
        whatsapp_provider: provider
      };

      const { error } = await supabase.from('tenants').update({ settings: updatedSettings }).eq('id', profile!.tenant_id);

      if (error) throw error;

      setIsConfigured(true);
      toast({ title: "Sucesso", description: "Configurações salvas com sucesso!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
