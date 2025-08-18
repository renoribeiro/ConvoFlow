import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  ActivityIcon,
  UsersIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  EyeIcon,
  MousePointerClickIcon,
  MessageSquareIcon,
  PhoneCallIcon,
  MailIcon,
  ClockIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  PlayIcon,
  PauseIcon,
  RefreshCwIcon
} from 'lucide-react';

interface RealtimeData {
  timestamp: string;
  visitors: number;
  leads: number;
  conversions: number;
  pageViews: number;
  interactions: number;
  sources: Record<string, number>;
  devices: Record<string, number>;
  locations: Record<string, number>;
}

interface LiveMetric {
  id: string;
  label: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  icon: React.ComponentType<any>;
  color: string;
  target?: number;
  unit: string;
}

interface RealtimeAnalyticsProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

// Simular dados em tempo real
const generateRealtimeData = (): RealtimeData => {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    visitors: Math.floor(Math.random() * 50) + 20,
    leads: Math.floor(Math.random() * 15) + 5,
    conversions: Math.floor(Math.random() * 5) + 1,
    pageViews: Math.floor(Math.random() * 200) + 100,
    interactions: Math.floor(Math.random() * 80) + 30,
    sources: {
      'Google Ads': Math.floor(Math.random() * 20) + 10,
      'Facebook': Math.floor(Math.random() * 15) + 8,
      'Instagram': Math.floor(Math.random() * 12) + 5,
      'LinkedIn': Math.floor(Math.random() * 8) + 3,
      'Orgânico': Math.floor(Math.random() * 25) + 15,
      'Direto': Math.floor(Math.random() * 10) + 5
    },
    devices: {
      'Desktop': Math.floor(Math.random() * 30) + 20,
      'Mobile': Math.floor(Math.random() * 40) + 25,
      'Tablet': Math.floor(Math.random() * 10) + 5
    },
    locations: {
      'São Paulo': Math.floor(Math.random() * 25) + 15,
      'Rio de Janeiro': Math.floor(Math.random() * 15) + 10,
      'Belo Horizonte': Math.floor(Math.random() * 10) + 5,
      'Brasília': Math.floor(Math.random() * 8) + 4,
      'Outros': Math.floor(Math.random() * 20) + 10
    }
  };
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function RealtimeAnalytics({ 
  autoRefresh = true, 
  refreshInterval = 5000,
  className 
}: RealtimeAnalyticsProps) {
  const [data, setData] = useState<RealtimeData[]>([]);
  const [isLive, setIsLive] = useState(autoRefresh);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h'>('1h');

  // Gerar dados iniciais
  useEffect(() => {
    const initialData = Array.from({ length: 20 }, (_, i) => {
      const timestamp = new Date(Date.now() - (19 - i) * 60000);
      return {
        ...generateRealtimeData(),
        timestamp: timestamp.toISOString()
      };
    });
    setData(initialData);
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const newData = generateRealtimeData();
      setData(prev => {
        const updated = [...prev, newData];
        // Manter apenas os últimos 60 pontos
        return updated.slice(-60);
      });
      setLastUpdate(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [isLive, refreshInterval]);

  // Calcular métricas atuais
  const currentMetrics = useMemo(() => {
    if (data.length === 0) return [];
    
    const current = data[data.length - 1];
    const previous = data.length > 1 ? data[data.length - 2] : current;
    
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return 0;
      return ((current - previous) / previous) * 100;
    };
    
    const getTrend = (change: number): 'up' | 'down' | 'stable' => {
      if (Math.abs(change) < 1) return 'stable';
      return change > 0 ? 'up' : 'down';
    };

    return [
      {
        id: 'visitors',
        label: 'Visitantes Online',
        value: current.visitors,
        change: calculateChange(current.visitors, previous.visitors),
        trend: getTrend(calculateChange(current.visitors, previous.visitors)),
        icon: UsersIcon,
        color: '#3b82f6',
        unit: ''
      },
      {
        id: 'leads',
        label: 'Novos Leads',
        value: current.leads,
        change: calculateChange(current.leads, previous.leads),
        trend: getTrend(calculateChange(current.leads, previous.leads)),
        icon: TrendingUpIcon,
        color: '#10b981',
        target: 20,
        unit: ''
      },
      {
        id: 'conversions',
        label: 'Conversões',
        value: current.conversions,
        change: calculateChange(current.conversions, previous.conversions),
        trend: getTrend(calculateChange(current.conversions, previous.conversions)),
        icon: CheckCircleIcon,
        color: '#f59e0b',
        target: 8,
        unit: ''
      },
      {
        id: 'pageViews',
        label: 'Visualizações',
        value: current.pageViews,
        change: calculateChange(current.pageViews, previous.pageViews),
        trend: getTrend(calculateChange(current.pageViews, previous.pageViews)),
        icon: EyeIcon,
        color: '#8b5cf6',
        unit: ''
      },
      {
        id: 'interactions',
        label: 'Interações',
        value: current.interactions,
        change: calculateChange(current.interactions, previous.interactions),
        trend: getTrend(calculateChange(current.interactions, previous.interactions)),
        icon: MousePointerClickIcon,
        color: '#ef4444',
        unit: ''
      }
    ] as LiveMetric[];
  }, [data]);

  // Preparar dados para gráficos
  const chartData = useMemo(() => {
    return data.map(item => ({
      time: new Date(item.timestamp).toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      visitors: item.visitors,
      leads: item.leads,
      conversions: item.conversions,
      pageViews: item.pageViews,
      interactions: item.interactions
    }));
  }, [data]);

  // Dados para gráfico de pizza (fontes)
  const sourcesData = useMemo(() => {
    if (data.length === 0) return [];
    const current = data[data.length - 1];
    return Object.entries(current.sources).map(([name, value]) => ({
      name,
      value
    }));
  }, [data]);

  // Dados para gráfico de dispositivos
  const devicesData = useMemo(() => {
    if (data.length === 0) return [];
    const current = data[data.length - 1];
    return Object.entries(current.devices).map(([name, value]) => ({
      name,
      value
    }));
  }, [data]);

  const formatChange = (change: number) => {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  const renderMetricCard = (metric: LiveMetric) => {
    const IconComponent = metric.icon;
    const progress = metric.target ? (metric.value / metric.target) * 100 : undefined;
    
    return (
      <Card key={metric.id} className="relative overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${metric.color}20` }}
              >
                <IconComponent 
                  className="h-4 w-4" 
                  style={{ color: metric.color }}
                />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </span>
            </div>
            
            <div className="flex items-center gap-1">
              {metric.trend === 'up' ? (
                <TrendingUpIcon className="h-3 w-3 text-green-500" />
              ) : metric.trend === 'down' ? (
                <TrendingDownIcon className="h-3 w-3 text-red-500" />
              ) : null}
              <span className={`text-xs ${
                metric.trend === 'up' ? 'text-green-500' : 
                metric.trend === 'down' ? 'text-red-500' : 
                'text-muted-foreground'
              }`}>
                {formatChange(metric.change)}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-2xl font-bold">
              {metric.value.toLocaleString()}{metric.unit}
            </div>
            
            {metric.target && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Meta: {metric.target}</span>
                  <span>{progress?.toFixed(0)}%</span>
                </div>
                <Progress value={Math.min(progress || 0, 100)} className="h-1" />
              </div>
            )}
          </div>
        </CardContent>
        
        {/* Indicador de status ao vivo */}
        {isLive && (
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-500 font-medium">AO VIVO</span>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header com controles */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Análises em Tempo Real</h2>
          <p className="text-muted-foreground">
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={isLive ? "default" : "outline"}
            size="sm"
            onClick={() => setIsLive(!isLive)}
            className="flex items-center gap-2"
          >
            {isLive ? (
              <>
                <PauseIcon className="h-4 w-4" />
                Pausar
              </>
            ) : (
              <>
                <PlayIcon className="h-4 w-4" />
                Iniciar
              </>
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newData = generateRealtimeData();
              setData(prev => [...prev, newData].slice(-60));
              setLastUpdate(new Date());
            }}
          >
            <RefreshCwIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {currentMetrics.map(renderMetricCard)}
      </div>

      {/* Gráficos */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="sources">Fontes de Tráfego</TabsTrigger>
          <TabsTrigger value="devices">Dispositivos</TabsTrigger>
          <TabsTrigger value="activity">Atividade</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Atividade em Tempo Real</CardTitle>
              <CardDescription>
                Fluxo de visitantes, leads e conversões nos últimos minutos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      labelFormatter={(label) => `Horário: ${label}`}
                      formatter={(value: number, name: string) => [
                        value.toLocaleString(),
                        name === 'visitors' ? 'Visitantes' :
                        name === 'leads' ? 'Leads' :
                        name === 'conversions' ? 'Conversões' :
                        name === 'pageViews' ? 'Visualizações' : 'Interações'
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="leads"
                      stackId="1"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="conversions"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Fonte</CardTitle>
                <CardDescription>Origem do tráfego atual</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourcesData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {sourcesData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ranking de Fontes</CardTitle>
                <CardDescription>Leads por fonte de tráfego</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sourcesData
                    .sort((a, b) => b.value - a.value)
                    .map((source, index) => {
                      const total = sourcesData.reduce((sum, s) => sum + s.value, 0);
                      const percentage = (source.value / total) * 100;
                      
                      return (
                        <div key={source.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="font-medium">{source.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{source.value}</div>
                            <div className="text-xs text-muted-foreground">
                              {percentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle>Dispositivos</CardTitle>
              <CardDescription>Distribuição por tipo de dispositivo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={devicesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Feed de Atividades</CardTitle>
              <CardDescription>Eventos recentes em tempo real</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {data.slice(-10).reverse().map((item, index) => {
                  const time = new Date(item.timestamp).toLocaleTimeString('pt-BR');
                  return (
                    <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <ActivityIcon className="h-4 w-4 text-blue-500" />
                      <div className="flex-1">
                        <div className="text-sm">
                          <strong>{item.leads}</strong> novos leads, 
                          <strong>{item.conversions}</strong> conversões
                        </div>
                        <div className="text-xs text-muted-foreground">{time}</div>
                      </div>
                      <Badge variant="outline">{item.visitors} visitantes</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}