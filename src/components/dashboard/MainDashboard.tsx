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

const mockDashboardMetrics: DashboardMetric[] = [
  {
    id: '1',
    title: 'Mensagens Hoje',
    value: '2,847',
    change: 12.5,
    trend: 'up',
    icon: <MessageSquare className="h-5 w-5" />,
    color: 'text-blue-600',
    description: 'Total de mensagens processadas hoje'
  },
  {
    id: '2',
    title: 'Usuários Ativos',
    value: '1,234',
    change: 8.2,
    trend: 'up',
    icon: <Users className="h-5 w-5" />,
    color: 'text-green-600',
    description: 'Usuários ativos nas últimas 24h'
  },
  {
    id: '3',
    title: 'Taxa de Conversão',
    value: '24.8%',
    change: -2.1,
    trend: 'down',
    icon: <Target className="h-5 w-5" />,
    color: 'text-purple-600',
    description: 'Conversões de leads em vendas'
  },
  {
    id: '4',
    title: 'Tempo de Resposta',
    value: '1.2s',
    change: -15.3,
    trend: 'down',
    icon: <Clock className="h-5 w-5" />,
    color: 'text-orange-600',
    description: 'Tempo médio de resposta automática'
  },
  {
    id: '5',
    title: 'Automações Ativas',
    value: '89',
    change: 5.7,
    trend: 'up',
    icon: <Zap className="h-5 w-5" />,
    color: 'text-yellow-600',
    description: 'Workflows em execução'
  },
  {
    id: '6',
    title: 'Satisfação',
    value: '4.6/5',
    change: 3.2,
    trend: 'up',
    icon: <Star className="h-5 w-5" />,
    color: 'text-pink-600',
    description: 'Avaliação média dos atendimentos'
  }
];

const mockQuickActions: QuickAction[] = [
  {
    id: '1',
    title: 'Nova Campanha',
    description: 'Criar campanha de marketing',
    icon: <Send className="h-5 w-5" />,
    action: () => {},
    color: 'bg-blue-500'
  },
  {
    id: '2',
    title: 'Relatório',
    description: 'Gerar relatório personalizado',
    icon: <BarChart3 className="h-5 w-5" />,
    action: () => {},
    color: 'bg-green-500'
  },
  {
    id: '3',
    title: 'Configurações',
    description: 'Ajustar configurações do sistema',
    icon: <Settings className="h-5 w-5" />,
    action: () => {},
    color: 'bg-purple-500'
  },
  {
    id: '4',
    title: 'Backup',
    description: 'Fazer backup dos dados',
    icon: <Database className="h-5 w-5" />,
    action: () => {},
    color: 'bg-orange-500'
  }
];

const mockRecentActivity: RecentActivity[] = [
  {
    id: '1',
    type: 'message',
    title: 'Nova mensagem recebida',
    description: 'Cliente João Silva enviou uma mensagem via WhatsApp',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    status: 'info'
  },
  {
    id: '2',
    type: 'automation',
    title: 'Automação executada',
    description: 'Workflow "Boas-vindas" foi executado com sucesso',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    status: 'success'
  },
  {
    id: '3',
    type: 'user',
    title: 'Novo usuário registrado',
    description: 'Maria Santos se cadastrou na plataforma',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: 'success'
  },
  {
    id: '4',
    type: 'system',
    title: 'Sistema atualizado',
    description: 'Atualização v2.1.0 instalada com sucesso',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    status: 'info'
  },
  {
    id: '5',
    type: 'message',
    title: 'Falha na entrega',
    description: 'Mensagem para +55 11 99999-9999 falhou',
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    status: 'error'
  }
];

const mockSystemAlerts: SystemAlert[] = [
  {
    id: '1',
    type: 'warning',
    title: 'Uso de CPU Elevado',
    message: 'CPU está em 78% de utilização. Considere otimizar processos.',
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    priority: 'medium'
  },
  {
    id: '2',
    type: 'info',
    title: 'Backup Concluído',
    message: 'Backup automático foi realizado com sucesso.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    priority: 'low'
  },
  {
    id: '3',
    type: 'success',
    title: 'Meta Atingida',
    message: 'Meta de conversão mensal foi atingida com 3 dias de antecedência.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    priority: 'high'
  }
];

const mockChartData = [
  { name: 'Seg', messages: 1200, users: 400, conversions: 24 },
  { name: 'Ter', messages: 1900, users: 600, conversions: 32 },
  { name: 'Qua', messages: 1600, users: 520, conversions: 28 },
  { name: 'Qui', messages: 2200, users: 780, conversions: 45 },
  { name: 'Sex', messages: 2800, users: 890, conversions: 52 },
  { name: 'Sáb', messages: 1800, users: 650, conversions: 38 },
  { name: 'Dom', messages: 1400, users: 480, conversions: 26 }
];

const mockChannelData = [
  { name: 'WhatsApp', value: 45, color: '#25D366' },
  { name: 'Instagram', value: 25, color: '#E4405F' },
  { name: 'Facebook', value: 20, color: '#1877F2' },
  { name: 'Telegram', value: 10, color: '#0088CC' }
];

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
            <BarChart data={mockChartData}>
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
                data={mockChannelData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {mockChannelData.map((entry, index) => (
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
  const { toast } = useToast();
  
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
  
  const handleExport = () => {
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
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>
      
      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockDashboardMetrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>
      
      {/* Gráficos de Visão Geral */}
      <OverviewCharts />
      
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
              {mockQuickActions.map((action) => (
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
                {mockRecentActivity.map((activity) => (
                  <RecentActivityCard key={activity.id} activity={activity} />
                ))}
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
              {mockSystemAlerts.map((alert) => (
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
                <span className="text-sm text-muted-foreground">68%</span>
              </div>
              <Progress value={68} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Memória</span>
                <span className="text-sm text-muted-foreground">74%</span>
              </div>
              <Progress value={74} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Disco</span>
                <span className="text-sm text-muted-foreground">45%</span>
              </div>
              <Progress value={45} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Uptime</span>
                <span className="text-sm text-green-600 font-medium">99.9%</span>
              </div>
              <Progress value={99.9} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};