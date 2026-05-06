import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { WahaInstanceInput } from '@/lib/validations/whatsappInstance';

interface UseWahaApiReturn {
  loading: boolean;
  createInstance: (input: WahaInstanceInput) => Promise<void>;
}

export const useWahaApi = (): UseWahaApiReturn => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createInstance = async (input: WahaInstanceInput) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();
      if (!profile?.tenant_id) throw new Error('Tenant do usuário não encontrado');

      const connectionConfig = {
        baseUrl: input.serverUrl.replace(/\/+$/, ''),
        apiKey: input.apiKey || '',
        sessionName: input.sessionName,
      };

      const { error: insertError } = await supabase
        .from('whatsapp_instances')
        .insert({
          tenant_id: profile.tenant_id,
          name: input.name,
          instance_key: input.sessionName,
          provider: 'waha',
          status: 'disconnected',
          // @ts-expect-error generated types may not yet include connection_config
          connection_config: connectionConfig,
        });

      if (insertError) {
        logger.error('Erro ao inserir instância WAHA', { error: insertError });
        throw new Error(insertError.message);
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      toast({
        title: 'Instância WAHA criada',
        description: 'Inicie a sessão no painel WAHA para começar a operar.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('useWahaApi.createInstance falhou', { message });
      toast({ title: 'Erro', description: message, variant: 'destructive' });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { loading, createInstance };
};
