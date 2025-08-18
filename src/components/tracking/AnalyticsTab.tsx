import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, TrendingUpIcon, TrendingDownIcon, DownloadIcon, RefreshCwIcon } from 'lucide-react';
import { useTrackingMetrics, useRealTimeMetrics, usePeriodComparison } from '@/hooks/useTrackingMetrics';
import { TimeAnalyticsChart } from './charts/TimeAnalyticsChart';
import { ConversionFunnelChart } from './charts/ConversionFunnelChart';
import { SourceAnalyticsChart } from './charts/SourceAnalyticsChart';
import { PerformanceMetricsChart } from './charts/PerformanceMetricsChart';
import { HeatmapChart } from './charts/HeatmapChart';
import { PredictiveAnalyticsChart } from './charts/PredictiveAnalyticsChart';
import { RealtimeAnalytics } from './charts/RealtimeAnalytics';

type DateRange = '7d' | '30d' | '90d' | '1y' | 'custom';
type MetricType = 'leads' | 'conversions' | 'revenue' | 'performance';

interface AnalyticsFilters {
  dateRange: DateRange;
  metricType: MetricType;
  source?: string;
  status?: string;
  assignedTo?: string;
}

export function AnalyticsTab() {
  const [filters, setFilters] = useState<AnalyticsFilters>({
    dateRange: '30d',
    metricType: 'leads'
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');

  // Hooks para dados
  const { data: metrics, isLoading, refetch } = useTrackingMetrics(filters);
  const { data: realTimeData } = useRealTimeMetrics();
  const { data: comparisonData } = usePeriodComparison(filters.dateRange);

  // Métricas principais calculadas
  const mainMetrics = useMemo(() => {
    if (!metrics) return null;
    
    return {
      totalLeads: metrics.totalLeads,
      conversionRate: ((metrics.conversions / metrics.totalLeads) * 100).toFixed(1),
      totalRevenue: metrics.totalRevenue,
      avgDealSize: (metrics.totalRevenue / metrics.conversions).toFixed(0),
      growthRate: comparisonData?.growthRate || 0
    };
  }, [metrics, comparisonData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    // Implementar exportação
    console.log(`Exportando relatório em ${format}`);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCwIcon className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Carregando análises...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com filtros e ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Análise Detalhada</h2>
          <p className="text-muted-foreground">
            Análises avançadas de performance por fonte de tráfego em desenvolvimento...
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select
            value={filters.dateRange}
            onValueChange={(value: DateRange) => 
              setFilters(prev => ({ ...prev, dateRange: value }))
            }
          >
            <SelectTrigger className="w-32">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
              <SelectItem value="1y">1 ano</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          
          <Select onValueChange={handleExport}>
            <SelectTrigger className="w-32">
              <DownloadIcon className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Exportar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Métricas principais */}
      {mainMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
              {realTimeData?.isLive && (
                <Badge variant="secondary" className="text-xs">
                  Ao vivo
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(mainMetrics.totalLeads)}</div>
              <div className="flex items-center text-xs text-muted-foreground">
                {mainMetrics.growthRate > 0 ? (
                  <TrendingUpIcon className="h-3 w-3 mr-1 text-green-500" />
                ) : (
                  <TrendingDownIcon className="h-3 w-3 mr-1 text-red-500" />
                )}
                {Math.abs(mainMetrics.growthRate)}% vs período anterior
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mainMetrics.conversionRate}%</div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(metrics?.conversions || 0)} conversões
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(mainMetrics.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">
                Ticket médio: {formatCurrency(Number(mainMetrics.avgDealSize))}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.performanceScore ? `${metrics.performanceScore}/100` : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                Score de qualidade dos leads
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs de análises */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="realtime">Tempo Real</TabsTrigger>
          <TabsTrigger value="temporal">Temporal</TabsTrigger>
          <TabsTrigger value="funnel">Funil</TabsTrigger>
          <TabsTrigger value="sources">Fontes</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="predictive">Preditiva</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TimeAnalyticsChart 
              data={metrics?.timeSeriesData || []} 
              granularity="day"
            />
            <ConversionFunnelChart 
              data={metrics?.funnelData || []} 
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SourceAnalyticsChart 
              data={metrics?.sourceData || []} 
            />
            <HeatmapChart 
              data={metrics?.heatmapData || []} 
              type="hourly"
            />
          </div>
        </TabsContent>

        <TabsContent value="realtime">
          <RealtimeAnalytics />
        </TabsContent>

        <TabsContent value="temporal">
          <TimeAnalyticsChart 
            data={metrics?.timeSeriesData || []} 
            granularity="hour"
            showComparison={true}
            showTrends={true}
          />
        </TabsContent>

        <TabsContent value="funnel">
          <ConversionFunnelChart 
            data={metrics?.funnelData || []} 
            showDetails={true}
            enableDrilldown={true}
          />
        </TabsContent>

        <TabsContent value="sources">
          <SourceAnalyticsChart 
            data={metrics?.sourceData || []} 
            showROI={true}
            enableFiltering={true}
          />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceMetricsChart 
            data={metrics?.performanceData || []} 
            showBenchmarks={true}
          />
        </TabsContent>

        <TabsContent value="predictive">
          <PredictiveAnalyticsChart 
            data={metrics?.predictiveData || []} 
            forecastPeriod={30}
          />
        </TabsContent>
      </Tabs>

      {/* Insights automáticos */}
      {metrics?.insights && metrics.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Insights Automáticos</CardTitle>
            <CardDescription>
              Análises geradas automaticamente com base nos seus dados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.insights.map((insight, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    insight.type === 'positive' ? 'bg-green-500' :
                    insight.type === 'negative' ? 'bg-red-500' :
                    'bg-yellow-500'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{insight.title}</p>
                    <p className="text-xs text-muted-foreground">{insight.description}</p>
                  </div>
                  {insight.action && (
                    <Button variant="outline" size="sm">
                      {insight.action}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}