import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart, 
  LineChart, 
  Target,
  Users,
  DollarSign,
  Clock,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  Calendar,
  Globe,
  Smartphone,
  Monitor
} from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { 
  useTrackingMetrics, 
  useLeadTracking, 
  useCampaignPerformance,
  useTrafficSources 
} from '@/hooks/useTracking';
import { formatCurrency } from '@/lib/utils';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';

// Componentes de gráficos (serão implementados)
import { ConversionFunnelChart } from './charts/ConversionFunnelChart';
import { RevenueAnalyticsChart } from './charts/RevenueAnalyticsChart';
import { SourcePerformanceChart } from './charts/SourcePerformanceChart';
import { CohortAnalysisChart } from './charts/CohortAnalysisChart';
import { GeographicAnalyticsChart } from './charts/GeographicAnalyticsChart';
import { DeviceAnalyticsChart } from './charts/DeviceAnalyticsChart';
import { TimeSeriesChart } from './charts/TimeSeriesChart';
import { AttributionModelChart } from './charts/AttributionModelChart';

interface AdvancedAnalyticsProps {
  dateRange?: DateRange;
  selectedSources?: string[];
  selectedStatus?: string;
}

export const AdvancedAnalytics = ({ 
  dateRange, 
  selectedSources, 
  selectedStatus 
}: AdvancedAnalyticsProps) => {
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('overview');
  const [selectedMetric, setSelectedMetric] = useState('conversions');
  const [comparisonPeriod, setComparisonPeriod] = useState('previous_period');
  const [granularity, setGranularity] = useState('daily');

  // Hooks para dados
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useTrackingMetrics(dateRange);
  const { data: leadData, isLoading: leadLoading } = useLeadTracking({ dateRange });
  const { data: campaignData, isLoading: campaignLoading } = useCampaignPerformance(dateRange);
  const { data: trafficSources, isLoading: sourcesLoading } = useTrafficSources();

  const isLoading = metricsLoading || leadLoading || campaignLoading || sourcesLoading;

  // Métricas calculadas
  const calculatedMetrics = useMemo(() => {
    if (!metrics || !leadData) return null;

    const totalLeads = leadData.length;
    const convertedLeads = leadData.filter(lead => lead.converted).length;
    const totalRevenue = leadData.reduce((sum, lead) => sum + (lead.conversion_value || 0), 0);
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
    const avgRevenuePerLead = totalLeads > 0 ? totalRevenue / totalLeads : 0;
    const avgRevenuePerConversion = convertedLeads > 0 ? totalRevenue / convertedLeads : 0;

    // Análise por fonte
    const sourceAnalysis = trafficSources?.map(source => {
      const sourceLeads = leadData.filter(lead => lead.traffic_source_id === source.id);
      const sourceConversions = sourceLeads.filter(lead => lead.converted);
      const sourceRevenue = sourceLeads.reduce((sum, lead) => sum + (lead.conversion_value || 0), 0);
      
      return {
        ...source,
        leads: sourceLeads.length,
        conversions: sourceConversions.length,
        revenue: sourceRevenue,
        conversionRate: sourceLeads.length > 0 ? (sourceConversions.length / sourceLeads.length) * 100 : 0,
        costPerLead: 0, // Será calculado com dados de custo
        roas: 0 // Return on Ad Spend
      };
    }) || [];

    // Análise temporal
    const timeAnalysis = leadData.reduce((acc, lead) => {
      const date = new Date(lead.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { leads: 0, conversions: 0, revenue: 0 };
      }
      acc[date].leads++;
      if (lead.converted) {
        acc[date].conversions++;
        acc[date].revenue += lead.conversion_value || 0;
      }
      return acc;
    }, {} as Record<string, { leads: number; conversions: number; revenue: number }>);

    return {
      totalLeads,
      convertedLeads,
      totalRevenue,
      conversionRate,
      avgRevenuePerLead,
      avgRevenuePerConversion,
      sourceAnalysis,
      timeAnalysis
    };
  }, [metrics, leadData, trafficSources]);

  // Função para exportar dados
  const handleExport = (format: 'csv' | 'pdf' | 'excel') => {
    // Implementar exportação
    console.log(`Exportando dados em formato ${format}`);
  };

  if (metricsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar dados de análise: {metricsError.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controles de Análise */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Análises Avançadas
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={granularity} onValueChange={setGranularity}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Por Hora</SelectItem>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
              <Select value={comparisonPeriod} onValueChange={setComparisonPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="previous_period">Período Anterior</SelectItem>
                  <SelectItem value="previous_year">Ano Anterior</SelectItem>
                  <SelectItem value="no_comparison">Sem Comparação</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* KPIs Principais */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <DashboardCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Taxa de Conversão</p>
                  <p className="text-3xl font-bold">{calculatedMetrics?.conversionRate.toFixed(2)}%</p>
                  <div className="flex items-center mt-1">
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">+2.4%</span>
                    <span className="text-sm text-muted-foreground ml-1">vs período anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Receita por Lead</p>
                  <p className="text-3xl font-bold">{formatCurrency(calculatedMetrics?.avgRevenuePerLead || 0)}</p>
                  <div className="flex items-center mt-1">
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">+8.1%</span>
                    <span className="text-sm text-muted-foreground ml-1">vs período anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tempo Médio p/ Conversão</p>
                  <p className="text-3xl font-bold">3.2d</p>
                  <div className="flex items-center mt-1">
                    <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">-12%</span>
                    <span className="text-sm text-muted-foreground ml-1">vs período anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ROAS Médio</p>
                  <p className="text-3xl font-bold">4.2x</p>
                  <div className="flex items-center mt-1">
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">+15.3%</span>
                    <span className="text-sm text-muted-foreground ml-1">vs período anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Abas de Análise */}
      <Tabs value={activeAnalyticsTab} onValueChange={setActiveAnalyticsTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="funnel" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Funil
          </TabsTrigger>
          <TabsTrigger value="sources" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Fontes
          </TabsTrigger>
          <TabsTrigger value="cohort" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Coorte
          </TabsTrigger>
          <TabsTrigger value="attribution" className="flex items-center gap-2">
            <LineChart className="w-4 h-4" />
            Atribuição
          </TabsTrigger>
          <TabsTrigger value="geographic" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Geografia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TimeSeriesChart 
              data={calculatedMetrics?.timeAnalysis || {}} 
              metric={selectedMetric}
              granularity={granularity}
            />
            <RevenueAnalyticsChart 
              data={calculatedMetrics?.timeAnalysis || {}} 
              comparisonPeriod={comparisonPeriod}
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DeviceAnalyticsChart data={leadData || []} />
            <SourcePerformanceChart data={calculatedMetrics?.sourceAnalysis || []} />
          </div>
        </TabsContent>

        <TabsContent value="funnel" className="space-y-6">
          <ConversionFunnelChart 
            data={leadData || []} 
            dateRange={dateRange}
            selectedSources={selectedSources}
          />
        </TabsContent>

        <TabsContent value="sources" className="space-y-6">
          <SourcePerformanceChart 
            data={calculatedMetrics?.sourceAnalysis || []} 
            detailed={true}
          />
        </TabsContent>

        <TabsContent value="cohort" className="space-y-6">
          <CohortAnalysisChart 
            data={leadData || []} 
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="attribution" className="space-y-6">
          <AttributionModelChart 
            data={leadData || []} 
            model="last_click"
          />
        </TabsContent>

        <TabsContent value="geographic" className="space-y-6">
          <GeographicAnalyticsChart 
            data={leadData || []} 
            metric="conversions"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};