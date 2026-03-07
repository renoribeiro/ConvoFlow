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
  refreshInstanceStatus: (instanceName: string) => Promise<string | null | undefined>;
  getWebhookStatus: (instanceName: string) => Promise<any>;
  configureWebhook: (instanceName: string, webhookUrl?: string, events?: string[]) => Promise<boolean>;
  getWebhookLogs: (instanceName: string, limit?: number) => Promise<any[]>;
  getDefaultWebhookUrl: () => string | null;
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
          throw new Error('Usuário não autenticado');
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        if (!profile) {
          throw new Error('Perfil não encontrado');
        }

        // Get tenant's Evolution API settings
        const { data: tenant } = await supabase
          .from('tenants')
          .select('settings')
          .eq('id', profile.tenant_id)
          .single();

        const settings = tenant?.settings as { evolutionApi?: { serverUrl: string; apiKey: string } } | null;

        let serverUrl = settings?.evolutionApi?.serverUrl;
        let apiKey = settings?.evolutionApi?.apiKey;

        if (!serverUrl || !apiKey) {
          // Fallback seguro apenas para variáveis de ambiente, sem hardcoded localhost inseguro
          serverUrl = env.get('EVOLUTION_API_URL');
          apiKey = env.get('EVOLUTION_API_KEY');
        }

        // Se ainda assim não tiver configuração, logamos um aviso discreto mas permitimos carregar instâncias do banco
        if (serverUrl && apiKey) {
          const evolutionService = createEvolutionApiService(serverUrl, apiKey);
          setService(evolutionService);
        } else {
          console.warn('[useEvolutionApi] API URL ou Key não configuradas. Operações de API estarão indisponíveis.');
        }

        // Load instances from SUPABASE (not API) to avoid blocking if API is down
        await loadInstances();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao inicializar Evolution API';
        console.error('Error initializing Evolution API:', errorMessage);
        setError(errorMessage);
        // Even on error, try to load instances from DB
        await loadInstances();
      } finally {
        setLoading(false);
      }
    };

    initializeServiceWithLogs();
  }, []);

  const loadInstances = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      const { data: dbInstances, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('tenant_id', profile.tenant_id);

      if (error) throw error;

      // Map DB instances to EvolutionInstance type
      const mappedInstances: EvolutionInstance[] = (dbInstances || []).map(inst => {
        const config = inst.connection_config as any || {};
        return {
          instanceName: inst.instance_key,
          status: (inst.status as 'open' | 'close' | 'connecting' | 'qrcode') || 'close',
          serverUrl: config.baseUrl || inst.evolution_api_url || '',
          apiKey: config.apiKey || inst.evolution_api_key || '',
          qrcode: inst.qr_code || undefined,
          webhookUrl: inst.webhook_url || undefined,
          profilePicUrl: inst.profile_picture_url || undefined,
          profileName: inst.profile_name || undefined,
          settings: {
            // Default settings or fetch from DB JSON if available
            rejectCall: false,
            msgCall: "",
            groupsIgnore: false,
            alwaysOnline: true,
            readMessages: true,
            readStatus: true
          },
          createdAt: new Date(inst.created_at),
          lastActivity: inst.last_connected_at ? new Date(inst.last_connected_at) : undefined
        };
      });

      setInstances(mappedInstances);
    } catch (err) {
      console.error('Error loading instances from DB:', err);
      toast({
        title: "Erro",
        description: "Falha ao carregar instâncias do WhatsApp do banco de dados",
        variant: "destructive",
      });
    }
  };

  const createInstance = async (name: string, webhookUrl?: string, options?: {
    enableWebhookAutomation?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
  }) => {
    const maxRetries = options?.retryAttempts || 3;
    const retryDelay = options?.retryDelay || 2000;

    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      setLoading(true);
      console.log('🚀 [useEvolutionApi] Iniciando criação da instância:', name);
      console.log('🔗 [useEvolutionApi] Webhook URL:', webhookUrl);
      console.log('⚙️ [useEvolutionApi] Options:', options);

      let result;
      const enableAutomation = options?.enableWebhookAutomation ?? true;

      if (enableAutomation && service.createInstanceWithWebhook) {
        // Use the new automated webhook method if available
        console.log('🤖 [useEvolutionApi] Using automated webhook configuration');
        result = await service.createInstanceWithWebhook({
          instanceName: name,
          webhookUrl,
          retryAttempts: maxRetries,
          retryDelay
        });
      } else {
        // Use the traditional method
        console.log('📝 [useEvolutionApi] Using traditional instance creation');
        result = await service.createInstance({ instanceName: name, webhookUrl });
      }

      console.log('✅ [useEvolutionApi] Instância criada na Evolution API:', result);

      // Save to database
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .single();

      const instanceData = {
        instance_key: name,
        name,
        tenant_id: profile!.tenant_id,
        status: result?.status || 'disconnected',
        webhook_url: result?.webhookUrl || webhookUrl,
        webhook_configured: result?.webhookConfigured || false,
        webhook_events: enableAutomation ? ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'] : null,
        // @ts-ignore
        automation_enabled: enableAutomation
      };

      await supabase.from('whatsapp_instances').insert(instanceData);

      await refreshInstances();

      if (result?.webhookConfigured) {
        toast({
          title: "Sucesso",
          description: "Instância criada com webhook configurado automaticamente!",
        });
      } else {
        toast({
          title: "Sucesso",
          description: "Instância criada com sucesso",
        });
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar instância';
      console.error('❌ [useEvolutionApi] Erro ao criar instância:', err);

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
    // If service is available, delete from API. Else just DB.
    try {
      setLoading(true);

      if (service) {
        try {
          await service.deleteInstance(instanceName);
        } catch (e) {
          console.warn("Failed to delete from API, removing from DB anyway", e);
        }
      }

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
    // Return DB cached QR first if available, else try API
    const instance = instances.find(i => i.instanceName === instanceName);
    if (instance?.qrcode) return instance.qrcode;

    if (!service) return null;

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

  // Webhook monitoring methods
  const getWebhookStatus = async (instanceName: string) => {
    try {
      if (!service) throw new Error('Serviço Evolution API não inicializado');

      const webhookConfig = await service.getWebhookConfig(instanceName);

      return {
        configured: !!webhookConfig?.url,
        url: webhookConfig?.url || null,
        events: webhookConfig?.events || [],
        lastUpdate: null
      };
    } catch (error) {
      console.error('❌ [useEvolutionApi] Erro ao verificar status do webhook:', error);
      return {
        configured: false,
        url: null,
        events: [],
        lastUpdate: null,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  };

  const configureWebhook = async (instanceName: string, webhookUrl?: string, events?: string[]) => {
    try {
      if (!service) throw new Error('Serviço Evolution API não inicializado');

      const defaultEvents = [
        'QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE',
        'MESSAGES_DELETE', 'SEND_MESSAGE', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE',
        'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE', 'GROUPS_UPSERT',
        'GROUPS_UPDATE', 'GROUP_PARTICIPANTS_UPDATE', 'PRESENCE_UPDATE'
      ];
      const webhookEvents = events || defaultEvents;

      const finalWebhookUrl = webhookUrl || await getDefaultWebhookUrl();

      if (!finalWebhookUrl) {
        throw new Error('URL do webhook não fornecida e URL padrão não disponível');
      }

      await service.setWebhook(instanceName, finalWebhookUrl, webhookEvents);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      await supabase
        .from('whatsapp_instances')
        .update({
          webhook_url: finalWebhookUrl,
          webhook_configured: true,
          webhook_events: webhookEvents,
          updated_at: new Date().toISOString()
        })
        .eq('instance_key', instanceName)
        .eq('tenant_id', profile!.tenant_id);

      await refreshInstances();

      toast({
        title: "Sucesso",
        description: "Webhook configurado com sucesso",
      });

      return true;
    } catch (error) {
      console.error('❌ [useEvolutionApi] Erro ao configurar webhook:', error);
      toast({
        title: "Erro",
        description: `Erro ao configurar webhook: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        variant: "destructive",
      });
      return false;
    }
  };

  const getDefaultWebhookUrl = (): string | null => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        return `${supabaseUrl}/functions/v1/evolution-webhook`;
      }
      return null;
    } catch (error) {
      console.warn('Failed to get default webhook URL:', error);
      return null;
    }
  };

  const getWebhookLogs = async (instanceName: string, limit: number = 50) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('instance_name', instanceName)
        .eq('tenant_id', profile!.tenant_id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ [useEvolutionApi] Erro ao buscar logs do webhook:', error);
      return [];
    }
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
    refreshInstanceStatus: async (instanceName: string) => {
      if (!service) return null;
      try {
        const { instance } = await service.getInstanceStatus(instanceName);
        return instance?.state;
      } catch (error) {
        console.error('Error refreshing instance status:', error);
        return null;
      }
    },
    getWebhookStatus,
    configureWebhook,
    getWebhookLogs,
    getDefaultWebhookUrl,
  };
};
