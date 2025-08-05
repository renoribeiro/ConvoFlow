import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MessageSquare, 
  Users, 
  TrendingUp, 
  Clock, 
  Send, 
  CheckCircle, 
  AlertCircle,
  Plus,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useSupabaseQuery, useSupabaseCount } from '@/hooks/useSupabaseQuery';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface DashboardStats {
  totalContacts: number;
  activeConversations: number;
  activeCampaigns: number;
  activeChatbots: number;
}

interface RecentActivity {
  id: string;
  type: 'message_received' | 'message_sent';
  description: string;
  timestamp: string;
}



const StatCard = ({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend, 
  trendValue 
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  trend?: 'up' | 'down';
  trendValue?: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <div className="flex items-center text-xs text-muted-foreground">
        {trend && trendValue && (
          <>
            {trend === 'up' ? (
              <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
            )}
            <span className={trend === 'up' ? 'text-green-500' : 'text-red-500'}>
              {trendValue}
            </span>
            <span className="ml-1">vs ontem</span>
          </>
        )}
        {!trend && description}
      </div>
    </CardContent>
  </Card>
);

const StatCardSkeleton = () => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-4" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </CardContent>
  </Card>
);

export default function Dashboard() {
  const { user } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  // Usar os novos hooks para buscar dados
  const { data: totalContacts = 0 } = useSupabaseCount('contacts');
  
  const { data: activeCampaigns = 0 } = useSupabaseCount(
    'mass_message_campaigns',
    [{ column: 'status', operator: 'eq', value: 'running' }]
  );
  
  const { data: activeChatbots = 0 } = useSupabaseCount(
    'chatbots',
    [{ column: 'is_active', operator: 'eq', value: true }]
  );

  // Buscar conversas ativas (últimas 24h)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const { data: activeConversations = 0 } = useSupabaseCount(
    'messages',
    [{ column: 'created_at', operator: 'gte', value: yesterday.toISOString() }]
  );

  // Buscar atividades recentes
  const { data: recentActivity = [] } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['recent-activity'],
    select: `
      id,
      content,
      sender_type,
      created_at,
      contacts!inner(
        name,
        phone
      )
    `,
    orderBy: [{ column: 'created_at', ascending: false }],
    limit: 10
  });

  const stats = {
    totalContacts,
    activeConversations,
    activeCampaigns,
    activeChatbots,
  };

  const formattedActivity: RecentActivity[] = recentActivity.map((message: any) => ({
    id: message.id,
    type: message.direction === 'incoming' ? 'message_received' : 'message_sent',
    description: `${message.direction === 'incoming' ? 'Mensagem recebida' : 'Mensagem enviada'} de ${message.contacts?.name || message.contacts?.phone}`,
    timestamp: message.created_at,
  }));

  const statsLoading = tenantLoading;
  const activityLoading = tenantLoading;
  const statsError = null;
  const activityError = null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        description="Visão geral das suas conversas e métricas do WhatsApp"
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/campaigns/new">
                <Plus className="w-4 h-4 mr-2" />
                Nova Campanha
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 mt-6">
        {/* Estatísticas principais */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : statsError ? (
            <div className="col-span-full">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Erro ao carregar estatísticas. Tente novamente.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <>
              <StatCard
                title="Total de Conversas"
                value={stats?.activeConversations || 0}
                description="Conversas ativas"
                icon={MessageSquare}
              />
              <StatCard
                title="Contatos"
                value={stats?.totalContacts || 0}
                description="Total de contatos"
                icon={Users}
              />
              <StatCard
                title="Chatbots Ativos"
                value={stats?.activeChatbots || 0}
                description="Em execução"
                icon={Send}
              />
              <StatCard
                title="Campanhas Ativas"
                value={stats?.activeCampaigns || 0}
                description="Em execução"
                icon={TrendingUp}
              />
            </>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          {/* Atividade recente */}
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Atividade Recente</CardTitle>
              <CardDescription>
                Últimas interações com seus contatos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activityError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Erro ao carregar atividades recentes.
                  </AlertDescription>
                </Alert>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhuma atividade recente</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Suas interações aparecerão aqui
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formattedActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center space-x-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.timestamp), {
                            locale: ptBR,
                            addSuffix: true
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ações rápidas */}
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>
                Acesse rapidamente as principais funcionalidades
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-start">
                <Link to="/conversations">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Ver Conversas
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/contacts">
                  <Users className="w-4 h-4 mr-2" />
                  Gerenciar Contatos
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/campaigns">
                  <Send className="w-4 h-4 mr-2" />
                  Campanhas
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/chatbots">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Chatbots
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/reports">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Relatórios
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}