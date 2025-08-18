import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { 
  TrendingUpIcon, 
  TrendingDownIcon, 
  TargetIcon,
  AwardIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  UsersIcon
} from 'lucide-react';

interface PerformanceData {
  metric: string;
  value: number;
  target: number;
  benchmark: number;
  trend: 'up' | 'down' | 'stable';
  category: 'conversion' | 'quality' | 'efficiency' | 'engagement';
  description: string;
  unit: string;
  importance: 'high' | 'medium' | 'low';
  timeSeriesData?: Array<{
    date: string;
    value: number;
    target: number;
  }>;
}

interface PerformanceMetricsChartProps {
  data: PerformanceData[];
  showBenchmarks?: boolean;
  className?: string;
}

const defaultData: PerformanceData[] = [
  {
    metric: 'Taxa de Conversão',
    value: 15.2,
    target: 18.0,
    benchmark: 12.5,
    trend: 'up',
    category: 'conversion',
    description: 'Percentual de leads que se convertem em clientes',
    unit: '%',
    importance: 'high',
    timeSeriesData: [
      { date: '2024-01-01', value: 12.1, target: 18.0 },
      { date: '2024-01-02', value: 13.5, target: 18.0 },
      { date: '2024-01-03', value: 14.2, target: 18.0 },
      { date: '2024-01-04', value: 15.2, target: 18.0 }
    ]
  },
  {
    metric: 'Qualidade do Lead',
    value: 78,
    target: 85,
    benchmark: 70,
    trend: 'up',
    category: 'quality',
    description: 'Score médio de qualidade dos leads gerados',
    unit: '/100',
    importance: 'high',
    timeSeriesData: [
      { date: '2024-01-01', value: 72, target: 85 },
      { date: '2024-01-02', value: 75, target: 85 },
      { date: '2024-01-03', value: 77, target: 85 },
      { date: '2024-01-04', value: 78, target: 85 }
    ]
  },
  {
    metric: 'Tempo de Resposta',
    value: 2.5,
    target: 1.0,
    benchmark: 4.0,
    trend: 'down',
    category: 'efficiency',
    description: 'Tempo médio para primeira resposta ao lead',
    unit: 'h',
    importance: 'high',
    timeSeriesData: [
      { date: '2024-01-01', value: 3.2, target: 1.0 },
      { date: '2024-01-02', value: 2.8, target: 1.0 },
      { date: '2024-01-03', value: 2.6, target: 1.0 },
      { date: '2024-01-04', value: 2.5, target: 1.0 }
    ]
  },
  {
    metric: 'Taxa de Engajamento',
    value: 68.5,
    target: 75.0,
    benchmark: 60.0,
    trend: 'stable',
    category: 'engagement',
    description: 'Percentual de leads que respondem às interações',
    unit: '%',
    importance: 'medium',
    timeSeriesData: [
      { date: '2024-01-01', value: 67.2, target: 75.0 },
      { date: '2024-01-02', value: 68.1, target: 75.0 },
      { date: '2024-01-03', value: 68.8, target: 75.0 },
      { date: '2024-01-04', value: 68.5, target: 75.0 }
    ]
  },
  {
    metric: 'Custo por Lead',
    value: 45.30,
    target: 35.00,
    benchmark: 55.00,
    trend: 'down',
    category: 'efficiency',
    description: 'Custo médio para aquisição de um lead',
    unit: 'R$',
    importance: 'high',
    timeSeriesData: [
      { date: '2024-01-01', value: 52.10, target: 35.00 },
      { date: '2024-01-02', value: 48.20, target: 35.00 },
      { date: '2024-01-03', value: 46.80, target: 35.00 },
      { date: '2024-01-04', value: 45.30, target: 35.00 }
    ]
  },
  {
    metric: 'Lifetime Value',
    value: 1250,
    target: 1500,
    benchmark: 1000,
    trend: 'up',
    category: 'conversion',
    description: 'Valor médio do cliente ao longo do tempo',
    unit: 'R$',
    importance: 'high',
    timeSeriesData: [
      { date: '2024-01-01', value: 1180, target: 1500 },
      { date: '2024-01-02', value: 1210, target: 1500 },
      { date: '2024-01-03', value: 1230, target: 1500 },
      { date: '2024-01-04', value: 1250, target: 1500 }
    ]
  }
];

