
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportTemplates } from '@/components/reports/ReportTemplates';
import { ScheduleList } from '@/components/reports/ScheduleList';
import { DeliveryLog } from '@/components/reports/DeliveryLog';
import { ReportBuilder } from '@/components/reports/ReportBuilder';
import { FileText, Calendar, Send, Plus, Settings } from 'lucide-react';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('templates');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Gere relatórios detalhados e configure envios automáticos por email e WhatsApp"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Relatórios' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </Button>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Novo Relatório
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="builder" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Criar
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Agendamentos
          </TabsTrigger>
          <TabsTrigger value="delivery" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Entregas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-6">
          <ReportTemplates />
        </TabsContent>

        <TabsContent value="builder" className="space-y-6">
          <ReportBuilder />
        </TabsContent>

        <TabsContent value="schedule" className="space-y-6">
          <ScheduleList />
        </TabsContent>

        <TabsContent value="delivery" className="space-y-6">
          <DeliveryLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
