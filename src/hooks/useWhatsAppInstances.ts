import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';

export interface WhatsAppInstance {
  id: string;
  name: string;
  number: string;
  status: 'connected' | 'disconnected' | 'connecting';
  lastSeen: string;
  messagesCount: number;
}

export const useWhatsAppInstances = () => {
  const { currentTenant } = useTenant();

  // Buscar instâncias do WhatsApp
  const { data: instances, isLoading, error } = useSupabaseQuery({
    queryKey: ['whatsapp-instances', currentTenant?.id],
    table: 'whatsapp_instances',
    select: `
      id,
      name,
      phone_number,
      status,
      last_seen,
      created_at
    `,
    filters: currentTenant ? [{ column: 'tenant_id', operator: 'eq', value: currentTenant.id }] : [],
    enabled: !!currentTenant,
  });

  // Buscar contagem de mensagens de hoje para cada instância
  const { data: messageCounts } = useSupabaseQuery({
    queryKey: ['whatsapp-message-counts', currentTenant?.id],
    table: 'messages',
    select: `
      whatsapp_instance_id,
      count(*)
    `,
    filters: [
      ...(currentTenant ? [{ column: 'tenant_id', operator: 'eq', value: currentTenant.id }] : []),
      { column: 'created_at', operator: 'gte', value: new Date().toISOString().split('T')[0] + 'T00:00:00.000Z' }
    ],
    groupBy: ['whatsapp_instance_id'],
    enabled: !!currentTenant,
  });

  // Formatar dados para exibição
  const formattedInstances: WhatsAppInstance[] = (instances || []).map(instance => {
    const messageCount = messageCounts?.find(
      (count: any) => count.whatsapp_instance_id === instance.id
    )?.count || 0;

    return {
      id: instance.id,
      name: instance.name || `WhatsApp ${instance.phone_number}`,
      number: instance.phone_number,
      status: instance.status as 'connected' | 'disconnected' | 'connecting',
      lastSeen: instance.last_seen 
        ? new Date(instance.last_seen).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'Nunca',
      messagesCount: parseInt(messageCount) || 0
    };
  });

  return {
    instances: formattedInstances,
    isLoading,
    error
  };
};