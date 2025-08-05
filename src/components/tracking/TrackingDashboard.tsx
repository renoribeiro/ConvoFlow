
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrafficChart } from './TrafficChart';
import { ConversionFunnel } from './ConversionFunnel';
import { SourceBreakdown } from './SourceBreakdown';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Target, 
  DollarSign, 
  Eye,
  Globe,
  Facebook,
  Instagram,
  Search
} from 'lucide-react';

const mockData = {
  totalLeads: 435,
  totalConversions: 89,
  totalRevenue: 45678,
  conversionRate: 20.5,
  trends: {
    leads: { value: 12.5, isPositive: true },
    conversions: { value: 8.3, isPositive: true },
    revenue: { value: 15.2, isPositive: true },
    rate: { value: 2.1, isPositive: false }
  }
};

const sourceData = [
  { name: 'Facebook Ads', leads: 124, conversions: 28, rate: 22.6, icon: Facebook, color: 'bg-blue-500' },
  { name: 'Instagram', leads: 98, conversions: 19, rate: 19.4, icon: Instagram, color: 'bg-purple-500' },
  { name: 'Google Ads', leads: 87, conversions: 21, rate: 24.1, icon: Search, color: 'bg-green-500' },
  { name: 'Site Orgânico', leads: 76, conversions: 12, rate: 15.8, icon: Globe, color: 'bg-orange-500' },
  { name: 'Tráfego Direto', legs: 50, conversions: 9, rate: 18.0, icon: Users, color: 'bg-gray-500' }
];

export const TrackingDashboard = () => {
  return (
    <div className="space-y-6">
      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Leads</p>
                <p className="text-3xl font-bold">{mockData.totalLeads}</p>
                <div className="flex items-center mt-1">
                  {mockData.trends.leads.isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  )}
                  <span className={`text-sm ${mockData.trends.leads.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {mockData.trends.leads.value}%
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversões</p>
                <p className="text-3xl font-bold">{mockData.totalConversions}</p>
                <div className="flex items-center mt-1">
                  {mockData.trends.conversions.isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  )}
                  <span className={`text-sm ${mockData.trends.conversions.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {mockData.trends.conversions.value}%
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
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
                <p className="text-sm font-medium text-muted-foreground">Receita Gerada</p>
                <p className="text-3xl font-bold">R$ {mockData.totalRevenue.toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  {mockData.trends.revenue.isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  )}
                  <span className={`text-sm ${mockData.trends.revenue.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {mockData.trends.revenue.value}%
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taxa de Conversão</p>
                <p className="text-3xl font-bold">{mockData.conversionRate}%</p>
                <div className="flex items-center mt-1">
                  {mockData.trends.rate.isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  )}
                  <span className={`text-sm ${mockData.trends.rate.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {mockData.trends.rate.value}%
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Eye className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos e Análises */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrafficChart />
        <ConversionFunnel />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SourceBreakdown />
        </div>
        
        {/* Performance por Fonte */}
        <Card>
          <CardHeader>
            <CardTitle>Performance por Fonte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sourceData.map((source, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 ${source.color} rounded-lg flex items-center justify-center`}>
                      <source.icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{source.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.leads} leads • {source.conversions} conversões
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">
                      {source.rate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
