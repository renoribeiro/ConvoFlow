
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { CampaignsList } from '@/components/campaigns/CampaignsList';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';
import { CampaignReportsModal } from '@/components/campaigns/CampaignReportsModal';
import { Plus, Send, Clock, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

export default function Campaigns() {
  const [showWizard, setShowWizard] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);

  const stats = {
    totalCampaigns: 8,
    activeCampaigns: 3,
    messagesSent: 1247,
    successRate: 87.5
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas de Disparo"
        description="Crie e gerencie campanhas de mensagens em massa para seus contatos"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Campanhas' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowReports(true)}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Relatórios
            </Button>
            <Button size="sm" onClick={() => setShowWizard(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Campanha
            </Button>
          </div>
        }
      />

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Campanhas</p>
                <p className="text-2xl font-bold">{stats.totalCampaigns}</p>
              </div>
              <Send className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Campanhas Ativas</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeCampaigns}</p>
              </div>
              <Clock className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Mensagens Enviadas</p>
                <p className="text-2xl font-bold">{stats.messagesSent.toLocaleString()}</p>
              </div>
              <Send className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taxa de Sucesso</p>
                <p className="text-2xl font-bold text-purple-600">{stats.successRate}%</p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {showWizard ? (
        <CampaignWizard 
          onClose={() => setShowWizard(false)}
          campaignId={selectedCampaign}
        />
      ) : (
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList>
            <TabsTrigger value="active">Campanhas Ativas</TabsTrigger>
            <TabsTrigger value="scheduled">Agendadas</TabsTrigger>
            <TabsTrigger value="completed">Concluídas</TabsTrigger>
            <TabsTrigger value="drafts">Rascunhos</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <CampaignsList 
              status="active"
              onEdit={(id) => {
                setSelectedCampaign(id);
                setShowWizard(true);
              }}
            />
          </TabsContent>

          <TabsContent value="scheduled">
            <CampaignsList 
              status="scheduled"
              onEdit={(id) => {
                setSelectedCampaign(id);
                setShowWizard(true);
              }}
            />
          </TabsContent>

          <TabsContent value="completed">
            <CampaignsList 
              status="completed"
              onEdit={(id) => {
                setSelectedCampaign(id);
                setShowWizard(true);
              }}
            />
          </TabsContent>

          <TabsContent value="drafts">
            <CampaignsList 
              status="draft"
              onEdit={(id) => {
                setSelectedCampaign(id);
                setShowWizard(true);
              }}
            />
          </TabsContent>
        </Tabs>
      )}

      <CampaignReportsModal 
        isOpen={showReports} 
        onClose={() => setShowReports(false)} 
      />
    </div>
  );
}
