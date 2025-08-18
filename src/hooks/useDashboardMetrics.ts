import { useSupabaseQuery } from './useSupabaseQuery';
import { useSupabaseCount } from './useSupabaseCount';
import { useTenant } from './useTenant';
import { subDays, startOfDay, endOfDay, subHours } from 'date-fns';

interface DashboardMetrics {
  // Métricas principais solicitadas
  activeConversations: number;  // Conversas Ativas
  newContacts: number;          // Novos Contatos
  conversionRate: number;       // Taxa de Conversão
  avgResponseTime: number;      // Tempo Médio Resposta
  messagesSent: number;         // Messages Enviadas
  generatedRevenue: number;     // Receita Gerada
  
  // Tendências (comparação com período anterior)
  conversationsTrend: number;
  contactsTrend: number;
  conversionTrend: number;
  responseTimeTrend: number;
  messagesTrend: number;
  revenueTrend: number;
  
  // Estados de loading
  isLoading: boolean;
  error: any;
}

export const useDashboardMetrics = (): DashboardMetrics => {
  const { tenant } = useTenant();
  
  // Definir períodos para comparação
  const today = new Date();
  const yesterday = subDays(today, 1);
  const last24Hours = subHours(today, 24);
  const previous24Hours = subHours(today, 48);
  
  // Conversas Ativas (conversas com atividade nas últimas 24h)
  const { data: activeConversationsToday = 0, isLoading: conversationsLoading } = useSupabaseQuery({
    table: 'conversations',
    queryKey: ['active-conversations-today'],
    select: 'id',
    filters: [
      { column: 'last_message_at', operator: 'gte', value: last24Hours.toISOString() },
      { column: 'status', operator: 'eq', value: 'active' }
    ],
    enabled: !!tenant
  });
  
  const { data: activeConversationsYesterday = [] } = useSupabaseQuery({
    table: 'conversations',
    queryKey: ['active-conversations-yesterday'],
    select: 'id',
    filters: [
      { column: 'last_message_at', operator: 'gte', value: previous24Hours.toISOString() },
      { column: 'last_message_at', operator: 'lt', value: last24Hours.toISOString() },
      { column: 'status', operator: 'eq', value: 'active' }
    ],
    enabled: !!tenant
  });
  
  // Novos Contatos (contatos criados hoje vs ontem)
  const { data: newContactsToday = 0, isLoading: contactsLoading } = useSupabaseCount(
    'contacts',
    [
      { column: 'created_at', operator: 'gte', value: startOfDay(today).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(today).toISOString() }
    ]
  );
  
  const { data: newContactsYesterday = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'created_at', operator: 'gte', value: startOfDay(yesterday).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(yesterday).toISOString() }
    ]
  );
  
  // Messages Enviadas (mensagens enviadas hoje vs ontem)
  const { data: messagesSentToday = 0, isLoading: messagesLoading } = useSupabaseCount(
    'messages',
    [
      { column: 'created_at', operator: 'gte', value: startOfDay(today).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(today).toISOString() },
      { column: 'direction', operator: 'eq', value: 'outbound' }
    ]
  );
  
  const { data: messagesSentYesterday = 0 } = useSupabaseCount(
    'messages',
    [
      { column: 'created_at', operator: 'gte', value: startOfDay(yesterday).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(yesterday).toISOString() },
      { column: 'direction', operator: 'eq', value: 'outbound' }
    ]
  );
  
  // Receita Gerada (baseada em vendas ou transações)
  const { data: revenueToday = [], isLoading: revenueLoading } = useSupabaseQuery({
    table: 'sales',
    queryKey: ['revenue-today'],
    select: 'amount',
    filters: [
      { column: 'created_at', operator: 'gte', value: startOfDay(today).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(today).toISOString() },
      { column: 'status', operator: 'eq', value: 'completed' }
    ],
    enabled: !!tenant
  });
  
  const { data: revenueYesterday = [] } = useSupabaseQuery({
    table: 'sales',
    queryKey: ['revenue-yesterday'],
    select: 'amount',
    filters: [
      { column: 'created_at', operator: 'gte', value: startOfDay(yesterday).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(yesterday).toISOString() },
      { column: 'status', operator: 'eq', value: 'completed' }
    ],
    enabled: !!tenant
  });
  
  // Calcular receita total
  const calculateRevenue = (sales: any[]) => {
    if (!sales || sales.length === 0) return 0;
    return sales.reduce((total, sale) => total + parseFloat(sale.amount || 0), 0);
  };
  
  const generatedRevenueToday = calculateRevenue(revenueToday);
  const generatedRevenueYesterday = calculateRevenue(revenueYesterday);
  
  // Contar conversas ativas
  const activeConversationsCount = activeConversationsToday ? activeConversationsToday.length : 0;
  const activeConversationsYesterdayCount = activeConversationsYesterday ? activeConversationsYesterday.length : 0;
  
  // Taxa de conversão (contatos que mudaram de estágio nas últimas 24h)
  const { data: conversionsToday = [], isLoading: conversionsLoading } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['conversions-today'],
    select: 'id, current_stage_id, funnel_stages!contacts_current_stage_id_fkey(name, order)',
    filters: [
      { column: 'updated_at', operator: 'gte', value: last24Hours.toISOString() }
    ],
    enabled: !!tenant
  });
  
  const { data: conversionsYesterday = [] } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['conversions-yesterday'],
    select: 'id, current_stage_id, funnel_stages!contacts_current_stage_id_fkey(name, order)',
    filters: [
      { column: 'updated_at', operator: 'gte', value: previous24Hours.toISOString() },
      { column: 'updated_at', operator: 'lt', value: last24Hours.toISOString() }
    ],
    enabled: !!tenant
  });
  
  // Calcular taxa de conversão (contatos em estágios avançados)
  const calculateConversionRate = (contacts: any[]) => {
    if (!contacts || contacts.length === 0) return 0;
    const advancedStageContacts = contacts.filter(c => 
      c.funnel_stages && c.funnel_stages.order > 2
    );
    return (advancedStageContacts.length / contacts.length) * 100;
  };
  
  const conversionRateToday = calculateConversionRate(conversionsToday);
  const conversionRateYesterday = calculateConversionRate(conversionsYesterday);
  
  // Tempo médio de resposta (baseado em system_metrics)
  const { data: responseTimeMetrics = [], isLoading: responseTimeLoading } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['response-time-metrics'],
    select: 'metric_value, recorded_at',
    filters: [
      { column: 'metric_name', operator: 'eq', value: 'response_time' },
      { column: 'recorded_at', operator: 'gte', value: last24Hours.toISOString() }
    ],
    orderBy: [{ column: 'recorded_at', ascending: false }],
    limit: 100,
    enabled: !!tenant
  });
  
  const { data: responseTimeMetricsYesterday = [] } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['response-time-metrics-yesterday'],
    select: 'metric_value, recorded_at',
    filters: [
      { column: 'metric_name', operator: 'eq', value: 'response_time' },
      { column: 'recorded_at', operator: 'gte', value: previous24Hours.toISOString() },
      { column: 'recorded_at', operator: 'lt', value: last24Hours.toISOString() }
    ],
    orderBy: [{ column: 'recorded_at', ascending: false }],
    limit: 100,
    enabled: !!tenant
  });
  
  // Calcular tempo médio de resposta
  const calculateAvgResponseTime = (metrics: any[]) => {
    if (!metrics || metrics.length === 0) return 0;
    const sum = metrics.reduce((acc, m) => acc + parseFloat(m.metric_value), 0);
    return sum / metrics.length;
  };
  
  const avgResponseTimeToday = calculateAvgResponseTime(responseTimeMetrics);
  const avgResponseTimeYesterday = calculateAvgResponseTime(responseTimeMetricsYesterday);
  
  // Remover métricas antigas não solicitadas
  
  // Calcular tendências (% de mudança)
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };
  
  const conversationsTrend = calculateTrend(activeConversationsCount, activeConversationsYesterdayCount);
  const contactsTrend = calculateTrend(newContactsToday, newContactsYesterday);
  const conversionTrend = calculateTrend(conversionRateToday, conversionRateYesterday);
  const responseTimeTrend = calculateTrend(avgResponseTimeYesterday, avgResponseTimeToday); // Invertido: menor é melhor
  const messagesTrend = calculateTrend(messagesSentToday, messagesSentYesterday);
  const revenueTrend = calculateTrend(generatedRevenueToday, generatedRevenueYesterday);
  
  // Estado de loading geral
  const isLoading = conversationsLoading || contactsLoading || messagesLoading || 
                   conversionsLoading || responseTimeLoading || revenueLoading;
  
  return {
    // Métricas principais solicitadas
    activeConversations: activeConversationsCount,
    newContacts: newContactsToday,
    conversionRate: conversionRateToday,
    avgResponseTime: avgResponseTimeToday,
    messagesSent: messagesSentToday,
    generatedRevenue: generatedRevenueToday,
    
    // Tendências
    conversationsTrend,
    contactsTrend,
    conversionTrend,
    responseTimeTrend,
    messagesTrend,
    revenueTrend,
    
    // Estados
    isLoading,
    error: null // TODO: Implementar tratamento de erro consolidado
  };
};