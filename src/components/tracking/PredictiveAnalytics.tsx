
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TrendingUp, TrendingDown, AlertTriangle, Target, Brain, Zap, Info } from 'lucide-react';

const predictionData = [
  { month: 'Jan', actual: 435, predicted: 445 },
  { month: 'Fev', actual: 478, predicted: 485 },
  { month: 'Mar', actual: 521, predicted: 530 },
  { month: 'Abr', predicted: 575 },
  { month: 'Mai', predicted: 620 },
  { month: 'Jun', predicted: 665 },
];

const seasonalityData = [
  { day: 'Dom', leads: 45 },
  { day: 'Seg', leads: 78 },
  { day: 'Ter', leads: 82 },
  { day: 'Qua', leads: 85 },
  { day: 'Qui', leads: 91 },
  { day: 'Sex', leads: 74 },
  { day: 'Sáb', leads: 52 },
];

const insights = [
  {
    type: 'opportunity',
    title: 'Oportunidade de Crescimento',
    description: 'Facebook Ads tem potencial para 30% mais conversões com otimização de horários',
    impact: 'Alto',
    icon: TrendingUp,
    color: 'text-green-600'
  },
  {
    type: 'warning',
    title: 'Queda na Performance',
    description: 'Instagram apresentou queda de 15% nas conversões na última semana',
    impact: 'Médio',
    icon: TrendingDown,
    color: 'text-orange-600'
  },
  {
    type: 'alert',
    title: 'Anomalia Detectada',
    description: 'Pico anormal de tráfego direto pode indicar problema de rastreamento',
    impact: 'Alto',
    icon: AlertTriangle,
    color: 'text-red-600'
  },
  {
    type: 'recommendation',
    title: 'Recomendação Estratégica',
    description: 'Investir mais em Google Ads durante terças e quartas-feiras para melhor ROI',
    impact: 'Alto',
    icon: Target,
    color: 'text-blue-600'
  }
];

export const PredictiveAnalytics = () => {
  return (
    <div className="space-y-6">
      <Alert className="bg-blue-50/50 border-blue-200">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-800">Recurso em Desenvolvimento (Beta)</AlertTitle>
        <AlertDescription className="text-blue-700">
          As análises preditivas abaixo utilizam dados demonstrativos para ilustrar os recursos de Machine Learning focados em previsão de demanda e otimização, parte integrante da próxima grande atualização do sistema.
        </AlertDescription>
      </Alert>

      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Previsão Próximo Mês</p>
                <p className="text-2xl font-bold">665 leads</p>
                <p className="text-sm text-green-600">+27% vs atual</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Precisão do Modelo</p>
                <p className="text-2xl font-bold">94.2%</p>
                <Progress value={94.2} className="w-full mt-2" />
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Insights Gerados</p>
                <p className="text-2xl font-bold">12</p>
                <p className="text-sm text-purple-600">4 críticos</p>
              </div>
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Previsão de Leads */}
        <Card>
          <CardHeader>
            <CardTitle>Previsão de Leads - Próximos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={predictionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Real"
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Previsto"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sazonalidade */}
        <Card>
          <CardHeader>
            <CardTitle>Padrão Semanal de Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={seasonalityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="leads"
                  fill="hsl(var(--primary))"
                  name="Leads Médios"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Insights e Recomendações */}
      <Card>
        <CardHeader>
          <CardTitle>Insights e Recomendações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, index) => (
              <div key={index} className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <insight.icon className={`w-5 h-5 ${insight.color}`} />
                    <h4 className="font-medium">{insight.title}</h4>
                  </div>
                  <Badge variant={
                    insight.impact === 'Alto' ? 'destructive' :
                      insight.impact === 'Médio' ? 'default' : 'secondary'
                  }>
                    {insight.impact}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {insight.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