const CATEGORY_COLORS = {
  conversion: '#10b981',
  quality: '#3b82f6',
  efficiency: '#f59e0b',
  engagement: '#8b5cf6'
};

const CATEGORY_ICONS = {
  conversion: TargetIcon,
  quality: AwardIcon,
  efficiency: ClockIcon,
  engagement: UsersIcon
};

export function PerformanceMetricsChart({ 
  data = defaultData, 
  showBenchmarks = false,
  className 
}: PerformanceMetricsChartProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'detailed' | 'trends'>('overview');

  // Filtrar dados por categoria
  const filteredData = useMemo(() => {
    if (selectedCategory === 'all') return data;
    return data.filter(item => item.category === selectedCategory);
  }, [data, selectedCategory]);

  // Preparar dados para radar chart
  const radarData = useMemo(() => {
    return filteredData.map(item => ({
      metric: item.metric,
      value: (item.value / item.target) * 100,
      benchmark: (item.benchmark / item.target) * 100,
      fullMark: 100
    }));
  }, [filteredData]);

  // Calcular score geral
  const overallScore = useMemo(() => {
    const totalScore = filteredData.reduce((sum, item) => {
      const score = Math.min((item.value / item.target) * 100, 100);
      const weight = item.importance === 'high' ? 3 : item.importance === 'medium' ? 2 : 1;
      return sum + (score * weight);
    }, 0);
    
    const totalWeight = filteredData.reduce((sum, item) => {
      return sum + (item.importance === 'high' ? 3 : item.importance === 'medium' ? 2 : 1);
    }, 0);
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }, [filteredData]);

  // Identificar métricas críticas
  const criticalMetrics = useMemo(() => {
    return filteredData.filter(item => {
      const performance = (item.value / item.target) * 100;
      return performance < 80 && item.importance === 'high';
    });
  }, [filteredData]);

  const formatValue = (value: number, unit: string) => {
    if (unit === 'R$') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    }
    if (unit === '%') {
      return `${value.toFixed(1)}%`;
    }
    if (unit === 'h') {
      return `${value.toFixed(1)}h`;
    }
    return `${value.toFixed(0)}${unit}`;
  };

  const getPerformanceColor = (value: number, target: number) => {
    const performance = (value / target) * 100;
    if (performance >= 100) return 'text-green-500';
    if (performance >= 80) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getPerformanceStatus = (value: number, target: number) => {
    const performance = (value / target) * 100;
    if (performance >= 100) return 'Excelente';
    if (performance >= 80) return 'Bom';
    if (performance >= 60) return 'Regular';
    return 'Crítico';
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Score geral */}
      <div className="text-center">
        <div className="text-4xl font-bold mb-2">
          <span className={getPerformanceColor(overallScore, 100)}>
            {overallScore.toFixed(0)}/100
          </span>
        </div>
        <div className="text-muted-foreground">Score Geral de Performance</div>
        <div className="mt-2">
          <Badge variant={overallScore >= 80 ? 'default' : overallScore >= 60 ? 'secondary' : 'destructive'}>
            {getPerformanceStatus(overallScore, 100)}
          </Badge>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" fontSize={12} />
            <PolarRadiusAxis 
              angle={90} 
              domain={[0, 120]} 
              fontSize={10}
              tickFormatter={(value) => `${value}%`}
            />
            <Radar
              name="Performance"
              dataKey="value"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
              strokeWidth={2}
            />
            {showBenchmarks && (
              <Radar
                name="Benchmark"
                dataKey="benchmark"
                stroke="#6b7280"
                fill="#6b7280"
                fillOpacity={0.1}
                strokeWidth={1}
                strokeDasharray="5 5"
              />
            )}
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                name === 'value' ? 'Performance' : 'Benchmark'
              ]}
            />
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Métricas críticas */}
      {criticalMetrics.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangleIcon className="h-5 w-5 text-red-500" />
            <h4 className="font-semibold text-red-800 dark:text-red-200">
              Métricas Críticas ({criticalMetrics.length})
            </h4>
          </div>
          <div className="space-y-2">
            {criticalMetrics.map((metric, index) => {
              const IconComponent = CATEGORY_ICONS[metric.category];
              return (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-red-500" />
                    <span className="text-red-700 dark:text-red-300">{metric.metric}</span>
                  </div>
                  <div className="text-red-600 dark:text-red-400">
                    {formatValue(metric.value, metric.unit)} / {formatValue(metric.target, metric.unit)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderDetailed = () => (
    <div className="space-y-4">
      {filteredData.map((metric, index) => {
        const IconComponent = CATEGORY_ICONS[metric.category];
        const performance = (metric.value / metric.target) * 100;
        
        return (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div 
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${CATEGORY_COLORS[metric.category]}20` }}
                >
                  <IconComponent 
                    className="h-5 w-5" 
                    style={{ color: CATEGORY_COLORS[metric.category] }}
                  />
                </div>
                <div>
                  <h4 className="font-semibold">{metric.metric}</h4>
                  <p className="text-sm text-muted-foreground">{metric.description}</p>
                </div>
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-2">
                  {metric.trend === 'up' ? (
                    <TrendingUpIcon className="h-4 w-4 text-green-500" />
                  ) : metric.trend === 'down' ? (
                    <TrendingDownIcon className="h-4 w-4 text-red-500" />
                  ) : null}
                  <Badge variant={metric.importance === 'high' ? 'default' : 'secondary'}>
                    {metric.importance}
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Atual: <strong>{formatValue(metric.value, metric.unit)}</strong></span>
                <span>Meta: <strong>{formatValue(metric.target, metric.unit)}</strong></span>
                {showBenchmarks && (
                  <span>Benchmark: <strong>{formatValue(metric.benchmark, metric.unit)}</strong></span>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Performance</span>
                  <span className={getPerformanceColor(metric.value, metric.target)}>
                    {performance.toFixed(1)}%
                  </span>
                </div>
                <Progress value={Math.min(performance, 100)} className="h-2" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );

  const renderTrends = () => {
    if (!selectedMetric) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Selecione uma métrica para ver as tendências</p>
        </div>
      );
    }

    const metric = filteredData.find(m => m.metric === selectedMetric);
    if (!metric?.timeSeriesData) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Dados de tendência não disponíveis</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">{metric.metric} - Tendência</h4>
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filteredData.map((m) => (
                <SelectItem key={m.metric} value={m.metric}>
                  {m.metric}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metric.timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
              />
              <YAxis 
                tickFormatter={(value) => formatValue(value, metric.unit)}
              />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                formatter={(value: number, name: string) => [
                  formatValue(value, metric.unit),
                  name === 'value' ? 'Atual' : 'Meta'
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CATEGORY_COLORS[metric.category]}
                strokeWidth={3}
                name="Atual"
              />
              <Line
                type="monotone"
                dataKey="target"
                stroke="#6b7280"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Meta"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Métricas de Performance</CardTitle>
            <CardDescription>
              Análise detalhada de KPIs e benchmarks
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="conversion">Conversão</SelectItem>
                <SelectItem value="quality">Qualidade</SelectItem>
                <SelectItem value="efficiency">Eficiência</SelectItem>
                <SelectItem value="engagement">Engajamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={viewMode} onValueChange={(value: any) => setViewMode(value)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="detailed">Detalhado</TabsTrigger>
            <TabsTrigger value="trends">Tendências</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {renderOverview()}
          </TabsContent>

          <TabsContent value="detailed">
            {renderDetailed()}
          </TabsContent>

          <TabsContent value="trends">
            {renderTrends()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}