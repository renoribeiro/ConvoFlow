import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createEvolutionApiService, EvolutionApiService } from '@/services/evolutionApi';
import { EvolutionInstance } from '@/types/evolution.types';
import { useToast } from '@/hooks/use-toast';

interface UseEvolutionApiReturn {
  service: EvolutionApiService | null;
  instances: EvolutionInstance[];
  loading: boolean;
  error: string | null;
  createInstance: (name: string, webhookUrl?: string) => Promise<void>;
  deleteInstance: (instanceName: string) => Promise<void>;
  connectInstance: (instanceName: string) => Promise<void>;
  disconnectInstance: (instanceName: string) => Promise<void>;
  getQRCode: (instanceName: string) => Promise<string | null>;
  sendMessage: (instanceName: string, phone: string, message: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
}

export const useEvolutionApi = (): UseEvolutionApiReturn => {
  const [service, setService] = useState<EvolutionApiService | null>(null);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Initialize service with tenant's Evolution API config
  const initializeService = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

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

      const settings = tenant?.settings as any;
      if (!settings?.evolutionApi) {
        setService(null);
        setInstances([]);
        return;
      }

      const { serverUrl, apiKey } = settings.evolutionApi;
      const evolutionService = createEvolutionApiService(serverUrl, apiKey);
      setService(evolutionService);

      // Load instances from Evolution API
      await loadInstances(evolutionService);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao inicializar Evolution API';
      setError(errorMessage);
      console.error('Error initializing Evolution API:', err);
    } finally {
      setLoading(false);
    }
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

  const createInstance = async (name: string, webhookUrl?: string) => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      setLoading(true);
      
      // Create instance in Evolution API
      const newInstance = await service.createInstance(name, webhookUrl);
      
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

  const connectInstance = async (instanceName: string) => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      await service.connectInstance(instanceName);
      await refreshInstances();
      
      toast({
        title: "Conectando",
        description: "Iniciando conexão da instância...",
      });
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

  useEffect(() => {
    initializeService();
  }, [initializeService]);

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
    sendMessage,
    refreshInstances,
  };
};