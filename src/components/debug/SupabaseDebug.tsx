import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface TenantSettings {
  evolutionApi?: {
    serverUrl: string;
    apiKey: string;
  };
}

interface DebugData {
  user: any;
  profile: any;
  tenant: any;
  settings: TenantSettings | null;
}

export const SupabaseDebug: React.FC = () => {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDebugData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      // Get tenant data
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profile.tenant_id)
        .single();

      if (tenantError) throw tenantError;

      const settings = tenant?.settings as TenantSettings;

      setDebugData({
        user,
        profile,
        tenant,
        settings
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(errorMessage);
      console.error('Error loading debug data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDebugData();
  }, []);

  const saveEvolutionApiSettings = async () => {
    if (!debugData?.tenant) return;

    try {
      setLoading(true);
      
      const newSettings = {
        ...debugData.settings,
        evolutionApi: {
          serverUrl: 'http://localhost:8081',
          apiKey: 'convoflow-evolution-api-key-2024'
        }
      };

      const { error } = await supabase
        .from('tenants')
        .update({ settings: newSettings })
        .eq('id', debugData.tenant.id);

      if (error) throw error;

      // Reload debug data
      await loadDebugData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao salvar configurações';
      setError(errorMessage);
      console.error('Error saving settings:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !debugData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Supabase Debug - Carregando...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Erro no Debug</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{error}</p>
          <Button onClick={loadDebugData} className="mt-2">Tentar Novamente</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Supabase Debug - Configurações do Tenant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Usuário</h3>
              <p><strong>ID:</strong> {debugData?.user?.id}</p>
              <p><strong>Email:</strong> {debugData?.user?.email}</p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Perfil</h3>
              <p><strong>Tenant ID:</strong> {debugData?.profile?.tenant_id}</p>
              <p><strong>Nome:</strong> {debugData?.profile?.full_name}</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Tenant</h3>
            <p><strong>ID:</strong> {debugData?.tenant?.id}</p>
            <p><strong>Nome:</strong> {debugData?.tenant?.name}</p>
            <p><strong>Plano:</strong> {debugData?.tenant?.plan}</p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Configurações Evolution API</h3>
            {debugData?.settings?.evolutionApi ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default">Configurado</Badge>
                </div>
                <p><strong>Server URL:</strong> {debugData.settings.evolutionApi.serverUrl}</p>
                <p><strong>API Key:</strong> {debugData.settings.evolutionApi.apiKey}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Não Configurado</Badge>
                </div>
                <p className="text-gray-600">Configurações da Evolution API não encontradas no tenant.</p>
                <Button onClick={saveEvolutionApiSettings} disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar Configurações Padrão'}
                </Button>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">Todas as Configurações (JSON)</h3>
            <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
              {JSON.stringify(debugData?.settings, null, 2)}
            </pre>
          </div>

          <Button onClick={loadDebugData} disabled={loading}>
            {loading ? 'Recarregando...' : 'Recarregar Dados'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};