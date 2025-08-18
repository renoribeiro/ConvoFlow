import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { 
  Globe, 
  TrendingUp, 
  TrendingDown, 
  Users,
  Target,
  DollarSign,
  ExternalLink
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface SourceAnalyticsChartProps {
  data: Record<string, {
    leads: number;
    conversions: number;
    revenue: number;
    sources: Record<string, {
      leads: number;
      conversions: number;
      revenue: number;
      cost?: number;
    }>;
  }>;
}

interface SourceMetrics {
  name: string;
  leads: number;
  conversions: number;
  revenue: number;
  cost: number;
  conversionRate: number;
  costPerLead: number;
  costPerConversion: number;
  roi: number;
  revenuePerLead: number;
  color: string;
}

const SOURCE_COLORS = {
  'Google Ads': '#4285f4',
  'Facebook Ads': '#1877f2',
  'Instagram': '#e4405f',
  'LinkedIn': '#0077b5',
  'Organic Search': '#34a853',
  'Direct': '#ea4335',
  'Email': '#fbbc04',
  'Referral': '#9aa0a6',
  'YouTube': '#ff0000',
  'Twitter': '#1da1f2',
  'TikTok': '#000000',
  'WhatsApp': '#25d366',
  'Other': '#6c757d'
};

export const SourceAnalyticsChart = ({ data }: SourceAnalyticsChartProps) => {
  const sourceMetrics = useMemo(() => {
    const aggregatedSources: Record<string, {
      leads: number;
      conversions: number;
      revenue: number;
      cost: number;
    }> = {};

    // Agregar dados de todas as datas
    Object.values(data).forEach(dayData => {
      Object.entries(dayData.sources).forEach(([sourceName, sourceData]) => {
        if (!aggregatedSources[sourceName]) {
          aggregatedSources[sourceName] = {
            leads: 0,
            conversions: 0,
            revenue: 0,
            cost: 0
          };
        }
        
        aggregatedSources[sourceName].leads += sourceData.leads;
        aggregatedSources[sourceName].conversions += sourceData.conversions;
        aggregatedSources[sourceName].revenue += sourceData.revenue;
        aggregatedSources[sourceName].cost += sourceData.cost || 0;
      });
    });

    // Calcular métricas para cada fonte
    return Object.entries(aggregatedSources)
      .map(([name, data]) => {
        const conversionRate = data.leads > 0 ? (data.conversions / data.leads) * 100 : 0;
        const costPerLead = data.leads > 0 ? data.cost / data.leads : 0;
        const costPerConversion = data.conversions > 0 ? data.cost / data.conversions : 0;
        const roi = data.cost > 0 ? ((data.revenue - data.cost) / data.cost) * 100 : 0;
        const revenuePerLead = data.leads > 0 ? data.revenue / data.leads : 0;
        
        return {
          name,
          leads: data.leads,
          conversions: data.conversions,
          revenue: data.revenue,
          cost: data.cost,
          conversionRate,
          costPerLead,
          costPerConversion,
          roi,
          revenuePerLead,
          color: SOURCE_COLORS[name as keyof typeof SOURCE_COLORS] || SOURCE_COLORS.Other
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const totalLeads = sourceMetrics.reduce((sum, source) => sum + source.leads, 0);
  const totalRevenue = sourceMetrics.reduce((sum, source) => sum + source.revenue, 0);
  const totalCost = sourceMetrics.reduce((sum, source) => sum + source.cost, 0);
  const overallROI = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold">{data.name}</p>
          <p className="text-sm">Leads: {data.leads.toLocaleString()}</p>
          <p className="text-sm">Conversões: {data.conversions.toLocaleString()}</p>
          <p className="text-sm">Receita: {formatCurrency(data.revenue)}</p>
          <p className="text-sm">Taxa Conversão: {data.conversionRate.toFixed(1)}%</p>
          {data.cost > 0 && (
            <>
              <p className="text-sm">Custo: {formatCurrency(data.cost)}</p>
              <p className="text-sm">ROI: {data.roi.toFixed(1)}%</p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Resumo Geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Análise de Fontes de Tráfego
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {sourceMetrics.length}
              </p>
              <p className="text-sm text-muted-foreground">Fontes Ativas</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {totalLeads.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Total de Leads</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-sm text-muted-foreground">Receita Total</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-1">
                {overallROI >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <p className={`text-2xl font-bold ${
                  overallROI >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {overallROI.toFixed(1)}%
                </p>
              </div>
              <p className="text-sm text-muted-foreground">ROI Geral</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição de Leads por Fonte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Distribuição de Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceMetrics}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="leads"
                  >
                    {sourceMetrics.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Performance por Fonte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Performance por Fonte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceMetrics.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="conversionRate" 
                    fill="#10b981" 
                    name="Taxa de Conversão (%)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detalhamento por Fonte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Detalhamento por Fonte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sourceMetrics.map((source, index) => {
              const leadPercentage = totalLeads > 0 ? (source.leads / totalLeads) * 100 : 0;
              const revenuePercentage = totalRevenue > 0 ? (source.revenue / totalRevenue) * 100 : 0;
              
              return (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded" 
                        style={{ backgroundColor: source.color }}
                      />
                      <h3 className="font-semibold">{source.name}</h3>
                      <Badge variant={source.roi >= 0 ? "default" : "destructive"}>
                        ROI: {source.roi.toFixed(1)}%
                      </Badge>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Leads</p>
                      <p className="font-semibold">{source.leads.toLocaleString()}</p>
                      <Progress value={leadPercentage} className="h-1 mt-1" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Conversões</p>
                      <p className="font-semibold">{source.conversions.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.conversionRate.toFixed(1)}% taxa
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Receita</p>
                      <p className="font-semibold">{formatCurrency(source.revenue)}</p>
                      <Progress value={revenuePercentage} className="h-1 mt-1" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Custo por Lead</p>
                      <p className="font-semibold">
                        {source.cost > 0 ? formatCurrency(source.costPerLead) : 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(source.revenuePerLead)} receita/lead
                      </p>
                    </div>
                  </div>
                  
                  {source.cost > 0 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Investimento: {formatCurrency(source.cost)}</span>
                      <span>Custo por Conversão: {formatCurrency(source.costPerConversion)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};