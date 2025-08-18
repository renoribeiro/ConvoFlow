import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useRealTimeMetrics } from '@/hooks/useRealTimeAnalytics';
import { AnalyticsFilters } from './AdvancedFilters';
import {
  Activity,
  Users,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Server,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface RealTimeMetricsProps {
  className?: string;
  filters: AnalyticsFilters;
}

export function RealTimeMetrics({ className, filters }: RealTimeMetricsProps) {
  const { metrics, isLoading, error, refresh, lastUpdated } = useRealTimeMetrics(filters);
  const {
    realTimeData,
    systemMetrics,
    processingStatus,
    viewStats,
    actions
  } = useRealTimeDashboard();

  const [autoRefresh, setAutoRefresh] = useState(true);

  // Função para formatar tempo
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  // Função para formatar duração
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  // Função para formatar valores
  const formatValue = (value: number, type: 'currency' | 'percentage' | 'number') => {
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(value);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'number':
        return new Intl.NumberFormat('pt-BR').format(value);
      default:
        return value.toString();
    }
  };

  // Função para calcular mudança percentual
  const calculateChange = (current: number, type: string) => {
    // Em produção, isso viria dos dados históricos
    const mockChanges: Record<string, number> = {
      activeVisitors: 12,
      totalLeads: 8,
      totalConversions: 25,
      totalRevenue: -5,
      avgConversionRate: 3.2
    };
    return mockChanges[type] || 0;
  };

  // Preparar dados das métricas
  const metricsData = metrics ? [
    {
      title: 'Visitantes Online',
      value: formatValue(metrics.activeVisitors, 'number'),
      change: calculateChange(metrics.activeVisitors, 'activeVisitors'),
      icon: Users,
      color: 'text-blue-600'
    },
    {
      title: 'Total de Leads',
      value: formatValue(metrics.totalLeads, 'number'),
      change: calculateChange(metrics.totalLeads, 'totalLeads'),
      icon: Target,
      color: 'text-green-600'
    },
    {
      title: 'Conversões',
      value: formatValue(metrics.totalConversions, 'number'),
      change: calculateChange(metrics.totalConversions, 'totalConversions'),
      icon: TrendingUp,
      color: 'text-purple-600'
    },
    {
      title: 'Receita Total',
      value: formatValue(metrics.totalRevenue, 'currency'),
      change: calculateChange(metrics.totalRevenue, 'totalRevenue'),
      icon: DollarSign,
      color: 'text-orange-600'
    },
    {
      title: 'Taxa de Conversão',
      value: formatValue(metrics.avgConversionRate, 'percentage'),
      change: calculateChange(metrics.avgConversionRate, 'avgConversionRate'),
      icon: Activity,
      color: 'text-indigo-600'
    }
  ] : [];

  // Calcular taxa de conversão
  const conversionRate = realTimeData?.leadsToday > 0 
    ? (realTimeData.conversionsToday / realTimeData.leadsToday) * 100 
    : 0;

  // Calcular valor médio por conversão
  const avgOrderValue = realTimeData?.conversionsToday > 0
    ? realTimeData.revenueToday / realTimeData.conversionsToday
    : 0;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span>Erro ao carregar métricas: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header com controles */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Métricas em Tempo Real</h2>
          <p className="text-muted-foreground">
            Última atualização: {lastUpdated ? formatTime(lastUpdated) : 'Nunca'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refresh();
              actions?.refreshRealTime();
              actions?.refreshSystemMetrics();
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Auto Refresh
          </Button>
        </div>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {metricsData.map((metric, index) => {
          const Icon = metric.icon;
          const isPositive = metric.change >= 0;
          const TrendIcon = isPositive ? TrendingUp : TrendingDown;
          
          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                    <p className="text-2xl font-bold">{metric.value}</p>
                  </div>
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center",
                    metric.color === 'text-blue-600' && "bg-blue-100",
                    metric.color === 'text-green-600' && "bg-green-100",
                    metric.color === 'text-purple-600' && "bg-purple-100",
                    metric.color === 'text-orange-600' && "bg-orange-100",
                    metric.color === 'text-indigo-600' && "bg-indigo-100"
                  )}>
                    <Icon className={cn("h-4 w-4", metric.color)} />
                  </div>
                </div>
                <div className="flex items-center mt-2">
                  <TrendIcon className={cn(
                    "h-3 w-3 mr-1",
                    isPositive ? "text-green-500" : "text-red-500"
                  )} />
                  <span className={cn(
                    "text-xs",
                    isPositive ? "text-green-600" : "text-red-600"
                  )}>
                    {isPositive ? '+' : ''}{metric.change.toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Métricas do Sistema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Métricas do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  CPU
                </span>
                <span>{systemMetrics.cpuUsage.toFixed(1)}%</span>
              </div>
              <Progress value={systemMetrics.cpuUsage} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Memória
                </span>
                <span>{systemMetrics.memoryUsage.toFixed(1)} MB</span>
              </div>
              <Progress value={(systemMetrics.memoryUsage / 1024) * 100} className="h-2" />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Conexões Ativas</p>
                <p className="font-semibold">{formatNumber(systemMetrics?.activeConnections || 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cache Hit Rate</p>
                <p className="font-semibold">{systemMetrics?.cacheHitRatio?.toFixed(1) || '0.0'}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">TPS</p>
                <p className="font-semibold">{systemMetrics?.transactionsPerSecond?.toFixed(1) || '0.0'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant="default" className={cn(
                  systemMetrics ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                )}>
                  {systemMetrics ? (
                    <Wifi className="h-3 w-3 mr-1" />
                  ) : (
                    <WifiOff className="h-3 w-3 mr-1" />
                  )}
                  {systemMetrics ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status do Processamento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Processamento de Dados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status do Serviço</span>
              <Badge 
                variant={processingStatus.isRunning ? "default" : "secondary"}
                className={processingStatus.isRunning ? "bg-green-100 text-green-800" : ""}
              >
                {processingStatus.isRunning ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Registros Processados</span>
                <span className="font-semibold">{formatNumber(processingStatus?.recordsProcessed || 0)}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span>Tempo de Processamento</span>
                <span className="font-semibold">{formatDuration(processingStatus?.processingTime || 0)}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span>Erros</span>
                <span className={`font-semibold ${(processingStatus?.errors || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatNumber(processingStatus?.errors || 0)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Última Atualização
                </span>
                <span className="font-semibold">{processingStatus?.lastUpdate ? formatTime(processingStatus.lastUpdate) : 'Nunca'}</span>
              </div>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={processingStatus?.isRunning ? actions?.stopProcessing : actions?.startProcessing}
                className="flex-1"
              >
                {processingStatus?.isRunning ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Parar
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Iniciar
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={actions?.forceProcess}
                disabled={!processingStatus?.isRunning}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Forçar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas das Materialized Views */}
      {viewStats && viewStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Materialized Views
              <Button
                size="sm"
                variant="outline"
                onClick={actions?.refreshAllViews}
                className="ml-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar Todas
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {viewStats.map((view) => (
                <div key={view.view_name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{view.view_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(view.row_count)} registros • {(view.size_bytes / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={view.is_populated ? "default" : "secondary"}>
                      {view.is_populated ? 'Populada' : 'Vazia'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => actions?.refreshView(view.view_name)}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default RealTimeMetrics;