import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createEvolutionApiService, EvolutionApiService } from '@/services/evolutionApi';
import { EvolutionInstance, DetailedEvolutionInstance } from '@/types/evolution.types';
import { useToast } from '@/hooks/use-toast';
import { env } from '@/lib/env';

interface UseEvolutionApiReturn {
  service: EvolutionApiService | null;
  instances: EvolutionInstance[];
  loading: boolean;
  error: string | null;
  createInstance: (name: string, webhookUrl?: string) => Promise<void>;
  deleteInstance: (instanceName: string) => Promise<void>;
  connectInstance: (instanceName: string) => Promise<{ pairingCode: string; code: string; count: number }>;
  disconnectInstance: (instanceName: string) => Promise<void>;
  getQRCode: (instanceName: string) => Promise<string | null>;
  getDetailedInstanceInfo: (instanceName: string) => Promise<DetailedEvolutionInstance | null>;
  sendMessage: (instanceName: string, phone: string, message: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
}

export const useEvolutionApi = (): UseEvolutionApiReturn => {
  const [service, setService] = useState<EvolutionApiService | null>(null);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const initializeServiceWithLogs = async () => {
      console.log('🔄 [useEvolutionApi] Iniciando inicialização do serviço...');
      
      try {
        setLoading(true);
        setError(null);
        console.log('🔍 [useEvolutionApi] Obtendo usuário autenticado...');

        // Get current user's tenant
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('❌ [useEvolutionApi] Usuário não autenticado');
          throw new Error('Usuário não autenticado');
        }
        console.log('✅ [useEvolutionApi] Usuário autenticado:', user.id);

        console.log('🔍 [useEvolutionApi] Buscando perfil do usuário...');
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        if (!profile) {
          console.error('❌ [useEvolutionApi] Perfil não encontrado para o usuário:', user.id);
          throw new Error('Perfil não encontrado');
        }
        console.log('✅ [useEvolutionApi] Perfil encontrado, tenant_id:', profile.tenant_id);

        // Get tenant's Evolution API settings
        console.log('🔍 [useEvolutionApi] Buscando configurações do tenant...');
        const { data: tenant } = await supabase
          .from('tenants')
          .select('settings')
          .eq('id', profile.tenant_id)
          .single();

        console.log('📊 [useEvolutionApi] Dados do tenant:', tenant);
        const settings = tenant?.settings as any;
        console.log('📊 [useEvolutionApi] Settings do tenant:', settings);
        
        let serverUrl, apiKey;
        
        if (settings?.evolutionApi) {
          // Use database settings if available
          serverUrl = settings.evolutionApi.serverUrl;
          apiKey = settings.evolutionApi.apiKey;
          console.log('✅ [useEvolutionApi] Usando configurações do banco de dados');
        } else {
          // Fallback to environment variables
        serverUrl = env.get('EVOLUTION_API_URL') || 'http://localhost:8081';
        apiKey = env.get('EVOLUTION_API_KEY') || 'convoflow-evolution-api-key-2024';
        console.log('⚠️ [useEvolutionApi] Configurações não encontradas no banco, usando variáveis de ambiente');
        console.log('🔧 [useEvolutionApi] URL da API:', serverUrl);
        console.log('🔧 [useEvolutionApi] API Key:', apiKey ? '***' + apiKey.slice(-4) : 'não definida');
        }
        
        if (!serverUrl || !apiKey) {
          const errorMsg = 'Configurações da Evolution API não encontradas nem no banco nem nas variáveis de ambiente';
          console.error('❌ [useEvolutionApi]', errorMsg);
          throw new Error(errorMsg);
        }
        console.log('✅ [useEvolutionApi] Configurações da Evolution API encontradas:', {
          serverUrl,
          apiKey: apiKey ? '***' + apiKey.slice(-4) : 'não definida'
        });
        
        console.log('🚀 [useEvolutionApi] Criando serviço Evolution API...');
        const evolutionService = createEvolutionApiService(serverUrl, apiKey);
        setService(evolutionService);
        console.log('✅ [useEvolutionApi] Serviço criado com sucesso');

        // Load instances from Evolution API
        console.log('📱 [useEvolutionApi] Carregando instâncias...');
        await loadInstances(evolutionService);
        console.log('🎉 [useEvolutionApi] Inicialização concluída com sucesso!');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao inicializar Evolution API';
        console.error('💥 [useEvolutionApi] Erro durante inicialização:', err);
        setError(errorMessage);
      } finally {
        setLoading(false);
        console.log('🏁 [useEvolutionApi] Processo de inicialização finalizado');
      }
    };

