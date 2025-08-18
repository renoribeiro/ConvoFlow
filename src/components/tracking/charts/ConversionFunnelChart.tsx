import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FunnelChart, Funnel, LabelList, ResponsiveContainer, Cell } from 'recharts';
import { TrendingDownIcon, TrendingUpIcon, InfoIcon, ZoomInIcon, Users, Target, DollarSign, CheckCircle } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { LeadTracking } from '@/hooks/useTracking';
import { formatCurrency } from '@/lib/utils';

interface ConversionFunnelChartProps {
  data: LeadTracking[];
  dateRange?: DateRange;
  selectedSources?: string[];
  showDetails?: boolean;
  enableDrilldown?: boolean;
  className?: string;
}

interface FunnelStage {
  name: string;
  value: number;
  count: number;
  percentage: number;
  dropoffRate: number;
  icon: React.ReactNode;
  color: string;
  previousValue?: number;
  description?: string;
  conversionRate?: number;
  averageTime?: number;
  bottleneck?: boolean;
}

export const ConversionFunnelChart = ({ 
  data, 
  dateRange, 
  selectedSources,
  showDetails = false,
  enableDrilldown = false,
  className
}: ConversionFunnelChartProps) => {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'absolute' | 'percentage'>('absolute');
  const funnelData = useMemo(() => {
    // Filtrar dados baseado nos filtros selecionados
    let filteredData = data;
    
    if (selectedSources && selectedSources.length > 0) {
      filteredData = data.filter(lead => 
        selectedSources.includes(lead.traffic_source_id || '')
      );
    }

    // Calcular estágios do funil
    const totalVisitors = filteredData.length * 3; // Estimativa: 3 visitantes por lead
    const totalLeads = filteredData.length;
    const qualifiedLeads = filteredData.filter(lead => 
      lead.utm_campaign && lead.utm_campaign !== ''
    ).length;
    const opportunities = filteredData.filter(lead => 
      lead.conversion_value && lead.conversion_value > 0
    ).length;
    const conversions = filteredData.filter(lead => lead.converted).length;

    const stages: FunnelStage[] = [
      {
        name: 'Visitantes',
        count: totalVisitors,
        percentage: 100,
        dropoffRate: 0,
        icon: <Users className="w-5 h-5" />,
        color: 'bg-blue-500'
      },
      {
        name: 'Leads Gerados',
        count: totalLeads,
        percentage: totalVisitors > 0 ? (totalLeads / totalVisitors) * 100 : 0,
        dropoffRate: totalVisitors > 0 ? ((totalVisitors - totalLeads) / totalVisitors) * 100 : 0,
        icon: <Target className="w-5 h-5" />,
        color: 'bg-green-500'
      },
      {
        name: 'Leads Qualificados',
        count: qualifiedLeads,
        percentage: totalLeads > 0 ? (qualifiedLeads / totalLeads) * 100 : 0,
        dropoffRate: totalLeads > 0 ? ((totalLeads - qualifiedLeads) / totalLeads) * 100 : 0,
        icon: <CheckCircle className="w-5 h-5" />,
        color: 'bg-yellow-500'
      },
      {
        name: 'Oportunidades',
        count: opportunities,
        percentage: qualifiedLeads > 0 ? (opportunities / qualifiedLeads) * 100 : 0,
        dropoffRate: qualifiedLeads > 0 ? ((qualifiedLeads - opportunities) / qualifiedLeads) * 100 : 0,
        icon: <DollarSign className="w-5 h-5" />,
        color: 'bg-orange-500'
      },
      {
        name: 'Conversões',
        count: conversions,
        percentage: opportunities > 0 ? (conversions / opportunities) * 100 : 0,
        dropoffRate: opportunities > 0 ? ((opportunities - conversions) / opportunities) * 100 : 0,
        icon: <CheckCircle className="w-5 h-5" />,
        color: 'bg-purple-500'
      }
    ];

    return stages;
  }, [data, selectedSources]);

  const totalRevenue = data
    .filter(lead => lead.converted)
    .reduce((sum, lead) => sum + (lead.conversion_value || 0), 0);

  const avgDealSize = funnelData[4].count > 0 ? totalRevenue / funnelData[4].count : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Funil de Conversão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Métricas Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {funnelData[1]?.percentage.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">Taxa de Geração de Leads</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {funnelData[4]?.percentage.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">Taxa de Conversão Final</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(avgDealSize)}
                </p>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
              </div>
            </div>

            {/* Funil Visual */}
            <div className="space-y-4">
              {funnelData.map((stage, index) => {
                const maxWidth = 100;
                const stageWidth = index === 0 ? maxWidth : (stage.count / funnelData[0].count) * maxWidth;
                
                return (
                  <div key={stage.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${stage.color} flex items-center justify-center text-white`}>
                          {stage.icon}
                        </div>
                        <div>
                          <h4 className="font-semibold">{stage.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {stage.count.toLocaleString()} ({stage.percentage.toFixed(1)}%)
                          </p>
                        </div>
                      </div>
                      
                      {index > 0 && (
                        <div className="flex items-center gap-2">
                          <TrendingDown className="w-4 h-4 text-red-500" />
                          <Badge variant="destructive" className="text-xs">
                            -{stage.dropoffRate.toFixed(1)}% dropoff
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    {/* Barra do Funil */}
                    <div className="relative">
                      <div className="w-full h-8 bg-muted rounded-lg overflow-hidden">
                        <div 
                          className={`h-full ${stage.color} transition-all duration-500 ease-out`}
                          style={{ width: `${stageWidth}%` }}
                        />
                      </div>
                      
                      {/* Linha de conexão para o próximo estágio */}
                      {index < funnelData.length - 1 && (
                        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                          <div className="w-px h-4 bg-border" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Insights e Recomendações */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Insights e Oportunidades</h4>
              <div className="space-y-2 text-sm text-blue-800">
                {funnelData[1]?.dropoffRate > 70 && (
                  <p>• Alta taxa de abandono entre visitantes e leads. Considere otimizar landing pages.</p>
                )}
                {funnelData[2]?.dropoffRate > 50 && (
                  <p>• Muitos leads não qualificados. Revise critérios de qualificação.</p>
                )}
                {funnelData[4]?.percentage < 20 && (
                  <p>• Taxa de conversão baixa. Analise processo de vendas e follow-up.</p>
                )}
                {avgDealSize < 1000 && (
                  <p>• Ticket médio baixo. Considere estratégias de upsell.</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};