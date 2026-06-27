import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { eachDayOfInterval, format, getHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UsePeriodFilterResult } from './usePeriodFilter';

/**
 * Série diária (ou horária, quando o período é "Hoje") de mensagens enviadas vs.
 * recebidas — alimenta o AreaChart de Atividade do Dashboard.
 *
 * Granularidade: períodos de 1 dia viram 24 buckets horários; demais, 1 bucket
 * por dia entre start e end (inclusive).
 */

export interface ActivityPoint {
  label: string;
  enviadas: number;
  recebidas: number;
}

interface MessageRow {
  created_at: string;
  direction: string;
}

export interface UseActivityChartResult {
  data: ActivityPoint[];
  isLoading: boolean;
}

export function useActivityChartData(period: UsePeriodFilterResult): UseActivityChartResult {
  const { tenant } = useTenant();
  const { startISO, endISO, days } = period;
  const hourly = days <= 1;

  const { data: rows = [], isLoading } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['dashboard-charts', 'activity', startISO, endISO],
    select: 'created_at, direction',
    filters: [
      { column: 'created_at', operator: 'gte', value: startISO },
      { column: 'created_at', operator: 'lte', value: endISO },
    ],
    limit: 20000,
    enabled: !!tenant,
    silent: true,
  });

  const messages = rows as unknown as MessageRow[];

  let data: ActivityPoint[];

  if (hourly) {
    const buckets: ActivityPoint[] = Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, '0')}h`,
      enviadas: 0,
      recebidas: 0,
    }));
    for (const m of messages) {
      const bucket = buckets[getHours(new Date(m.created_at))];
      if (!bucket) continue;
      if (m.direction === 'outbound') bucket.enviadas++;
      else bucket.recebidas++;
    }
    data = buckets;
  } else {
    const dayKeys = eachDayOfInterval({
      start: new Date(period.range.start),
      end: new Date(period.range.end),
    });
    const index = new Map<string, ActivityPoint>();
    const ordered: ActivityPoint[] = dayKeys.map((d) => {
      const point: ActivityPoint = {
        label: format(d, 'dd/MM', { locale: ptBR }),
        enviadas: 0,
        recebidas: 0,
      };
      index.set(format(d, 'yyyy-MM-dd'), point);
      return point;
    });
    for (const m of messages) {
      const key = format(new Date(m.created_at), 'yyyy-MM-dd');
      const point = index.get(key);
      if (!point) continue;
      if (m.direction === 'outbound') point.enviadas++;
      else point.recebidas++;
    }
    data = ordered;
  }

  return { data, isLoading };
}
