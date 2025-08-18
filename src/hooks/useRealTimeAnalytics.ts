import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsFilters } from '@/components/analytics/AdvancedFilters';

// Interfaces
interface RealTimeAnalyticsData {
  metrics: {
    totalLeads: number;
    totalConversions: number;
    totalRevenue: number;
    avgConversionRate: number;
    avgTicket: number;
    activeVisitors: number;
  };
  chartData: ChartDataPoint[];
  sourceData: SourcePerformance[];
  funnelData: FunnelStage[];
  lastUpdated: Date;
}

interface ChartDataPoint {
  date: string;
  leads: number;
  conversions: number;
  revenue: number;
  visitors: number;
  conversionRate: number;
  avgTicket: number;
}

interface SourcePerformance {
  source: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  cost: number;
  roi: number;
  trend: 'up' | 'down' | 'stable';
}

interface FunnelStage {
  name: string;
  value: number;
  percentage: number;
  color: string;
  change: number;
}

interface UseRealTimeAnalyticsOptions {
  filters: AnalyticsFilters;
  updateInterval?: number; // em milissegundos
  enableWebSocket?: boolean;
  enablePolling?: boolean;
}

interface UseRealTimeAnalyticsReturn {
  data: RealTimeAnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  lastUpdate: Date | null;
  forceRefresh: () => void;
  pauseUpdates: () => void;
  resumeUpdates: () => void;
  isPaused: boolean;
}

