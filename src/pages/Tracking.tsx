
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrafficSourceConfig } from '@/components/tracking/TrafficSourceConfig';
import { TrackingDashboard } from '@/components/tracking/TrackingDashboard';
import { TrackingFilters } from '@/components/tracking/TrackingFilters';
import { PredictiveAnalytics } from '@/components/tracking/PredictiveAnalytics';
import { Settings, Plus, TrendingUp, BarChart3, Target, Zap } from 'lucide-react';

export default function Tracking() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rastreamento de Leads"
        description="Configure e monitore suas fontes de tráfego para otimizar a geração de leads"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Rastreamento' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </Button>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Nova Fonte
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="sources" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Fontes
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Análises
          </TabsTrigger>
          <TabsTrigger value="predictions" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Previsões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <TrackingFilters />
          <TrackingDashboard />
        </TabsContent>

        <TabsContent value="sources" className="space-y-6">
          <TrafficSourceConfig />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Análise Detalhada</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Análises avançadas de performance por fonte de tráfego em desenvolvimento...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-6">
          <PredictiveAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