    initializeServiceWithLogs();
  }, []);

  const loadInstances = async (evolutionService?: EvolutionApiService) => {
    const serviceToUse = evolutionService || service;
    if (!serviceToUse) return;

    try {
      const apiInstances = await serviceToUse.getAllInstances();
      setInstances(apiInstances);
    } catch (err) {
      console.error('Error loading instances:', err);
      toast({
        title: "Erro",
        description: "Falha ao carregar instâncias do WhatsApp",
        variant: "destructive",
      });
    }
  };

  const createInstance = async (name: string, webhookUrl?: string, retryCount = 0) => {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 segundos
    
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      setLoading(true);
      
      // Create instance in Evolution API
      const newInstance = await service.createInstance({ instanceName: name, webhookUrl });
      
      // Save to database
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .single();

      await supabase.from('whatsapp_instances').insert({
        instance_key: name,
        name,
        tenant_id: profile!.tenant_id,
        status: newInstance.status || 'disconnected',
        webhook_url: webhookUrl,
      });

      await refreshInstances();
      
      toast({
        title: "Sucesso",
        description: "Instância criada com sucesso",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar instância';
      
      // Se for erro de sincronização e ainda temos tentativas, retry
      if (errorMessage.includes('sincronização com o servidor WhatsApp') && retryCount < maxRetries) {
        console.log(`🔄 Tentativa ${retryCount + 1}/${maxRetries + 1} - Aguardando ${retryDelay}ms antes de tentar novamente...`);
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return createInstance(name, webhookUrl, retryCount + 1);
      }
      
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteInstance = async (instanceName: string) => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      setLoading(true);
      
      // Delete from Evolution API
      await service.deleteInstance(instanceName);
      
      // Delete from database
      await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('instance_key', instanceName);

      await refreshInstances();
      
      toast({
        title: "Sucesso",
        description: "Instância removida com sucesso",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao remover instância';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const connectInstance = async (instanceName: string): Promise<{ pairingCode: string; code: string; count: number }> => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      const connectionData = await service.connectInstance(instanceName);
      await refreshInstances();
      
      toast({
        title: "Conectando",
        description: "Iniciando conexão da instância...",
      });
      
      return connectionData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar instância';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const disconnectInstance = async (instanceName: string) => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      await service.disconnectInstance(instanceName);
      await refreshInstances();
      
      toast({
        title: "Sucesso",
        description: "Instância desconectada",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao desconectar instância';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const getQRCode = async (instanceName: string): Promise<string | null> => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      const result = await service.getQRCode(instanceName);
      return result.qrcode;
    } catch (err) {
      console.error('Error getting QR code:', err);
      return null;
    }
  };

  const getDetailedInstanceInfo = async (instanceName: string): Promise<DetailedEvolutionInstance | null> => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      const result = await service.getDetailedInstanceInfo(instanceName);
      return result;
    } catch (err) {
      console.error('Error getting detailed instance info:', err);
      toast({
        title: "Erro",
        description: "Falha ao obter informações detalhadas da instância",
        variant: "destructive",
      });
      return null;
    }
  };

  const sendMessage = async (instanceName: string, phone: string, message: string) => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      await service.sendMessage(instanceName, phone, message);
      
      toast({
        title: "Sucesso",
        description: "Mensagem enviada",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const refreshInstances = async () => {
    await loadInstances();
  };

  return {
    service,
    instances,
    loading,
    error,
    createInstance,
    deleteInstance,
    connectInstance,
    disconnectInstance,
    getQRCode,
    getDetailedInstanceInfo,
    sendMessage,
    refreshInstances,
  };
};