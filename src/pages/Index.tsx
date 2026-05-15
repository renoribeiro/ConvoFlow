import {
  MessageSquare,
  Users,
  Clock,
  Target,
  Zap,
} from 'lucide-react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { RecentConversations } from '@/components/dashboard/RecentConversations';
import { WhatsAppStatus } from '@/components/dashboard/WhatsAppStatus';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';

const numberFmt = new Intl.NumberFormat('pt-BR');
const TREND_LABEL = 'em relação ao período anterior';

interface CardConfig {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean; label: string };
  href?: string;
  loading: boolean;
}

const Index = () => {
  const m = useDashboardMetrics();

  const cards: CardConfig[] = [
    {
      title: 'Conversas Ativas',
      value: numberFmt.format(m.activeConversations),
      description: 'Em andamento agora',
      icon: <MessageSquare className="h-4 w-4" />,
      href: '/dashboard/conversations',
      loading: m.loading.activeConversations,
    },
    {
      title: 'Novos Contatos',
      value: numberFmt.format(m.newContacts),
      description: 'Criados hoje',
      icon: <Users className="h-4 w-4" />,
      trend: {
        value: m.contactsTrend,
        isPositive: m.contactsTrend >= 0,
        label: TREND_LABEL,
      },
      href: '/dashboard/contacts',
      loading: m.loading.newContacts,
    },
    {
      title: 'Taxa de Conversão',
      value: `${m.conversionRate.toFixed(1)}%`,
      description: 'Contatos no estágio final',
      icon: <Target className="h-4 w-4" />,
      href: '/dashboard/funnel',
      loading: m.loading.conversionRate,
    },
    {
      title: 'Tempo Médio Resposta',
      value: `${m.avgResponseTime.toFixed(1)} min`,
      description: 'Primeira resposta — últimas 24h',
      icon: <Clock className="h-4 w-4" />,
      trend: {
        value: m.responseTimeTrend,
        isPositive: m.responseTimeTrend >= 0,
        label: TREND_LABEL,
      },
      loading: m.loading.avgResponseTime,
    },
    {
      title: 'Mensagens Enviadas',
      value: numberFmt.format(m.messagesSent),
      description: 'Hoje',
      icon: <Zap className="h-4 w-4" />,
      trend: {
        value: m.messagesTrend,
        isPositive: m.messagesTrend >= 0,
        label: TREND_LABEL,
      },
      loading: m.loading.messagesSent,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral das suas conversas e métricas de WhatsApp"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c) =>
          c.loading ? (
            <Skeleton key={c.title} className="h-[140px] w-full rounded-lg" />
          ) : (
            <MetricCard
              key={c.title}
              title={c.title}
              value={c.value}
              description={c.description}
              icon={c.icon}
              trend={c.trend}
              href={c.href}
              className="xl:col-span-1"
            />
          )
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentConversations />
        </div>
        <div className="lg:col-span-1">
          <WhatsAppStatus />
        </div>
      </div>
    </div>
  );
};

export default Index;
