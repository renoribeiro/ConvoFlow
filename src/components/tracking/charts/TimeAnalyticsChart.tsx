import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Clock,
  Users,
  Target,
  Activity,
  BarChart3
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface TimeAnalyticsChartProps {
  data: Record<string, { leads: number; conversions: number; revenue: number }>;
  granularity: 'hour' | 'day' | 'week' | 'month';
  comparisonPeriod: string;
}

interface TimeDataPoint {
  period: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  previousLeads?: number;
  previousConversions?: number;
  previousRevenue?: number;
  leadsGrowth?: number;
  conversionsGrowth?: number;
  revenueGrowth?: number;
  dayOfWeek?: string;
  hour?: number;
}

const DAYS_OF_WEEK = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

const MONTHS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const TimeAnalyticsChart = ({ 
  data, 
  granularity, 
  comparisonPeriod 
}: TimeAnalyticsChartProps) => {
  const [selectedMetric, setSelectedMetric] = useState<'leads' | 'conversions' | 'revenue'>('leads');
  const [viewType, setViewType] = useState<'trend' | 'comparison' | 'heatmap'>('trend');

  const processedData = useMemo(() => {
    const sortedDates = Object.keys(data).sort();
    
    return sortedDates.map((dateStr, index) => {
      const date = new Date(dateStr);
      const dayData = data[dateStr];
      const conversionRate = dayData.leads > 0 ? (dayData.conversions / dayData.leads) * 100 : 0;
      
      let period = '';
      let dayOfWeek = '';
      let hour = 0;
      
      switch (granularity) {
        case 'hour':
          period = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          hour = date.getHours();
          break;
        case 'day':
          period = date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
          dayOfWeek = DAYS_OF_WEEK[date.getDay()];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          period = `Sem ${Math.ceil(date.getDate() / 7)}`;
          break;
        case 'month':
          period = MONTHS[date.getMonth()];
          break;
      }
      
      // Calcular dados do período anterior para comparação
      let previousLeads = 0;
      let previousConversions = 0;
      let previousRevenue = 0;
      let leadsGrowth = 0;
      let conversionsGrowth = 0;
      let revenueGrowth = 0;
      
      if (comparisonPeriod === 'previous_period') {
        let comparisonIndex = -1;
        
        switch (granularity) {
          case 'day':
            comparisonIndex = index - 7; // Semana anterior
            break;
          case 'week':
            comparisonIndex = index - 4; // Mês anterior
            break;
          case 'month':
            comparisonIndex = index - 12; // Ano anterior
            break;
          case 'hour':
            comparisonIndex = index - 24; // Dia anterior
            break;
        }
        
        if (comparisonIndex >= 0 && sortedDates[comparisonIndex]) {
          const previousData = data[sortedDates[comparisonIndex]];
          previousLeads = previousData.leads;
          previousConversions = previousData.conversions;
          previousRevenue = previousData.revenue;
          
          leadsGrowth = previousLeads > 0 
            ? ((dayData.leads - previousLeads) / previousLeads) * 100 
            : 0;
          conversionsGrowth = previousConversions > 0 
            ? ((dayData.conversions - previousConversions) / previousConversions) * 100 
            : 0;
          revenueGrowth = previousRevenue > 0 
            ? ((dayData.revenue - previousRevenue) / previousRevenue) * 100 
            : 0;
        }
      }
      
      return {
        period,
        leads: dayData.leads,
        conversions: dayData.conversions,
        revenue: dayData.revenue,
        conversionRate,
        previousLeads,
        previousConversions,
        previousRevenue,
        leadsGrowth,
        conversionsGrowth,
        revenueGrowth,
        dayOfWeek,
        hour
      };
    });
  }, [data, granularity, comparisonPeriod]);

  // Análise por dia da semana
  const weekdayAnalysis = useMemo(() => {
    if (granularity !== 'day') return [];
    
    const weekdayData: Record<string, { leads: number; conversions: number; revenue: number; count: number }> = {};
    
    processedData.forEach(item => {
      if (!weekdayData[item.dayOfWeek]) {
        weekdayData[item.dayOfWeek] = { leads: 0, conversions: 0, revenue: 0, count: 0 };
      }
      weekdayData[item.dayOfWeek].leads += item.leads;
      weekdayData[item.dayOfWeek].conversions += item.conversions;
      weekdayData[item.dayOfWeek].revenue += item.revenue;
      weekdayData[item.dayOfWeek].count += 1;
    });
    
    return DAYS_OF_WEEK.map(day => {
      const data = weekdayData[day] || { leads: 0, conversions: 0, revenue: 0, count: 1 };
      return {
        day,
        avgLeads: data.count > 0 ? data.leads / data.count : 0,
        avgConversions: data.count > 0 ? data.conversions / data.count : 0,
        avgRevenue: data.count > 0 ? data.revenue / data.count : 0,
        conversionRate: data.leads > 0 ? (data.conversions / data.leads) * 100 : 0
      };
    });
  }, [processedData, granularity]);

  // Análise por hora do dia
  const hourlyAnalysis = useMemo(() => {
    if (granularity !== 'hour') return [];
    
    const hourlyData: Record<number, { leads: number; conversions: number; revenue: number; count: number }> = {};
    
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = { leads: 0, conversions: 0, revenue: 0, count: 0 };
    }
    
    processedData.forEach(item => {
      hourlyData[item.hour].leads += item.leads;
      hourlyData[item.hour].conversions += item.conversions;
      hourlyData[item.hour].revenue += item.revenue;
      hourlyData[item.hour].count += 1;
    });
    
    return Array.from({ length: 24 }, (_, hour) => {
      const data = hourlyData[hour];
      return {
        hour: `${hour.toString().padStart(2, '0')}:00`,
        avgLeads: data.count > 0 ? data.leads / data.count : 0,
        avgConversions: data.count > 0 ? data.conversions / data.count : 0,
        avgRevenue: data.count > 0 ? data.revenue / data.count : 0,
        conversionRate: data.leads > 0 ? (data.conversions / data.leads) * 100 : 0
      };
    });
  }, [processedData, granularity]);

  const totalLeads = processedData.reduce((sum, item) => sum + item.leads, 0);
  const totalConversions = processedData.reduce((sum, item) => sum + item.conversions, 0);
  const totalRevenue = processedData.reduce((sum, item) => sum + item.revenue, 0);
  const avgConversionRate = processedData.length > 0 
    ? processedData.reduce((sum, item) => sum + item.conversionRate, 0) / processedData.length 
    : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.name.includes('Revenue') || entry.name.includes('Receita') 
                ? formatCurrency(entry.value) 
                : entry.value.toLocaleString()}
            </p>
          ))}
          {data.conversionRate !== undefined && (
            <p className="text-sm text-muted-foreground">
              Taxa de Conversão: {data.conversionRate.toFixed(1)}%
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Controles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Análise Temporal
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="conversions">Conversões</SelectItem>
                  <SelectItem value="revenue">Receita</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={viewType} onValueChange={(value: any) => setViewType(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trend">Tendência</SelectItem>
                  <SelectItem value="comparison">Comparação</SelectItem>
                  <SelectItem value="heatmap">Heatmap</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {totalLeads.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Total Leads</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {totalConversions.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Total Conversões</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-sm text-muted-foreground">Receita Total</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {avgConversionRate.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">Taxa Conversão Média</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico Principal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Tendência de {selectedMetric === 'leads' ? 'Leads' : selectedMetric === 'conversions' ? 'Conversões' : 'Receita'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {viewType === 'trend' ? (
                <AreaChart data={processedData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="period" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    tickFormatter={(value) => 
                      selectedMetric === 'revenue' ? formatCurrency(value) : value.toLocaleString()
                    }
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey={selectedMetric}
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    name={selectedMetric === 'leads' ? 'Leads' : selectedMetric === 'conversions' ? 'Conversões' : 'Receita'}
                  />
                  {comparisonPeriod === 'previous_period' && (
                    <Area
                      type="monotone"
                      dataKey={`previous${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)}`}
                      stroke="#94a3b8"
                      fill="#94a3b8"
                      fillOpacity={0.05}
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      name={`${selectedMetric === 'leads' ? 'Leads' : selectedMetric === 'conversions' ? 'Conversões' : 'Receita'} Período Anterior`}
                    />
                  )}
                </AreaChart>
              ) : (
                <BarChart data={processedData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="period" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    tickFormatter={(value) => 
                      selectedMetric === 'revenue' ? formatCurrency(value) : value.toLocaleString()
                    }
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar 
                    dataKey={selectedMetric} 
                    fill="#3b82f6" 
                    name={selectedMetric === 'leads' ? 'Leads' : selectedMetric === 'conversions' ? 'Conversões' : 'Receita'}
                    radius={[2, 2, 0, 0]}
                  />
                  {comparisonPeriod === 'previous_period' && (
                    <Bar 
                      dataKey={`previous${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)}`}
                      fill="#94a3b8" 
                      name={`${selectedMetric === 'leads' ? 'Leads' : selectedMetric === 'conversions' ? 'Conversões' : 'Receita'} Período Anterior`}
                      radius={[2, 2, 0, 0]}
                      opacity={0.7}
                    />
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Análise por Dia da Semana */}
      {granularity === 'day' && weekdayAnalysis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Performance por Dia da Semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="avgLeads" fill="#3b82f6" name="Média de Leads" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="avgConversions" fill="#10b981" name="Média de Conversões" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Análise por Hora do Dia */}
      {granularity === 'hour' && hourlyAnalysis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Performance por Hora do Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="avgLeads" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="Média de Leads"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgConversions" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    name="Média de Conversões"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};