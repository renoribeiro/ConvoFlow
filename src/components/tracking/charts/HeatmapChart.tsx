import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CalendarIcon, ClockIcon, TrendingUpIcon, TrendingDownIcon, InfoIcon } from 'lucide-react';
import { ResponsiveContainer, Cell } from 'recharts';

interface HeatmapData {
  hour: number;
  day: string;
  value: number;
  leads: number;
  conversions: number;
  conversionRate: number;
}

interface HeatmapChartProps {
  data: HeatmapData[];
  type: 'hourly' | 'daily' | 'weekly';
  metric?: 'leads' | 'conversions' | 'conversionRate';
  showTooltips?: boolean;
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const COLORS = {
  low: '#f0f9ff',
  medium: '#7dd3fc',
  high: '#0284c7',
  highest: '#0c4a6e'
};

// Dados de exemplo para demonstração
const generateSampleData = (): HeatmapData[] => {
  const data: HeatmapData[] = [];
  
  DAYS.forEach((day, dayIndex) => {
    HOURS.forEach(hour => {
      // Simular padrões realistas de atividade
      let baseValue = 10;
      
      // Horário comercial tem mais atividade
      if (hour >= 9 && hour <= 18) {
        baseValue *= 2;
      }
      
      // Fins de semana têm menos atividade
      if (dayIndex === 0 || dayIndex === 6) {
        baseValue *= 0.5;
      }
      
      // Adicionar variação aleatória
      const variation = Math.random() * 0.5 + 0.75;
      const leads = Math.floor(baseValue * variation);
      const conversions = Math.floor(leads * (0.1 + Math.random() * 0.2));
      
      data.push({
        hour,
        day,
        value: leads,
        leads,
        conversions,
        conversionRate: leads > 0 ? (conversions / leads) * 100 : 0
      });
    });
  });
  
  return data;
};

export function HeatmapChart({ 
  data = generateSampleData(), 
  type = 'hourly', 
  metric = 'leads',
  showTooltips = true 
}: HeatmapChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<'leads' | 'conversions' | 'conversionRate'>(metric);
  const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: number } | null>(null);

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Agrupar dados por dia e hora
    const grouped = data.reduce((acc, item) => {
      const key = `${item.day}-${item.hour}`;
      acc[key] = item;
      return acc;
    }, {} as Record<string, HeatmapData>);
    
    return grouped;
  }, [data]);

  const getIntensityColor = (value: number, maxValue: number) => {
    const intensity = value / maxValue;
    
    if (intensity === 0) return '#f8fafc';
    if (intensity <= 0.25) return COLORS.low;
    if (intensity <= 0.5) return COLORS.medium;
    if (intensity <= 0.75) return COLORS.high;
    return COLORS.highest;
  };

  const maxValue = useMemo(() => {
    return Math.max(...data.map(item => item[selectedMetric] || 0));
  }, [data, selectedMetric]);

  const formatValue = (value: number) => {
    if (selectedMetric === 'conversionRate') {
      return `${value.toFixed(1)}%`;
    }
    return value.toLocaleString();
  };

  const getCellData = (day: string, hour: number) => {
    const key = `${day}-${hour}`;
    return processedData[key];
  };

  const renderHeatmapGrid = () => {
    return (
      <div className="space-y-1">
        {/* Header com horas */}
        <div className="grid grid-cols-25 gap-1 mb-2">
          <div className="w-8"></div> {/* Espaço para labels dos dias */}
          {HOURS.map(hour => (
            <div key={hour} className="text-xs text-center text-muted-foreground w-6">
              {hour}
            </div>
          ))}
        </div>
        
        {/* Grid do heatmap */}
        {DAYS.map((day, dayIndex) => (
          <div key={day} className="grid grid-cols-25 gap-1">
            <div className="text-xs text-right text-muted-foreground w-8 flex items-center justify-end pr-2">
              {day}
            </div>
            {HOURS.map(hour => {
              const cellData = getCellData(day, hour);
              const value = cellData?.[selectedMetric] || 0;
              const color = getIntensityColor(value, maxValue);
              
              return (
                <TooltipProvider key={`${day}-${hour}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="w-6 h-6 rounded-sm cursor-pointer transition-all duration-200 hover:scale-110 hover:shadow-md border border-gray-200"
                        style={{ backgroundColor: color }}
                        onMouseEnter={() => setHoveredCell({ day, hour })}
                        onMouseLeave={() => setHoveredCell(null)}
                      />
                    </TooltipTrigger>
                    {showTooltips && cellData && (
                      <TooltipContent>
                        <div className="space-y-1">
                          <p className="font-medium">{day} - {hour}:00</p>
                          <p className="text-sm">Leads: {cellData.leads}</p>
                          <p className="text-sm">Conversões: {cellData.conversions}</p>
                          <p className="text-sm">Taxa: {cellData.conversionRate.toFixed(1)}%</p>
                        </div>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderLegend = () => {
    const steps = 5;
    const stepValue = maxValue / steps;
    
    return (
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">Menos</span>
        <div className="flex items-center space-x-1">
          {Array.from({ length: steps }, (_, i) => {
            const value = stepValue * (i + 1);
            const color = getIntensityColor(value, maxValue);
            
            return (
              <div
                key={i}
                className="w-4 h-4 rounded-sm border border-gray-200"
                style={{ backgroundColor: color }}
                title={formatValue(value)}
              />
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">Mais</span>
      </div>
    );
  };

  const getInsights = () => {
    if (!data || data.length === 0) return [];
    
    const insights = [];
    
    // Encontrar horário de pico
    const peakHour = data.reduce((max, item) => 
      item[selectedMetric] > max[selectedMetric] ? item : max
    );
    
    insights.push({
      type: 'peak',
      title: 'Horário de Pico',
      description: `${peakHour.day} às ${peakHour.hour}:00 com ${formatValue(peakHour[selectedMetric])}`
    });
    
    // Calcular média por dia da semana
    const dayAverages = DAYS.map(day => {
      const dayData = data.filter(item => item.day === day);
      const avg = dayData.reduce((sum, item) => sum + item[selectedMetric], 0) / dayData.length;
      return { day, avg };
    });
    
    const bestDay = dayAverages.reduce((max, item) => item.avg > max.avg ? item : max);
    insights.push({
      type: 'best_day',
      title: 'Melhor Dia',
      description: `${bestDay.day} com média de ${formatValue(bestDay.avg)}`
    });
    
    return insights;
  };

  const insights = getInsights();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Heatmap de Atividade
            </CardTitle>
            <CardDescription>
              Visualização da atividade por dia da semana e hora do dia
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leads">Leads</SelectItem>
                <SelectItem value="conversions">Conversões</SelectItem>
                <SelectItem value="conversionRate">Taxa (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          {renderHeatmapGrid()}
          {renderLegend()}
        </div>
        
        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <InfoIcon className="w-4 h-4" />
              Insights
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.map((insight, index) => (
                <div key={index} className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="text-xs text-muted-foreground">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Estatísticas resumidas */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-lg font-bold">
              {formatValue(data.reduce((sum, item) => sum + item[selectedMetric], 0) / data.length)}
            </div>
            <div className="text-xs text-muted-foreground">Média</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">
              {formatValue(Math.max(...data.map(item => item[selectedMetric])))}
            </div>
            <div className="text-xs text-muted-foreground">Máximo</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">
              {formatValue(Math.min(...data.map(item => item[selectedMetric])))}
            </div>
            <div className="text-xs text-muted-foreground">Mínimo</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}