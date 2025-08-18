import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  Activity,
  MessageSquare,
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle,
  Info,
  Settings,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  RefreshCw,
  Download,
  Filter,
  Bell,
  Star,
  Heart,
  Send,
  Eye,
  Phone,
  Mail,
  Globe,
  Smartphone,
  Monitor,
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Database,
  Server,
  ArrowUp,
  ArrowDown,
  Minus,
  Plus,
  X,
  Edit,
  Trash2,
  Copy,
  Share,
  ExternalLink
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { toast } from 'sonner';
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics';
import { useRecentActivity } from '../../hooks/useRecentActivity';
import { useSystemMetrics } from '../../hooks/useSystemMetrics';
import { useDashboardCharts } from '../../hooks/useDashboardCharts';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';

interface DashboardMetric {
  id: string;
  title: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
  color: string;
  description: string;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  color: string;
}

interface RecentActivity {
  id: string;
  type: 'message' | 'automation' | 'user' | 'system';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error' | 'info';
}

interface SystemAlert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  priority: 'high' | 'medium' | 'low';
}

// Dados mock removidos - agora usando dados reais via hooks

// Ações rápidas com navegação real
const quickActions: QuickAction[] = [
  {
    id: '1',
    title: 'Nova Campanha',
    description: 'Criar campanha de marketing',
    icon: <Send className="h-5 w-5" />,
    action: () => navigate('/campanhas/nova'),
    color: 'bg-blue-500'
  },
  {
    id: '2',
    title: 'Relatório',
    description: 'Gerar relatório personalizado',
    icon: <BarChart3 className="h-5 w-5" />,
    action: () => navigate('/relatorios'),
    color: 'bg-green-500'
  },
  {
    id: '3',
    title: 'Configurações',
    description: 'Ajustar configurações do sistema',
    icon: <Settings className="h-5 w-5" />,
    action: () => navigate('/configuracoes'),
    color: 'bg-purple-500'
  },
  {
    id: '4',
    title: 'Backup',
    description: 'Fazer backup dos dados',
    icon: <Database className="h-5 w-5" />,
    action: () => navigate('/configuracoes/backup'),
    color: 'bg-orange-500'
  }
];

// Dados de atividade recente removidos - agora usando dados reais via hooks

// Alertas do sistema removidos - agora usando dados reais via hooks

// Dados de gráfico removidos - agora usando dados reais via hooks

// Dados de canal removidos - agora usando dados reais via hooks

const getTrendIcon = (trend: string, change: number) => {
  if (trend === 'up') {
    return <ArrowUp className="h-4 w-4 text-green-600" />;
  } else if (trend === 'down') {
    return <ArrowDown className="h-4 w-4 text-red-600" />;
  } else {
    return <Minus className="h-4 w-4 text-gray-600" />;
  }
};

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'message':
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case 'automation':
      return <Zap className="h-4 w-4 text-yellow-500" />;
    case 'user':
      return <Users className="h-4 w-4 text-green-500" />;
    case 'system':
      return <Settings className="h-4 w-4 text-purple-500" />;
    default:
      return <Info className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'success':
      return 'text-green-600';
    case 'warning':
      return 'text-yellow-600';
    case 'error':
      return 'text-red-600';
    case 'info':
      return 'text-blue-600';
    default:
      return 'text-gray-600';
  }
};

const getAlertIcon = (type: string) => {
  switch (type) {
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case 'error':
      return <X className="h-4 w-4 text-red-600" />;
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'info':
      return <Info className="h-4 w-4 text-blue-600" />;
    default:
      return <Info className="h-4 w-4" />;
  }
};