// Hook principal
export const useRealTimeAnalytics = ({
  filters,
  updateInterval = 30000, // 30 segundos por padrão
  enableWebSocket = true,
  enablePolling = true
}: UseRealTimeAnalyticsOptions): UseRealTimeAnalyticsReturn => {
  const [data, setData] = useState<RealTimeAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Função para buscar dados do servidor
  const fetchAnalyticsData = useCallback(async (): Promise<RealTimeAnalyticsData | null> => {
    try {
      // Cancelar requisição anterior se existir
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Buscar métricas principais
      const { data: metricsData, error: metricsError } = await supabase
        .from('tracking_metrics_view')
        .select('*')
        .gte('created_at', getDateFromFilter(filters.quickDate))
        .abortSignal(signal);

      if (metricsError) throw metricsError;

      // Buscar dados do gráfico temporal
      const { data: chartData, error: chartError } = await supabase
        .from('daily_analytics_view')
        .select('*')
        .gte('date', getDateFromFilter(filters.quickDate))
        .order('date', { ascending: true })
        .abortSignal(signal);

      if (chartError) throw chartError;

      // Buscar performance por fonte
      const { data: sourceData, error: sourceError } = await supabase
        .from('source_performance_view')
        .select('*')
        .gte('date', getDateFromFilter(filters.quickDate))
        .abortSignal(signal);

      if (sourceError) throw sourceError;

      // Buscar dados do funil
      const { data: funnelData, error: funnelError } = await supabase
        .from('conversion_funnel_view')
        .select('*')
        .gte('date', getDateFromFilter(filters.quickDate))
        .abortSignal(signal);

      if (funnelError) throw funnelError;

      // Processar e formatar os dados
      const processedData = processAnalyticsData({
        metrics: metricsData,
        chart: chartData,
        sources: sourceData,
        funnel: funnelData
      });

      return processedData;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null; // Requisição cancelada, não é um erro
      }
      console.error('Erro ao buscar dados de análise:', err);
      throw err;
    }
  }, [filters]);

  // Função para processar dados brutos
  const processAnalyticsData = (rawData: any): RealTimeAnalyticsData => {
    // Calcular métricas principais
    const metrics = {
      totalLeads: rawData.metrics?.reduce((sum: number, item: any) => sum + (item.leads || 0), 0) || 0,
      totalConversions: rawData.metrics?.reduce((sum: number, item: any) => sum + (item.conversions || 0), 0) || 0,
      totalRevenue: rawData.metrics?.reduce((sum: number, item: any) => sum + (item.revenue || 0), 0) || 0,
      avgConversionRate: 0,
      avgTicket: 0,
      activeVisitors: Math.floor(Math.random() * 50) + 10 // Mock para visitantes ativos
    };

    metrics.avgConversionRate = metrics.totalLeads > 0 ? (metrics.totalConversions / metrics.totalLeads) * 100 : 0;
    metrics.avgTicket = metrics.totalConversions > 0 ? metrics.totalRevenue / metrics.totalConversions : 0;

    // Processar dados do gráfico
    const chartData: ChartDataPoint[] = rawData.chart?.map((item: any) => ({
      date: item.date,
      leads: item.leads || 0,
      conversions: item.conversions || 0,
      revenue: item.revenue || 0,
      visitors: item.visitors || 0,
      conversionRate: item.leads > 0 ? (item.conversions / item.leads) * 100 : 0,
      avgTicket: item.conversions > 0 ? item.revenue / item.conversions : 0
    })) || [];

    // Processar dados de fonte
    const sourceData: SourcePerformance[] = rawData.sources?.map((item: any) => ({
      source: item.source || 'Desconhecido',
      leads: item.leads || 0,
      conversions: item.conversions || 0,
      revenue: item.revenue || 0,
      conversionRate: item.leads > 0 ? (item.conversions / item.leads) * 100 : 0,
      cost: item.cost || 0,
      roi: item.cost > 0 ? ((item.revenue - item.cost) / item.cost) * 100 : 0,
      trend: determineTrend(item.trend_data)
    })) || [];

    // Processar dados do funil
    const funnelData: FunnelStage[] = rawData.funnel?.map((item: any, index: number) => ({
      name: item.stage_name || `Estágio ${index + 1}`,
      value: item.count || 0,
      percentage: item.percentage || 0,
      color: getFunnelColor(index),
      change: item.change || 0
    })) || getDefaultFunnelData();

    return {
      metrics,
      chartData,
      sourceData,
      funnelData,
      lastUpdated: new Date()
    };
  };

  // Função para determinar tendência
  const determineTrend = (trendData: any): 'up' | 'down' | 'stable' => {
    if (!trendData || !Array.isArray(trendData) || trendData.length < 2) {
      return 'stable';
    }
    
    const recent = trendData[trendData.length - 1];
    const previous = trendData[trendData.length - 2];
    
    if (recent > previous * 1.05) return 'up';
    if (recent < previous * 0.95) return 'down';
    return 'stable';
  };

  // Função para obter cor do funil
  const getFunnelColor = (index: number): string => {
    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1'];
    return colors[index % colors.length];
  };

  // Função para obter dados padrão do funil
  const getDefaultFunnelData = (): FunnelStage[] => [
    { name: 'Visitantes', value: 2450, percentage: 100, color: '#8884d8', change: 5.2 },
    { name: 'Leads', value: 435, percentage: 17.8, color: '#82ca9d', change: 3.1 },
    { name: 'Qualificados', value: 187, percentage: 7.6, color: '#ffc658', change: -1.2 },
    { name: 'Propostas', value: 89, percentage: 3.6, color: '#ff7300', change: 2.8 },
    { name: 'Conversões', value: 34, percentage: 1.4, color: '#8dd1e1', change: 4.5 }
  ];

  // Função para obter data baseada no filtro
  const getDateFromFilter = (quickDate: string): string => {
    const now = new Date();
    let daysAgo = 30;
    
    switch (quickDate) {
      case 'today': daysAgo = 0; break;
      case '7d': daysAgo = 7; break;
      case '30d': daysAgo = 30; break;
      case '90d': daysAgo = 90; break;
      case '6m': daysAgo = 180; break;
      case '1y': daysAgo = 365; break;
      default: daysAgo = 30;
    }
    
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  };

  // Função para atualizar dados
  const updateData = useCallback(async () => {
    if (isPaused) return;
    
    try {
      setError(null);
      const newData = await fetchAnalyticsData();
      
      if (newData) {
        setData(newData);
        setLastUpdate(new Date());
        setIsConnected(true);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar dados');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAnalyticsData, isPaused]);

  // Configurar WebSocket
  const setupWebSocket = useCallback(() => {
    if (!enableWebSocket || isPaused) return;

    try {
      // Fechar conexão anterior se existir
      if (wsRef.current) {
        wsRef.current.close();
      }

      // Criar nova conexão WebSocket
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/analytics`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket conectado para análises');
        setIsConnected(true);
        
        // Enviar filtros para o servidor
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'subscribe', filters }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'analytics_update') {
            const processedData = processAnalyticsData(message.data);
            setData(processedData);
            setLastUpdate(new Date());
          }
        } catch (err) {
          console.error('Erro ao processar mensagem WebSocket:', err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket desconectado');
        setIsConnected(false);
        
        // Tentar reconectar após 5 segundos
        if (!isPaused) {
          setTimeout(setupWebSocket, 5000);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('Erro no WebSocket:', error);
        setIsConnected(false);
      };
    } catch (err) {
      console.error('Erro ao configurar WebSocket:', err);
      setIsConnected(false);
    }
  }, [enableWebSocket, filters, isPaused, processAnalyticsData]);

  // Configurar polling
  const setupPolling = useCallback(() => {
    if (!enablePolling || isPaused) return;

    // Limpar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Configurar novo intervalo
    intervalRef.current = setInterval(updateData, updateInterval);
  }, [enablePolling, updateInterval, updateData, isPaused]);

  // Funções de controle
  const forceRefresh = useCallback(() => {
    updateData();
  }, [updateData]);

  const pauseUpdates = useCallback(() => {
    setIsPaused(true);
    
    // Fechar WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    // Limpar polling
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  const resumeUpdates = useCallback(() => {
    setIsPaused(false);
  }, []);

  // Efeitos
  useEffect(() => {
    // Buscar dados iniciais
    updateData();
  }, [updateData]);

  useEffect(() => {
    if (!isPaused) {
      setupWebSocket();
      setupPolling();
    }

    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [setupWebSocket, setupPolling, isPaused]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    isConnected,
    lastUpdate,
    forceRefresh,
    pauseUpdates,
    resumeUpdates,
    isPaused
  };
};

// Hook para métricas específicas em tempo real
export const useRealTimeMetrics = (filters: AnalyticsFilters) => {
  const { data, isLoading, error, forceRefresh } = useRealTimeAnalytics({
    filters,
    updateInterval: 10000, // 10 segundos para métricas
    enableWebSocket: true,
    enablePolling: true
  });

  return {
    metrics: data?.metrics || null,
    isLoading,
    error,
    refresh: forceRefresh,
    lastUpdated: data?.lastUpdated || null
  };
};

// Hook para dados de gráfico em tempo real
export const useRealTimeChartData = (filters: AnalyticsFilters) => {
  const { data, isLoading, error, forceRefresh } = useRealTimeAnalytics({
    filters,
    updateInterval: 30000, // 30 segundos para gráficos
    enableWebSocket: true,
    enablePolling: false // Usar apenas WebSocket para gráficos
  });

  return {
    chartData: data?.chartData || [],
    sourceData: data?.sourceData || [],
    funnelData: data?.funnelData || [],
    isLoading,
    error,
    refresh: forceRefresh,
    lastUpdated: data?.lastUpdated || null
  };
};

export default useRealTimeAnalytics;