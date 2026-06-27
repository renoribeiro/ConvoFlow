import { ReactNode, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BRAND_CHART } from '@/lib/chartColors';
import type { KpiMetric } from '@/hooks/useDashboardKpis';

interface EnhancedMetricCardProps {
  title: string;
  /** Valor já formatado para exibição. */
  value: string;
  icon: ReactNode;
  metric: KpiMetric;
  href?: string;
  index?: number;
  /** Cor da sparkline (default: lima da marca). */
  sparkColor?: string;
  /** Oculta o indicador de variação (métricas onde não faz sentido). */
  hideDelta?: boolean;
}

export const EnhancedMetricCard = ({
  title,
  value,
  icon,
  metric,
  href,
  index = 0,
  sparkColor = BRAND_CHART.primary,
  hideDelta = false,
}: EnhancedMetricCardProps) => {
  const navigate = useNavigate();
  const gradientId = useId().replace(/:/g, '');

  if (metric.loading) {
    return <Skeleton className="h-[150px] w-full rounded-lg" />;
  }

  const delta = metric.deltaPct;
  const positive = (delta ?? 0) >= 0;
  const showDelta = !hideDelta && delta !== null && Number.isFinite(delta);
  const clickable = !!href;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
    >
      <Card
        className={cn(
          'relative overflow-hidden p-4 transition-all duration-200 hover:shadow-medium',
          clickable && 'cursor-pointer hover:-translate-y-0.5',
        )}
        onClick={clickable ? () => navigate(href!) : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <span className="text-muted-foreground [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-2xl font-bold leading-none text-foreground truncate">
              {value}
            </div>
            {showDelta && (
              <div
                className={cn(
                  'mt-2 flex items-center gap-0.5 text-xs font-medium',
                  positive ? 'text-status-success' : 'text-status-error',
                )}
              >
                {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(delta!).toFixed(1)}%
              </div>
            )}
          </div>

          {/* Sparkline 7 dias */}
          <div className="h-[44px] w-[96px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metric.sparkline} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={sparkColor} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={sparkColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};
