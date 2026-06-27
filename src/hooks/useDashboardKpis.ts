import { useSupabaseQuery, useSupabaseCount } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { startOfDay, subDays, format } from 'date-fns';
import type { UsePeriodFilterResult } from './usePeriodFilter';

/**
 * KPIs do Dashboard — versão "CRM" com valor principal, variação vs. período
 * anterior e sparkline de 7 dias por métrica.
 *
 * Reaproveita o padrão de queries leves (useSupabaseCount / useSupabasequery
 * com `silent`) já usado em useDashboardMetrics, mas parametrizado pelo período
 * selecionado (usePeriodFilter). Valores "instantâneos" (conversas ativas, taxa
 * de conversão) usam snapshot; os demais agregam dentro do período.
 *
 * As sparklines são SEMPRE dos últimos 7 dias (mini-tendência), independente do
 * período — por isso suas queries usam queryKeys próprias e janelas normalizadas
 * por dia (estáveis dentro do mesmo dia, sem refetch em loop).
 */

export interface KpiMetric {
  value: number;
  /** Valor no período anterior (null quando a comparação não se aplica). */
  previousValue: number | null;
  /** Variação percentual assinada vs. período anterior (null = sem comparação). */
  deltaPct: number | null;
  /** Série de 7 pontos para o mini-gráfico. */
  sparkline: SparkPoint[];
  loading: boolean;
}

export interface SparkPoint {
  date: string;
  value: number;
}

export interface DashboardKpis {
  activeConversations: KpiMetric;
  newContacts: KpiMetric;
  conversionRate: KpiMetric;
  avgResponseTime: KpiMetric;
  messagesSent: KpiMetric;
}

type FunnelStageRow = { id: string; order: number; is_final: boolean | null };
type MessageRow = { conversation_id: string; direction: string; created_at: string };

const SPARK_DAYS = 7;

const deltaPct = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/** Buckets diários (últimos `days` dias) por contagem de linhas. */
function dailyCountSpark(rows: Array<Record<string, any>>, dateField: string): SparkPoint[] {
  const buckets = new Map<string, number>();
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    buckets.set(format(subDays(new Date(), i), 'yyyy-MM-dd'), 0);
  }
  for (const r of rows) {
    const raw = r[dateField];
    if (!raw) continue;
    const key = format(new Date(raw), 'yyyy-MM-dd');
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, value]) => ({
    date: format(new Date(date), 'dd/MM'),
    value,
  }));
}

/** Tempo médio (min) entre o 1º inbound e o 1º outbound posterior, por conversa. */
function avgResponseMinutes(msgs: MessageRow[]): number {
  const byConv = new Map<string, MessageRow[]>();
  for (const m of msgs) {
    const list = byConv.get(m.conversation_id);
    if (list) list.push(m);
    else byConv.set(m.conversation_id, [m]);
  }
  const diffs: number[] = [];
  for (const list of byConv.values()) {
    let firstInbound: MessageRow | null = null;
    for (const msg of list) {
      if (!firstInbound && msg.direction === 'inbound') firstInbound = msg;
      else if (firstInbound && msg.direction === 'outbound') {
        const ms = new Date(msg.created_at).getTime() - new Date(firstInbound.created_at).getTime();
        if (ms >= 0) diffs.push(ms / 1000 / 60);
        break;
      }
    }
  }
  if (diffs.length === 0) return 0;
  return diffs.reduce((a, b) => a + b, 0) / diffs.length;
}

/** Sparkline de tempo médio de resposta: avg por dia (últimos 7 dias). */
function responseTimeSpark(msgs: MessageRow[]): SparkPoint[] {
  const byDay = new Map<string, MessageRow[]>();
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    byDay.set(format(subDays(new Date(), i), 'yyyy-MM-dd'), []);
  }
  for (const m of msgs) {
    const key = format(new Date(m.created_at), 'yyyy-MM-dd');
    byDay.get(key)?.push(m);
  }
  return Array.from(byDay.entries()).map(([date, list]) => ({
    date: format(new Date(date), 'dd/MM'),
    value: Number(avgResponseMinutes(list).toFixed(1)),
  }));
}

