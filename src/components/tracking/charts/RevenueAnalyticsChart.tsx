import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart,
  Legend
} from 'recharts';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Target,
  Users
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface RevenueAnalyticsChartProps {
  data: Record<string, { leads: number; conversions: number; revenue: number }>;
  comparisonPeriod: string;
}

interface ChartDataPoint {
  date: string;
  revenue: number;
  conversions: number;
  leads: number;
  conversionRate: number;
  revenuePerLead: number;
  previousRevenue?: number;
  previousConversions?: number;
  revenueGrowth?: number;
}

export const RevenueAnalyticsChart = ({ 
  data, 
  comparisonPeriod 
}: RevenueAnalyticsChartProps) => {
  const chartData = useMemo(() => {
    const sortedDates = Object.keys(data).sort();
    
    return sortedDates.map((date, index) => {
      const dayData = data[date];
      const conversionRate = dayData.leads > 0 ? (dayData.conversions / dayData.leads) * 100 : 0;
      const revenuePerLead = dayData.leads > 0 ? dayData.revenue / dayData.leads : 0;
      
      // Calcular dados do período anterior para comparação
      let previousRevenue = 0;
      let previousConversions = 0;
      let revenueGrowth = 0;
      
      if (comparisonPeriod === 'previous_period' && index >= 7) {
        const previousDate = sortedDates[index - 7];
        if (previousDate && data[previousDate]) {
          previousRevenue = data[previousDate].revenue;
          previousConversions = data[previousDate].conversions;
          revenueGrowth = previousRevenue > 0 
            ? ((dayData.revenue - previousRevenue) / previousRevenue) * 100 
            : 0;
        }
      }
      
      return {
        date: new Date(date).toLocaleDateString('pt-BR', { 
          month: 'short', 
          day: 'numeric' 
        }),
        revenue: dayData.revenue,
        conversions: dayData.conversions,
        leads: dayData.leads,
        conversionRate,
        revenuePerLead,
        previousRevenue,
        previousConversions,
        revenueGrowth
      };
    });
  }, [data, comparisonPeriod]);

  const totalRevenue = chartData.reduce((sum, item) => sum + item.revenue, 0);
  const totalConversions = chartData.reduce((sum, item) => sum + item.conversions, 0);
  const avgRevenuePerDay = chartData.length > 0 ? totalRevenue / chartData.length : 0;
  const avgConversionRate = chartData.length > 0 
    ? chartData.reduce((sum, item) => sum + item.conversionRate, 0) / chartData.length 
    : 0;

  // Calcular crescimento geral
  const firstWeekRevenue = chartData.slice(0, 7).reduce((sum, item) => sum + item.revenue, 0);
  const lastWeekRevenue = chartData.slice(-7).reduce((sum, item) => sum + item.revenue, 0);
  const overallGrowth = firstWeekRevenue > 0 
    ? ((lastWeekRevenue - firstWeekRevenue) / firstWeekRevenue) * 100 
    : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
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
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Análise de Receita
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={overallGrowth >= 0 ? "default" : "destructive"}>
                {overallGrowth >= 0 ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {Math.abs(overallGrowth).toFixed(1)}%
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Métricas Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-sm text-muted-foreground">Receita Total</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(avgRevenuePerDay)}
              </p>
              <p className="text-sm text-muted-foreground">Receita Média/Dia</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {totalConversions.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Total Conversões</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {avgConversionRate.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">Taxa Conversão Média</p>
            </div>
          </div>

          {/* Gráfico de Receita */}
          <div className="h-80 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  name="Receita"
                />
                {comparisonPeriod === 'previous_period' && (
                  <Area
                    type="monotone"
                    dataKey="previousRevenue"
                    stroke="#94a3b8"
                    fill="#94a3b8"
                    fillOpacity={0.05}
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    name="Receita Período Anterior"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de Conversões */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar 
                  dataKey="conversions" 
                  fill="#10b981" 
                  name="Conversões"
                  radius={[2, 2, 0, 0]}
                />
                <Bar 
                  dataKey="leads" 
                  fill="#f59e0b" 
                  name="Leads"
                  radius={[2, 2, 0, 0]}
                  opacity={0.7}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Análise de Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Performance por Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {chartData.slice(-7).map((item, index) => {
              const isPositiveGrowth = (item.revenueGrowth || 0) >= 0;
              return (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 bg-blue-500 rounded" />
                    <div>
                      <p className="font-medium">{item.date}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.conversions} conversões de {item.leads} leads
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(item.revenue)}</p>
                    {comparisonPeriod === 'previous_period' && item.revenueGrowth !== undefined && (
                      <div className="flex items-center gap-1">
                        {isPositiveGrowth ? (
                          <TrendingUp className="w-3 h-3 text-green-500" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-500" />
                        )}
                        <span className={`text-xs ${
                          isPositiveGrowth ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {Math.abs(item.revenueGrowth).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};