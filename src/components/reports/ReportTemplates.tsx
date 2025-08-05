
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, BarChart3, TrendingUp, DollarSign, Users, Download, Eye, Settings } from 'lucide-react';

const templates = [
  {
    id: '1',
    name: 'Relatório de Performance Geral',
    description: 'Visão completa das métricas de leads, conversões e receita',
    icon: BarChart3,
    category: 'Geral',
    frequency: 'Semanal',
    lastGenerated: '2 horas atrás',
    metrics: ['Leads', 'Conversões', 'ROI', 'Taxa de Conversão'],
    color: 'bg-blue-500'
  },
  {
    id: '2',
    name: 'Análise de Fontes de Tráfego',
    description: 'Detalhamento da performance por canal de aquisição',
    icon: TrendingUp,
    category: 'Tráfego',
    frequency: 'Diário',
    lastGenerated: '1 dia atrás',
    metrics: ['Fontes', 'Volume', 'Qualidade', 'Custo por Lead'],
    color: 'bg-green-500'
  },
  {
    id: '3',
    name: 'Relatório Financeiro',
    description: 'Análise de receita, custos e rentabilidade por fonte',
    icon: DollarSign,
    category: 'Financeiro',
    frequency: 'Mensal',
    lastGenerated: '3 dias atrás',
    metrics: ['Receita', 'CAC', 'LTV', 'ROI'],
    color: 'bg-purple-500'
  },
  {
    id: '4',
    name: 'Funil de Conversão',
    description: 'Análise detalhada do funil de vendas e pontos de perda',
    icon: Users,
    category: 'Conversão',
    frequency: 'Semanal',
    lastGenerated: '5 horas atrás',
    metrics: ['Etapas', 'Taxa de Conversão', 'Tempo Médio', 'Perdas'],
    color: 'bg-orange-500'
  },
  {
    id: '5',
    name: 'Relatório Executivo',
    description: 'Resumo executivo com principais KPIs e insights',
    icon: FileText,
    category: 'Executivo',
    frequency: 'Mensal',
    lastGenerated: '1 semana atrás',
    metrics: ['KPIs', 'Tendências', 'Insights', 'Recomendações'],
    color: 'bg-red-500'
  },
  {
    id: '6',
    name: 'Performance de Campanhas',
    description: 'Análise específica de campanhas pagas e orgânicas',
    icon: TrendingUp,
    category: 'Campanhas',
    frequency: 'Diário',
    lastGenerated: '6 horas atrás',
    metrics: ['CPC', 'CTR', 'Conversões', 'ROAS'],
    color: 'bg-indigo-500'
  }
];

export const ReportTemplates = () => {
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  
  const categories = ['Todos', 'Geral', 'Tráfego', 'Financeiro', 'Conversão', 'Executivo', 'Campanhas'];
  
  const filteredTemplates = selectedCategory === 'Todos' 
    ? templates 
    : templates.filter(t => t.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(category => (
          <Button
            key={category}
            variant={selectedCategory === category ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <Card key={template.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${template.color} rounded-lg flex items-center justify-center`}>
                    <template.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <Badge variant="outline" className="mt-1">
                      {template.category}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {template.description}
              </p>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frequência:</span>
                  <span className="font-medium">{template.frequency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Último relatório:</span>
                  <span className="font-medium">{template.lastGenerated}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Métricas incluídas:</p>
                <div className="flex flex-wrap gap-1">
                  {template.metrics.map((metric, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {metric}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  Visualizar
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