export function useDashboardKpis(period: UsePeriodFilterResult): DashboardKpis {
  const { tenant } = useTenant();
  const enabled = !!tenant?.id;

  const { startISO, endISO, prevStartISO, prevEndISO } = period;
  const spark7dISO = startOfDay(subDays(new Date(), SPARK_DAYS - 1)).toISOString();

  // ===== Conversas Ativas (snapshot) + variação por conversas criadas =====
  const { data: activeConversations = 0, isLoading: activeLoading } = useSupabaseCount(
    'conversations',
    [{ column: 'is_archived', operator: 'eq', value: false }],
    { silent: true, enabled },
  );
  const { data: convCreatedPeriod = 0 } = useSupabaseCount(
    'conversations',
    [
      { column: 'created_at', operator: 'gte', value: startISO },
      { column: 'created_at', operator: 'lte', value: endISO },
    ],
    { silent: true, enabled },
  );
  const { data: convCreatedPrev = 0 } = useSupabaseCount(
    'conversations',
    [
      { column: 'created_at', operator: 'gte', value: prevStartISO },
      { column: 'created_at', operator: 'lte', value: prevEndISO },
    ],
    { silent: true, enabled },
  );
  const { data: convSparkRows = [] } = useSupabaseQuery({
    table: 'conversations',
    queryKey: ['dashboard-charts', 'conv-spark'],
    select: 'created_at',
    filters: [{ column: 'created_at', operator: 'gte', value: spark7dISO }],
    limit: 5000,
    enabled,
    silent: true,
  });

  // ===== Novos Contatos (período) =====
  const { data: contactsPeriod = 0, isLoading: contactsLoading } = useSupabaseCount(
    'contacts',
    [
      { column: 'created_at', operator: 'gte', value: startISO },
      { column: 'created_at', operator: 'lte', value: endISO },
    ],
    { silent: true, enabled },
  );
  const { data: contactsPrev = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'created_at', operator: 'gte', value: prevStartISO },
      { column: 'created_at', operator: 'lte', value: prevEndISO },
    ],
    { silent: true, enabled },
  );
  const { data: contactsSparkRows = [] } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['dashboard-charts', 'contacts-spark'],
    select: 'created_at',
    filters: [{ column: 'created_at', operator: 'gte', value: spark7dISO }],
    limit: 5000,
    enabled,
    silent: true,
  });

  // ===== Taxa de Conversão (snapshot) =====
  const { data: stagesData = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['dashboard-metrics', 'funnel-stages-kpi'],
    select: 'id, order, is_final',
    enabled,
    silent: true,
  });
  const stages = stagesData as unknown as FunnelStageRow[];
  const flagged = stages.filter((s) => s.is_final);
  const maxOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.order)) : -1;
  const finalStageIds = (flagged.length > 0 ? flagged : stages.filter((s) => s.order === maxOrder)).map(
    (s) => s.id,
  );

  const { data: convertedCount = 0, isLoading: convertedLoading } = useSupabaseCount(
    'contacts',
    [{ column: 'current_stage_id', operator: 'in', value: finalStageIds }],
    { silent: true, enabled: enabled && finalStageIds.length > 0 },
  );
  const { data: totalContacts = 0, isLoading: totalLoading } = useSupabaseCount(
    'contacts',
    [],
    { silent: true, enabled },
  );
  const conversionRateValue = totalContacts > 0 ? (convertedCount / totalContacts) * 100 : 0;

  // Variação da conversão: contatos que ENTRARAM em estágio final no período.
  const { data: convertedPeriod = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'current_stage_id', operator: 'in', value: finalStageIds },
      { column: 'stage_entered_at', operator: 'gte', value: startISO },
      { column: 'stage_entered_at', operator: 'lte', value: endISO },
    ],
    { silent: true, enabled: enabled && finalStageIds.length > 0 },
  );
  const { data: convertedPrev = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'current_stage_id', operator: 'in', value: finalStageIds },
      { column: 'stage_entered_at', operator: 'gte', value: prevStartISO },
      { column: 'stage_entered_at', operator: 'lte', value: prevEndISO },
    ],
    { silent: true, enabled: enabled && finalStageIds.length > 0 },
  );
  const { data: convSpark = [] } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['dashboard-charts', 'conversion-spark'],
    select: 'stage_entered_at',
    filters: [
      { column: 'current_stage_id', operator: 'in', value: finalStageIds },
      { column: 'stage_entered_at', operator: 'gte', value: spark7dISO },
    ],
    limit: 5000,
    enabled: enabled && finalStageIds.length > 0,
    silent: true,
  });

  // ===== Mensagens Enviadas (outbound no período) =====
  const { data: sentPeriod = 0, isLoading: sentLoading } = useSupabaseCount(
    'messages',
    [
      { column: 'direction', operator: 'eq', value: 'outbound' },
      { column: 'created_at', operator: 'gte', value: startISO },
      { column: 'created_at', operator: 'lte', value: endISO },
    ],
    { silent: true, enabled },
  );
  const { data: sentPrev = 0 } = useSupabaseCount(
    'messages',
    [
      { column: 'direction', operator: 'eq', value: 'outbound' },
      { column: 'created_at', operator: 'gte', value: prevStartISO },
      { column: 'created_at', operator: 'lte', value: prevEndISO },
    ],
    { silent: true, enabled },
  );
  // Linhas dos últimos 7 dias: sparkline de enviadas + tempo de resposta.
  const { data: messages7d = [], isLoading: msgs7dLoading } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['dashboard-charts', 'messages-spark'],
    select: 'conversation_id, direction, created_at',
    filters: [{ column: 'created_at', operator: 'gte', value: spark7dISO }],
    orderBy: [{ column: 'created_at', ascending: true }],
    limit: 8000,
    enabled,
    silent: true,
  });

  // ===== Tempo Médio de Resposta (período) =====
  const { data: msgsPeriod = [], isLoading: respLoading } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['dashboard-metrics', 'resp-period', startISO, endISO],
    select: 'conversation_id, direction, created_at',
    filters: [
      { column: 'created_at', operator: 'gte', value: startISO },
      { column: 'created_at', operator: 'lte', value: endISO },
    ],
    orderBy: [{ column: 'created_at', ascending: true }],
    limit: 4000,
    enabled,
    silent: true,
  });
  const { data: msgsPrev = [] } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['dashboard-metrics', 'resp-prev', prevStartISO, prevEndISO],
    select: 'conversation_id, direction, created_at',
    filters: [
      { column: 'created_at', operator: 'gte', value: prevStartISO },
      { column: 'created_at', operator: 'lte', value: prevEndISO },
    ],
    orderBy: [{ column: 'created_at', ascending: true }],
    limit: 4000,
    enabled,
    silent: true,
  });

  const sentOutbound7d = (messages7d as unknown as MessageRow[]).filter(
    (m) => m.direction === 'outbound',
  );
  const respValue = avgResponseMinutes(msgsPeriod as unknown as MessageRow[]);
  const respPrevValue = avgResponseMinutes(msgsPrev as unknown as MessageRow[]);

  return {
    activeConversations: {
      value: activeConversations,
      previousValue: convCreatedPrev,
      deltaPct: deltaPct(convCreatedPeriod, convCreatedPrev),
      sparkline: dailyCountSpark(convSparkRows as any[], 'created_at'),
      loading: activeLoading,
    },
    newContacts: {
      value: contactsPeriod,
      previousValue: contactsPrev,
      deltaPct: deltaPct(contactsPeriod, contactsPrev),
      sparkline: dailyCountSpark(contactsSparkRows as any[], 'created_at'),
      loading: contactsLoading,
    },
    conversionRate: {
      value: conversionRateValue,
      previousValue: convertedPrev,
      deltaPct: deltaPct(convertedPeriod, convertedPrev),
      sparkline: dailyCountSpark(convSpark as any[], 'stage_entered_at'),
      loading: stagesLoading || convertedLoading || totalLoading,
    },
    avgResponseTime: {
      value: respValue,
      previousValue: respPrevValue,
      // Menor é melhor: variação positiva = ficou mais rápido (prev - atual).
      deltaPct: deltaPct(respPrevValue, respValue),
      sparkline: responseTimeSpark(sentOutbound7d.length ? (messages7d as unknown as MessageRow[]) : []),
      loading: respLoading || msgs7dLoading,
    },
    messagesSent: {
      value: sentPeriod,
      previousValue: sentPrev,
      deltaPct: deltaPct(sentPeriod, sentPrev),
      sparkline: dailyCountSpark(sentOutbound7d, 'created_at'),
      loading: sentLoading,
    },
  };
}