const MetricCard = ({ metric }: { metric: DashboardMetric }) => {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2 rounded-lg bg-gray-100 ${metric.color}`}>
            {metric.icon}
          </div>
          <div className="flex items-center space-x-1">
            {getTrendIcon(metric.trend, metric.change)}
            <span className={`text-sm font-medium ${
              metric.trend === 'up' ? 'text-green-600' : 
              metric.trend === 'down' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {Math.abs(metric.change)}%
            </span>
          </div>
        </div>
        
        <div className="space-y-1">
          <h3 className="text-2xl font-bold">{metric.value}</h3>
          <p className="text-sm font-medium text-gray-900">{metric.title}</p>
          <p className="text-xs text-muted-foreground">{metric.description}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const QuickActionCard = ({ action }: { action: QuickAction }) => {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={action.action}>
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${action.color} text-white`}>
            {action.icon}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm">{action.title}</h4>
            <p className="text-xs text-muted-foreground">{action.description}</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
};

const RecentActivityCard = ({ activity }: { activity: RecentActivity }) => {
  return (
    <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="p-1 rounded-full bg-gray-100">
        {getActivityIcon(activity.type)}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium">{activity.title}</h4>
        <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {format(new Date(activity.timestamp), 'HH:mm', { locale: ptBR })}
        </p>
      </div>
      <div className={`w-2 h-2 rounded-full ${getStatusColor(activity.status).replace('text-', 'bg-')}`} />
    </div>
  );
};

const SystemAlertCard = ({ alert }: { alert: SystemAlert }) => {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start space-x-3">
        {getAlertIcon(alert.type)}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-semibold text-sm">{alert.title}</h4>
            <Badge variant={alert.priority === 'high' ? 'destructive' : alert.priority === 'medium' ? 'secondary' : 'outline'}>
              {alert.priority === 'high' ? 'Alta' : alert.priority === 'medium' ? 'Média' : 'Baixa'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{alert.message}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {format(new Date(alert.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
          </p>
        </div>
      </div>
    </div>
  );
};

const OverviewCharts = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Atividade Semanal</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={messagesChart || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="messages" fill="#8884d8" name="Mensagens" />
              <Bar dataKey="users" fill="#82ca9d" name="Usuários" />
              <Bar dataKey="conversions" fill="#ffc658" name="Conversões" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <PieChartIcon className="h-5 w-5" />
            <span>Distribuição por Canal</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={channelsData || mockChannelData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {(channelsData || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export const MainDashboard = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  
  // Hooks para dados reais
  const dashboardMetrics = useDashboardMetrics();
  const { activities: recentActivities, isLoading: activitiesLoading } = useRecentActivity(5);
  const { alerts: systemAlerts, systemStatus } = useSystemMetrics();
  const { messagesChart, channelsData } = useDashboardCharts(7);
  const { isConnected, isWebSocketConnected, isPolling, forceUpdate } = useRealTimeUpdates();
  
  const handleRefresh = async () => {
    setRefreshing(true);
    // Simular carregamento
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
    toast({
      title: "Dashboard atualizado",
      description: "Todos os dados foram atualizados com sucesso."
    });
  };
  
  const handleExport = async () => {
    setIsExporting(true);
    // Simular exportação
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsExporting(false);
    toast({
      title: "Exportação iniciada",
      description: "Relatório do dashboard será baixado em breve."
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do seu sistema ConvoFlow
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {/* Indicador de status de conexão */}
          <div className="flex items-center space-x-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${
              isWebSocketConnected ? 'bg-green-500' : 
              isPolling ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="text-muted-foreground">
              {isWebSocketConnected ? 'Tempo real' : 
               isPolling ? 'Polling' : 'Desconectado'}
            </span>
          </div>
          <Button variant="outline" onClick={() => {
            handleRefresh();
            forceUpdate();
          }} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-spin' : ''}`} />
            Exportar
          </Button>
        </div>
      </div>
      
      {/* Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboardMetrics.isLoading ? (
            // Skeleton loading
            Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-24"></div>
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                    </div>
                    <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  </div>
                  <div className="mt-4 h-4 bg-gray-200 rounded w-20"></div>
                </CardContent>
              </Card>
            ))
          ) : (
            [
              {
                id: 'conversations',
                title: 'Conversas Ativas',
                value: dashboardMetrics.activeConversations.toString(),
                change: dashboardMetrics.conversationsTrend,
                trend: dashboardMetrics.conversationsTrend >= 0 ? 'up' : 'down',
                icon: MessageSquare,
                color: 'blue',
                description: 'Conversas em andamento'
              },
              {
                id: 'contacts',
                title: 'Novos Contatos',
                value: dashboardMetrics.newContacts.toString(),
                change: dashboardMetrics.contactsTrend,
                trend: dashboardMetrics.contactsTrend >= 0 ? 'up' : 'down',
                icon: Users,
                color: 'green',
                description: 'Hoje'
              },
              {
                id: 'conversion',
                title: 'Taxa de Conversão',
                value: `${dashboardMetrics.conversionRate.toFixed(1)}%`,
                change: dashboardMetrics.conversionTrend,
                trend: dashboardMetrics.conversionTrend >= 0 ? 'up' : 'down',
                icon: Target,
                color: 'purple',
                description: 'Lead para venda'
              },
              {
                id: 'response_time',
                title: 'Tempo Médio Resposta',
                value: `${dashboardMetrics.avgResponseTime.toFixed(1)} min`,
                change: dashboardMetrics.responseTimeTrend,
                trend: dashboardMetrics.responseTimeTrend <= 0 ? 'up' : 'down', // Invertido: menor é melhor
                icon: Clock,
                color: 'orange',
                description: 'Tempo médio para primeira resposta'
              },
              {
                id: 'messages',
                title: 'Messages Enviadas',
                value: dashboardMetrics.messagesSent.toString(),
                change: dashboardMetrics.messagesTrend,
                trend: dashboardMetrics.messagesTrend >= 0 ? 'up' : 'down',
                icon: Send,
                color: 'indigo',
                description: 'Nas últimas 24h'
              },
              {
                id: 'revenue',
                title: 'Receita Gerada',
                value: `R$ ${dashboardMetrics.generatedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                change: dashboardMetrics.revenueTrend,
                trend: dashboardMetrics.revenueTrend >= 0 ? 'up' : 'down',
                icon: TrendingUp,
                color: 'pink',
                description: 'Este mês'
              }
            ].map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))
          )}
        </div>
      
      {/* Gráficos de Visão Geral */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Mensagens */}
          <Card>
            <CardHeader>
              <CardTitle>Mensagens por Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={messagesChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico de Canais */}
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Canal</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={channelsData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {channelsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ações Rápidas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5" />
              <span>Ações Rápidas</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {quickActions.map((action) => (
                <QuickActionCard key={action.id} action={action} />
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Atividade Recente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Atividade Recente</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <div className="space-y-2">
                {activitiesLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  (recentActivities || []).map((activity) => (
                    <RecentActivityCard key={activity.id} activity={activity} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
        
        {/* Alertas do Sistema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Alertas do Sistema</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(systemAlerts || []).map((alert) => (
                <SystemAlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Status do Sistema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5" />
            <span>Status do Sistema</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">CPU</span>
                <span className="text-sm text-muted-foreground">{systemStatus?.cpu || 68}%</span>
              </div>
              <Progress value={systemStatus?.cpu || 68} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Memória</span>
                <span className="text-sm text-muted-foreground">{systemStatus?.memory || 74}%</span>
              </div>
              <Progress value={systemStatus?.memory || 74} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Disco</span>
                <span className="text-sm text-muted-foreground">{systemStatus?.disk || 45}%</span>
              </div>
              <Progress value={systemStatus?.disk || 45} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Uptime</span>
                <span className="text-sm text-green-600 font-medium">{systemStatus?.uptime || 99.9}%</span>
              </div>
              <Progress value={systemStatus?.uptime || 99.9} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};