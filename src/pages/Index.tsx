import { 
  MessageSquare, 
  Users, 
  TrendingUp, 
  Clock,
  Target,
  Zap
} from 'lucide-react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { RecentConversations } from '@/components/dashboard/RecentConversations';
import { WhatsAppStatus } from '@/components/dashboard/WhatsAppStatus';

const Index = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Visão geral das suas conversas e métricas de WhatsApp
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard
          title="Conversas Ativas"
          value="127"
          description="Conversas em andamento"
          icon={<MessageSquare className="h-4 w-4" />}
          trend={{ value: 12, isPositive: true }}
          className="xl:col-span-1"
        />
        
        <MetricCard
          title="Novos Contatos"
          value="43"
          description="Hoje"
          icon={<Users className="h-4 w-4" />}
          trend={{ value: 8, isPositive: true }}
          className="xl:col-span-1"
        />
        
        <MetricCard
          title="Taxa de Conversão"
          value="24.5%"
          description="Lead para venda"
          icon={<Target className="h-4 w-4" />}
          trend={{ value: 3, isPositive: true }}
          className="xl:col-span-1"
        />
        
        <MetricCard
          title="Tempo Médio Resposta"
          value="2.3 min"
          description="Tempo médio para primeira resposta"
          icon={<Clock className="h-4 w-4" />}
          trend={{ value: 15, isPositive: false }}
          className="xl:col-span-1"
        />
        
        <MetricCard
          title="Messages Enviadas"
          value="1,234"
          description="Nas últimas 24h"
          icon={<Zap className="h-4 w-4" />}
          trend={{ value: 18, isPositive: true }}
          className="xl:col-span-1"
        />
        
        <MetricCard
          title="Receita Gerada"
          value="R$ 8.7k"
          description="Este mês"
          icon={<TrendingUp className="h-4 w-4" />}
          trend={{ value: 22, isPositive: true }}
          className="xl:col-span-1"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Conversations - Takes 2 columns */}
        <div className="lg:col-span-2">
          <RecentConversations />
        </div>
        
        {/* WhatsApp Status - Takes 1 column */}
        <div className="lg:col-span-1">
          <WhatsAppStatus />
        </div>
      </div>
    </div>
  );
};

export default Index;
