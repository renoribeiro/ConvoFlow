import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

export interface WhatsAppInstance {
  id: string;
  name: string;
  instanceKey: string; // Chave da instância na Evolution API
  number: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'open' | 'close' | 'qrcode';
  provider: 'evolution' | 'waha' | 'official' | null;
  lastSeen: string;
  messagesCount: number;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
}

export const useWhatsAppInstances = () => {
  const { tenant } = useTenant();

  const { data: instances = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp-instances', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      // Fetch instances with safe column selection (no last_seen — may not exist in all schemas)
      const { data: rawInstances, error: instancesError } = await supabase
        .from('whatsapp_instances')
        .select('id, name, instance_key, phone_number, status, provider, created_at, updated_at, evolution_api_url, evolution_api_key')
        .eq('tenant_id', tenant.id);

      if (instancesError) {
        console.error('Failed to fetch whatsapp_instances:', instancesError);
        throw instancesError;
      }

      if (!rawInstances || rawInstances.length === 0) return [];

      // Fetch message counts separately with a simple count query per instance
      const instanceIds = rawInstances.map((i: any) => i.id);
      const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

      let messageCounts: Record<string, number> = {};
      try {
        const { data: msgs } = await supabase
          .from('messages')
          .select('whatsapp_instance_id')
          .eq('tenant_id', tenant.id)
          .gte('created_at', today)
          .in('whatsapp_instance_id', instanceIds);

        if (msgs) {
          for (const msg of msgs) {
            const id = (msg as any).whatsapp_instance_id;
            messageCounts[id] = (messageCounts[id] || 0) + 1;
          }
        }
      } catch (e) {
        // Non-critical, just means we can't show message counts
        console.warn('Failed to fetch message counts:', e);
      }

      return rawInstances.map((instance: any): WhatsAppInstance => ({
        id: instance.id,
        name: instance.name || `WhatsApp ${instance.phone_number || 'Sem número'}`,
        instanceKey: instance.instance_key,
        number: instance.phone_number || '',
        status: instance.status as WhatsAppInstance['status'],
        provider: (instance.provider as WhatsAppInstance['provider']) ?? null,
        lastSeen: instance.updated_at
          ? new Date(instance.updated_at).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'Nunca',
        messagesCount: messageCounts[instance.id] || 0,
        evolutionApiUrl: instance.evolution_api_url,
        evolutionApiKey: instance.evolution_api_key,
      }));
    },
    enabled: !!tenant?.id,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 30, // Refresh every 30s
  });

  return {
    instances,
    isLoading,
    error
  };
};