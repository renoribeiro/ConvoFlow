import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine
} from 'recharts';
import { 
  TrendingUpIcon, 
  TrendingDownIcon, 
  BrainIcon, 
  TargetIcon, 
  AlertTriangleIcon,
  InfoIcon,
  ZapIcon,
  CalendarIcon,
  DollarSignIcon
} from 'lucide-react';

interface PredictiveData {
  date: string;
  actual?: number;
  predicted: number;
  confidence: number;
  upperBound: number;
  lowerBound: number;
  trend: 'up' | 'down' | 'stable';
}

interface PredictiveAnalyticsChartProps {
  data: PredictiveData[];
  forecastPeriod: number;
  metric?: 'leads' | 'conversions' | 'revenue';
  showConfidenceInterval?: boolean;
}

interface Insight {
  type: 'opportunity' | 'risk' | 'trend' | 'anomaly';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  action?: string;
}

// Gerar dados de exemplo para demonstração
const generateSampleData = (forecastPeriod: number): PredictiveData[] => {
  const data: PredictiveData[] = [];
  const today = new Date();
  
  // Dados históricos (últimos 30 dias)
  for (let i = -30; i < 0; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    const baseValue = 100 + Math.sin(i / 7) * 20; // Padrão semanal
    const noise = (Math.random() - 0.5) * 10;
    const actual = Math.max(0, baseValue + noise);
    
    data.push({
      date: date.toISOString().split('T')[0],
      actual,
      predicted: actual,
      confidence: 95,
      upperBound: actual * 1.1,
      lowerBound: actual * 0.9,
      trend: 'stable'
    });
  }
  
  // Dados de previsão
  for (let i = 0; i < forecastPeriod; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    const baseValue = 100 + Math.sin(i / 7) * 20;
    const trendFactor = 1 + (i / forecastPeriod) * 0.2; // Crescimento gradual
    const predicted = baseValue * trendFactor;
    
    const confidence = Math.max(60, 95 - (i / forecastPeriod) * 35); // Confiança diminui com o tempo
    const margin = predicted * (0.1 + (i / forecastPeriod) * 0.2);
    
    data.push({
      date: date.toISOString().split('T')[0],
      predicted,
      confidence,
      upperBound: predicted + margin,
      lowerBound: Math.max(0, predicted - margin),
      trend: trendFactor > 1.1 ? 'up' : trendFactor < 0.9 ? 'down' : 'stable'
    });
  }
  
  return data;
};

const generateInsights = (data: PredictiveData[]): Insight[] => {
  const insights: Insight[] = [];
  
  // Análise de tendência
  const futureData = data.filter(d => !d.actual);
  const avgGrowth = futureData.reduce((sum, d, i) => {
    if (i === 0) return sum;
    return sum + ((d.predicted - futureData[i-1].predicted) / futureData[i-1].predicted);
  }, 0) / (futureData.length - 1);
  
  if (avgGrowth > 0.05) {
    insights.push({
      type: 'opportunity',
      title: 'Crescimento Previsto',
      description: `Previsão de crescimento de ${(avgGrowth * 100).toFixed(1)}% no período`,
      impact: 'high',
      confidence: 85,
      action: 'Aumentar investimento'
    });
  }
  
  // Análise de confiança
  const lowConfidencePoints = futureData.filter(d => d.confidence < 70).length;
  if (lowConfidencePoints > futureData.length * 0.3) {
    insights.push({
      type: 'risk',
      title: 'Baixa Confiança na Previsão',
      description: `${lowConfidencePoints} pontos com confiança abaixo de 70%`,
      impact: 'medium',
      confidence: 90,
      action: 'Coletar mais dados'
    });
  }
  
  // Detecção de anomalias
  const historicalData = data.filter(d => d.actual);
  const avgHistorical = historicalData.reduce((sum, d) => sum + d.actual!, 0) / historicalData.length;
  const maxPredicted = Math.max(...futureData.map(d => d.predicted));
  
  if (maxPredicted > avgHistorical * 1.5) {
    insights.push({
      type: 'anomaly',
      title: 'Pico Anômalo Detectado',
      description: `Valor previsto ${((maxPredicted / avgHistorical - 1) * 100).toFixed(0)}% acima da média histórica`,
      impact: 'high',
      confidence: 75,
      action: 'Investigar causas'
    });
  }
  
  return insights;
};

