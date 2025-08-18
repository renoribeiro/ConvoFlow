
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Users, CheckCircle, XCircle, Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface CampaignReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CampaignReportsModal = ({ isOpen, onClose }: CampaignReportsModalProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState('30days');
  const [selectedStatus, setSelectedStatus] = useState('all');
  
  const metrics = {
    totalSent: 2847,
    delivered: 2654,
    opened: 1923,
    responded: 234
  };

  const campaignPerformance = [
    { name: 'Black Friday 2024', sent: 1200, delivered: 1150, opened: 850, responded: 89, status: 'completed' },
    { name: 'Lançamento Produto X', sent: 800, delivered: 785, opened: 456, responded: 67, status: 'active' },
    { name: 'Follow-up Carrinho', sent: 450, delivered: 432, opened: 298, responded: 45, status: 'completed' },
    { name: 'Pesquisa Satisfação', sent: 397, delivered: 287, opened: 319, responded: 33, status: 'paused' }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Ativa</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Concluída</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800">Pausada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const calculateRate = (value: number, total: number) => {
    return total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  };

  const handleExport = () => {
    try {
      // Criar dados CSV
      const csvData = [
        ['Campanha', 'Status', 'Enviadas', 'Entregues', 'Taxa Entrega (%)', 'Abertas', 'Taxa Abertura (%)', 'Respostas', 'Taxa Conversão (%)'],
        ...campaignPerformance.map(campaign => [
          campaign.name,
          campaign.status === 'active' ? 'Ativa' : 
          campaign.status === 'completed' ? 'Concluída' : 
          campaign.status === 'paused' ? 'Pausada' : campaign.status,
          campaign.sent.toString(),
          campaign.delivered.toString(),
          calculateRate(campaign.delivered, campaign.sent),
          campaign.opened.toString(),
          calculateRate(campaign.opened, campaign.delivered),
          campaign.responded.toString(),
          calculateRate(campaign.responded, campaign.sent)
        ])
      ];

      // Converter para CSV
      const csvContent = csvData.map(row => 
        row.map(field => `"${field}"`).join(',')
      ).join('\n');

      // Criar e baixar arquivo
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `relatorio-campanhas-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
      toast.error('Erro ao exportar relatório. Tente novamente.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatórios de Campanhas</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Filtros */}
          <div className="flex items-center gap-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="90days">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Campanhas</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="completed">Concluídas</SelectItem>
                <SelectItem value="draft">Rascunhos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>

          {/* Métricas principais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Enviadas</p>
                    <p className="text-2xl font-bold">{metrics.totalSent.toLocaleString()}</p>
                  </div>
                  <Send className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Entregues</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.delivered.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {calculateRate(metrics.delivered, metrics.totalSent)}% taxa
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Abertas</p>
                    <p className="text-2xl font-bold text-purple-600">{metrics.opened.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {calculateRate(metrics.opened, metrics.delivered)}% taxa
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Respostas</p>
                    <p className="text-2xl font-bold text-orange-600">{metrics.responded}</p>
                    <p className="text-xs text-muted-foreground">
                      {calculateRate(metrics.responded, metrics.opened)}% taxa
                    </p>
                  </div>
                  <XCircle className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance por campanha */}
          <Card>
            <CardHeader>
              <CardTitle>Performance por Campanha</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2">Campanha</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-right py-3 px-2">Enviadas</th>
                      <th className="text-right py-3 px-2">Entregues</th>
                      <th className="text-right py-3 px-2">Abertas</th>
                      <th className="text-right py-3 px-2">Respostas</th>
                      <th className="text-right py-3 px-2">Taxa Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignPerformance.map((campaign, index) => (
                      <tr key={index} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-2 font-medium">{campaign.name}</td>
                        <td className="py-3 px-2">{getStatusBadge(campaign.status)}</td>
                        <td className="py-3 px-2 text-right">{campaign.sent.toLocaleString()}</td>
                        <td className="py-3 px-2 text-right">
                          {campaign.delivered.toLocaleString()}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({calculateRate(campaign.delivered, campaign.sent)}%)
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          {campaign.opened.toLocaleString()}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({calculateRate(campaign.opened, campaign.delivered)}%)
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          {campaign.responded}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({calculateRate(campaign.responded, campaign.opened)}%)
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-semibold">
                          {calculateRate(campaign.responded, campaign.sent)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
