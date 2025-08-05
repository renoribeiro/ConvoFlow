import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import { logger } from '@/lib/logger';
import { ValidationSchemas, validateInput, UrlSanitizer } from '@/lib/validation';

export const EvolutionApiSettings = () => {
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
      logger.info('Loading Evolution API settings');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('User not authenticated');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        logger.warn('Profile not found for user', { userId: user.id });
        return;
      }

      const { data: tenant } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', profile.tenant_id)
        .single();

      if (tenant?.settings) {
        const settings = tenant.settings as any;
        if (settings.evolutionApi) {
          const evolutionSettings = settings.evolutionApi;
          
          // Validate loaded settings
          const urlValidation = validateInput(ValidationSchemas.url, evolutionSettings.serverUrl);
          const apiKeyValidation = validateInput(ValidationSchemas.apiKey, evolutionSettings.apiKey);
          
          if (urlValidation.success && apiKeyValidation.success) {
            setServerUrl(evolutionSettings.serverUrl || '');
            setApiKey(evolutionSettings.apiKey || '');
            setIsConfigured(true);
            
            logger.info('Evolution API settings loaded successfully', {
              tenantId: profile.tenant_id,
              hasValidUrl: urlValidation.success,
              hasValidApiKey: apiKeyValidation.success
            });
          } else {
            logger.warn('Invalid Evolution API settings found', {
              tenantId: profile.tenant_id,
              urlError: urlValidation.error,
              apiKeyError: apiKeyValidation.error
            });
          }
        } else {
          logger.info('No Evolution API settings found', {
            tenantId: profile.tenant_id
          });
        }
      }
    } catch (error: any) {
      logger.error('Failed to load Evolution API settings', {
        error: error.message
      }, error);
    }
  };

  const testConnection = async () => {
    // Validate inputs
    const urlValidation = validateInput(ValidationSchemas.url, serverUrl);
    const apiKeyValidation = validateInput(ValidationSchemas.apiKey, apiKey);

    if (!urlValidation.success) {
      toast({
        title: "Erro de Validação",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    if (!apiKeyValidation.success) {
      toast({
        title: "Erro de Validação",
        description: apiKeyValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Sanitize URL
    const sanitizedUrl = UrlSanitizer.sanitizeUrl(serverUrl);
    if (!sanitizedUrl) {
      toast({
        title: "Erro",
        description: "URL do servidor inválida",
        variant: "destructive",
      });
      return;
    }

    setTesting(true);
    try {
      const testUrl = `${sanitizedUrl.replace(/\/$/, '')}/instance/fetchInstances`;
      
      logger.info('Testing Evolution API connection', {
        url: testUrl.replace(/\/[^/]*$/, '/***'), // Hide sensitive parts
        timestamp: new Date().toISOString()
      });

      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
      });

      if (response.ok) {
        logger.info('Evolution API connection successful');
        toast({
          title: "Sucesso",
          description: "Conexão com Evolution API estabelecida!",
        });
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error: any) {
      logger.error('Evolution API connection failed', {
        error: error.message,
        url: sanitizedUrl.replace(/\/[^/]*$/, '/***')
      }, error);
      
      toast({
        title: "Erro na Conexão",
        description: error.message || "Falha ao conectar com Evolution API",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const saveSettings = async () => {
    // Validate inputs
    const urlValidation = validateInput(ValidationSchemas.url, serverUrl);
    const apiKeyValidation = validateInput(ValidationSchemas.apiKey, apiKey);

    if (!urlValidation.success) {
      toast({
        title: "Erro de Validação",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    if (!apiKeyValidation.success) {
      toast({
        title: "Erro de Validação",
        description: apiKeyValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Sanitize URL
    const sanitizedUrl = UrlSanitizer.sanitizeUrl(serverUrl);
    if (!sanitizedUrl) {
      toast({
        title: "Erro",
        description: "URL do servidor inválida",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      logger.info('Saving Evolution API settings', {
        tenantId: profile.tenant_id,
        hasUrl: !!sanitizedUrl,
        hasApiKey: !!apiKey
      });

      // Get current settings
      const { data: tenant } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', profile.tenant_id)
        .single();

      const currentSettings = (tenant?.settings as any) || {};
      
      // Update Evolution API settings
      const updatedSettings = {
        ...currentSettings,
        evolutionApi: {
          serverUrl: sanitizedUrl.replace(/\/$/, ''), // Remove trailing slash
          apiKey: apiKey,
        }
      };

      const { error } = await supabase
        .from('tenants')
        .update({
          settings: updatedSettings
        })
        .eq('id', profile.tenant_id);

      if (error) throw error;

      logger.info('Evolution API settings saved successfully', {
        tenantId: profile.tenant_id
      });

      setIsConfigured(true);
      toast({
        title: "Sucesso",
        description: "Configurações da Evolution API salvas!",
      });
    } catch (error: any) {
      logger.error('Failed to save Evolution API settings', {
        error: error.message
      }, error);
      
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar configurações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuração Evolution API
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConfigured && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Evolution API configurada e pronta para uso.
            </AlertDescription>
          </Alert>
        )}

        {!isConfigured && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Configure sua Evolution API para habilitar o WhatsApp Business.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="serverUrl">URL do Servidor Evolution API *</Label>
            <Input
              id="serverUrl"
              placeholder="https://evolution-api.exemplo.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground">
              URL base do seu servidor Evolution API (sem barra no final)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">Chave API Global *</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sua-chave-api-global"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground">
              Chave API global configurada no seu servidor Evolution
            </p>
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={testConnection} 
              disabled={loading || testing || !serverUrl || !apiKey}
              variant="outline"
            >
              {testing ? "Testando..." : "Testar Conexão"}
            </Button>
            
            <Button 
              onClick={saveSettings} 
              disabled={loading || testing}
            >
              {loading ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2">Como configurar Evolution API:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Instale e configure seu servidor Evolution API</li>
            <li>Configure a chave API global no arquivo de configuração</li>
            <li>Insira a URL e chave API nos campos acima</li>
            <li>Teste a conexão e salve as configurações</li>
            <li>Agora você pode criar instâncias do WhatsApp</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};