export function PredictiveAnalyticsChart({ 
  data = generateSampleData(30), 
  forecastPeriod = 30,
  metric = 'leads',
  showConfidenceInterval = true 
}: PredictiveAnalyticsChartProps) {
  const [selectedView, setSelectedView] = useState<'forecast' | 'trends' | 'scenarios'>('forecast');
  const [selectedScenario, setSelectedScenario] = useState<'optimistic' | 'realistic' | 'pessimistic'>('realistic');

  const processedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      dateFormatted: new Date(item.date).toLocaleDateString('pt-BR', { 
        month: 'short', 
        day: 'numeric' 
      })
    }));
  }, [data]);

  const historicalData = processedData.filter(d => d.actual !== undefined);
  const forecastData = processedData.filter(d => d.actual === undefined);
  const insights = useMemo(() => generateInsights(data), [data]);

  const formatValue = (value: number) => {
    if (metric === 'revenue') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0
      }).format(value);
    }
    return Math.round(value).toLocaleString();
  };

  const getMetricLabel = () => {
    switch (metric) {
      case 'leads': return 'Leads';
      case 'conversions': return 'Conversões';
      case 'revenue': return 'Receita';
      default: return 'Valor';
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {data.actual !== undefined && (
            <p className="text-blue-600">
              Real: {formatValue(data.actual)}
            </p>
          )}
          <p className="text-green-600">
            Previsto: {formatValue(data.predicted)}
          </p>
          <p className="text-gray-500 text-sm">
            Confiança: {data.confidence.toFixed(0)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const renderForecastChart = () => (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={processedData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis 
            dataKey="dateFormatted" 
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            tickLine={false}
            tickFormatter={formatValue}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          
          {/* Área de confiança */}
          {showConfidenceInterval && (
            <Area
              dataKey="upperBound"
              stroke="none"
              fill="#10b981"
              fillOpacity={0.1}
              connectNulls={false}
            />
          )}
          
          {/* Linha de dados históricos */}
          <Line
            dataKey="actual"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
            connectNulls={false}
            name="Dados Reais"
          />
          
          {/* Linha de previsão */}
          <Line
            dataKey="predicted"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#10b981', strokeWidth: 2, r: 3 }}
            connectNulls={false}
            name="Previsão"
          />
          
          {/* Linha de separação entre histórico e previsão */}
          <ReferenceLine 
            x={historicalData[historicalData.length - 1]?.dateFormatted} 
            stroke="#6b7280" 
            strokeDasharray="2 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderTrendsChart = () => {
    const trendData = processedData.map((item, index) => {
      const prevItem = processedData[index - 1];
      const value = item.actual || item.predicted;
      const prevValue = prevItem ? (prevItem.actual || prevItem.predicted) : value;
      const change = prevValue ? ((value - prevValue) / prevValue) * 100 : 0;
      
      return {
        ...item,
        change,
        value
      };
    });

    return (
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="dateFormatted" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${value.toFixed(1)}%`} />
            <Tooltip 
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Variação']}
              labelFormatter={(label) => `Data: ${label}`}
            />
            <Bar 
              dataKey="change" 
              fill={(entry: any) => entry.change >= 0 ? '#10b981' : '#ef4444'}
              name="Variação %"
            />
            <ReferenceLine y={0} stroke="#6b7280" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderScenariosChart = () => {
    const scenarioData = forecastData.map(item => ({
      ...item,
      optimistic: item.upperBound,
      realistic: item.predicted,
      pessimistic: item.lowerBound
    }));

    return (
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={scenarioData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="dateFormatted" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            <Area
              dataKey="optimistic"
              stackId="1"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.3}
              name="Cenário Otimista"
            />
            <Area
              dataKey="realistic"
              stackId="2"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.5}
              name="Cenário Realista"
            />
            <Area
              dataKey="pessimistic"
              stackId="3"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.3}
              name="Cenário Pessimista"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'opportunity': return <TrendingUpIcon className="w-4 h-4 text-green-600" />;
      case 'risk': return <AlertTriangleIcon className="w-4 h-4 text-red-600" />;
      case 'trend': return <TrendingUpIcon className="w-4 h-4 text-blue-600" />;
      case 'anomaly': return <ZapIcon className="w-4 h-4 text-yellow-600" />;
      default: return <InfoIcon className="w-4 h-4 text-gray-600" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BrainIcon className="w-5 h-5" />
                Análise Preditiva - {getMetricLabel()}
              </CardTitle>
              <CardDescription>
                Previsões baseadas em machine learning para os próximos {forecastPeriod} dias
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={selectedView} onValueChange={(value: any) => setSelectedView(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forecast">Previsão</SelectItem>
                  <SelectItem value="trends">Tendências</SelectItem>
                  <SelectItem value="scenarios">Cenários</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs value={selectedView} onValueChange={setSelectedView}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="forecast">Previsão</TabsTrigger>
              <TabsTrigger value="trends">Tendências</TabsTrigger>
              <TabsTrigger value="scenarios">Cenários</TabsTrigger>
            </TabsList>
            
            <TabsContent value="forecast" className="space-y-4">
              {renderForecastChart()}
            </TabsContent>
            
            <TabsContent value="trends" className="space-y-4">
              {renderTrendsChart()}
            </TabsContent>
            
            <TabsContent value="scenarios" className="space-y-4">
              {renderScenariosChart()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Insights e Recomendações */}
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ZapIcon className="w-5 h-5" />
              Insights e Recomendações
            </CardTitle>
            <CardDescription>
              Análises automáticas baseadas nos dados preditivos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insights.map((insight, index) => (
                <Alert key={index}>
                  <div className="flex items-start space-x-3">
                    {getInsightIcon(insight.type)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{insight.title}</h4>
                        <div className="flex items-center gap-2">
                          <Badge className={getImpactColor(insight.impact)}>
                            {insight.impact === 'high' ? 'Alto' : insight.impact === 'medium' ? 'Médio' : 'Baixo'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {insight.confidence}% confiança
                          </span>
                        </div>
                      </div>
                      <AlertDescription className="mb-2">
                        {insight.description}
                      </AlertDescription>
                      {insight.action && (
                        <Button variant="outline" size="sm">
                          {insight.action}
                        </Button>
                      )}
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Métricas de Precisão */}
      <Card>
        <CardHeader>
          <CardTitle>Precisão do Modelo</CardTitle>
          <CardDescription>
            Métricas de performance do algoritmo preditivo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Precisão Geral</span>
                <span className="text-sm text-muted-foreground">87%</span>
              </div>
              <Progress value={87} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Confiança Média</span>
                <span className="text-sm text-muted-foreground">82%</span>
              </div>
              <Progress value={82} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Erro Médio</span>
                <span className="text-sm text-muted-foreground">±12%</span>
              </div>
              <Progress value={88} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}