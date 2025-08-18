import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { useEvolutionStore } from '@/stores/evolutionStore';

interface RealTimeUpdateOptions {
  enabled?: boolean;
  interval?: number; // Intervalo em ms para polling (fallback)
  tables?: string[]; // Tabelas para monitorar
}

export const useRealTimeUpdates = (options: RealTimeUpdateOptions = {}) => {
  const {
    enabled = true,
    interval = 30000, // 30 segundos por padrão
    tables = ['messages', 'contacts', 'mass_message_campaigns', 'chatbots', 'whatsapp_instances']
  } = options;

  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const [isConnected, setIsConnected] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Usar Evolution Store para monitorar mudanças
  const { instances, messages, contacts, chats } = useEvolutionStore();
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

  // Função para invalidar queries relacionadas ao dashboard
  const invalidateDashboardQueries = () => {
    if (!currentTenant) return;

    // Invalidar queries de métricas
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] });
    queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
    queryClient.invalidateQueries({ queryKey: ['recent-conversations'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    
    // Invalidar contadores
    queryClient.invalidateQueries({ queryKey: ['count', 'contacts'] });
    queryClient.invalidateQueries({ queryKey: ['count', 'messages'] });
    queryClient.invalidateQueries({ queryKey: ['count', 'mass_message_campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['count', 'chatbots'] });
    
    console.log('Dashboard queries invalidated for real-time update');
  };

  // Monitorar mudanças no Evolution Store
  useEffect(() => {
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime > 1000) { // Throttle para evitar muitas atualizações
      console.log('Evolution store data changed, updating dashboard');
      invalidateDashboardQueries();
      setLastUpdateTime(currentTime);
    }
  }, [instances, messages, contacts, chats]);

  // Fallback para polling se WebSocket não estiver disponível
  useEffect(() => {
    if (!enabled || !currentTenant) return;

    // Se há dados no Evolution Store, considerar conectado
    if (instances.length > 0) {
      setIsConnected(true);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Usar polling como fallback
    console.log('Using polling for real-time updates (WebSocket not available)');
    
    intervalRef.current = setInterval(() => {
      invalidateDashboardQueries();
    }, interval);

    setIsConnected(true);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, currentTenant, wsConnected, interval]);

  // Função manual para forçar atualização
  const forceUpdate = () => {
    invalidateDashboardQueries();
  };

  // Função para pausar/retomar atualizações
  const pause = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsConnected(false);
  };

  const resume = () => {
    if (!enabled || !currentTenant || instances.length > 0) return;
    
    intervalRef.current = setInterval(() => {
      invalidateDashboardQueries();
    }, interval);
    setIsConnected(true);
  };

  return {
    isConnected: instances.length > 0 || isConnected,
    isWebSocketConnected: instances.length > 0,
    isPolling: instances.length === 0 && isConnected,
    forceUpdate,
    pause,
    resume
  };
};