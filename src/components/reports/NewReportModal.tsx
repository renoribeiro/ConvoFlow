import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FileText, BarChart3, Users, MessageSquare, Calendar, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface NewReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReportData {
  name: string;
  description: string;
  type: string;
  frequency: string;
  format: string;
  metrics: string[];
  filters: {
    dateRange: string;
    campaigns: string[];
    contacts: string[];
    status: string[];
  };
  delivery: {
    email: boolean;
    whatsapp: boolean;
    recipients: string[];
  };
}

export const NewReportModal = ({ isOpen, onClose }: NewReportModalProps) => {
  const [reportData, setReportData] = useState<ReportData>({
    name: '',
    description: '',
    type: '',
    frequency: 'manual',
    format: 'pdf',
    metrics: [],
    filters: {
      dateRange: '30days',
      campaigns: [],
      contacts: [],
      status: []
    },
    delivery: {
      email: false,
      whatsapp: false,
      recipients: []
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const reportTypes = [
    { value: 'campaigns', label: 'Campanhas', icon: MessageSquare, description: 'Performance de campanhas de marketing' },
    { value: 'conversations', label: 'Conversas', icon: Users, description: 'Análise de conversas e atendimentos' },
    { value: 'funnel', label: 'Funil de Vendas', icon: BarChart3, description: 'Progresso e conversões no funil' },
    { value: 'general', label: 'Geral', icon: FileText, description: 'Relatório geral do sistema' }
  ];

  const availableMetrics = {
    campaigns: [
      { id: 'sent', label: 'Mensagens Enviadas' },
      { id: 'delivered', label: 'Mensagens Entregues' },
      { id: 'opened', label: 'Mensagens Abertas' },
      { id: 'responded', label: 'Respostas Recebidas' },
      { id: 'conversion_rate', label: 'Taxa de Conversão' }
    ],
    conversations: [
      { id: 'total_conversations', label: 'Total de Conversas' },
      { id: 'active_conversations', label: 'Conversas Ativas' },
      { id: 'response_time', label: 'Tempo de Resposta' },
      { id: 'satisfaction', label: 'Satisfação do Cliente' },
      { id: 'resolution_rate', label: 'Taxa de Resolução' }
    ],
    funnel: [
      { id: 'leads_by_stage', label: 'Leads por Estágio' },
      { id: 'conversion_by_stage', label: 'Conversão por Estágio' },
      { id: 'average_time', label: 'Tempo Médio no Estágio' },
      { id: 'revenue', label: 'Receita Gerada' },
      { id: 'lost_opportunities', label: 'Oportunidades Perdidas' }
    ],
    general: [
      { id: 'overview', label: 'Visão Geral' },
      { id: 'growth', label: 'Crescimento' },
      { id: 'performance', label: 'Performance' },
      { id: 'trends', label: 'Tendências' }
    ]
  };

  const frequencies = [
    { value: 'manual', label: 'Manual' },
    { value: 'daily', label: 'Diário' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'quarterly', label: 'Trimestral' }
  ];

  const formats = [
    { value: 'pdf', label: 'PDF' },
    { value: 'excel', label: 'Excel' },
    { value: 'csv', label: 'CSV' },
    { value: 'html', label: 'HTML' }
  ];

  const handleMetricToggle = (metricId: string) => {
    setReportData(prev => ({
      ...prev,
      metrics: prev.metrics.includes(metricId)
        ? prev.metrics.filter(id => id !== metricId)
        : [...prev.metrics, metricId]
    }));
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!reportData.name || !reportData.type || reportData.metrics.length === 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsLoading(true);

    try {
      // Simular criação do relatório
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log('Novo relatório criado:', reportData);
      toast.success('Relatório criado com sucesso!');
      
      // Reset form
      setReportData({
        name: '',
        description: '',
        type: '',
        frequency: 'manual',
        format: 'pdf',
        metrics: [],
        filters: {
          dateRange: '30days',
          campaigns: [],
          contacts: [],
          status: []
        },
        delivery: {
          email: false,
          whatsapp: false,
          recipients: []
        }
      });
      setCurrentStep(1);
      onClose();
    } catch (error) {
      console.error('Erro ao criar relatório:', error);
      toast.error('Erro ao criar relatório. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setCurrentStep(1);
      onClose();
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return reportData.name && reportData.type;
      case 2:
        return reportData.metrics.length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Novo Relatório
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isLoading}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep >= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    currentStep > step ? 'bg-primary' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Etapa 1: Informações Básicas */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Informações Básicas</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome do Relatório *</Label>
                    <Input
                      id="name"
                      value={reportData.name}
                      onChange={(e) => setReportData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Relatório Mensal de Campanhas"
                      disabled={isLoading}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={reportData.description}
                      onChange={(e) => setReportData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descreva o objetivo deste relatório..."
                      rows={3}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Tipo de Relatório *</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {reportTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <Card 
                        key={type.value}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          reportData.type === type.value ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setReportData(prev => ({ ...prev, type: type.value, metrics: [] }))}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Icon className="h-6 w-6 text-primary mt-1" />
                            <div>
                              <h4 className="font-medium">{type.label}</h4>
                              <p className="text-sm text-muted-foreground">{type.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Frequência</Label>
                  <Select value={reportData.frequency} onValueChange={(value) => setReportData(prev => ({ ...prev, frequency: value }))} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencies.map((freq) => (
                        <SelectItem key={freq.value} value={freq.value}>
                          {freq.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Formato</Label>
                  <Select value={reportData.format} onValueChange={(value) => setReportData(prev => ({ ...prev, format: value }))} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formats.map((format) => (
                        <SelectItem key={format.value} value={format.value}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Etapa 2: Métricas */}
          {currentStep === 2 && reportData.type && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Selecionar Métricas</h3>
                <p className="text-muted-foreground mb-4">Escolha as métricas que deseja incluir no relatório</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableMetrics[reportData.type as keyof typeof availableMetrics]?.map((metric) => (
                    <Card key={metric.id} className="cursor-pointer hover:shadow-sm" onClick={() => handleMetricToggle(metric.id)}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={reportData.metrics.includes(metric.id)}
                            onChange={() => handleMetricToggle(metric.id)}
                          />
                          <Label className="cursor-pointer">{metric.label}</Label>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {reportData.metrics.length > 0 && (
                  <div className="mt-4">
                    <Label className="text-sm font-medium">Métricas Selecionadas:</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {reportData.metrics.map((metricId) => {
                        const metric = availableMetrics[reportData.type as keyof typeof availableMetrics]?.find(m => m.id === metricId);
                        return (
                          <Badge key={metricId} variant="secondary">
                            {metric?.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Etapa 3: Configurações de Entrega */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Configurações de Entrega</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="email"
                      checked={reportData.delivery.email}
                      onCheckedChange={(checked) => setReportData(prev => ({
                        ...prev,
                        delivery: { ...prev.delivery, email: checked as boolean }
                      }))}
                    />
                    <Label htmlFor="email">Enviar por Email</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="whatsapp"
                      checked={reportData.delivery.whatsapp}
                      onCheckedChange={(checked) => setReportData(prev => ({
                        ...prev,
                        delivery: { ...prev.delivery, whatsapp: checked as boolean }
                      }))}
                    />
                    <Label htmlFor="whatsapp">Enviar por WhatsApp</Label>
                  </div>
                  
                  {(reportData.delivery.email || reportData.delivery.whatsapp) && (
                    <div>
                      <Label htmlFor="recipients">Destinatários</Label>
                      <Input
                        id="recipients"
                        placeholder="Digite emails ou números separados por vírgula"
                        disabled={isLoading}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Resumo do Relatório</h4>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome:</span>
                      <span className="font-medium">{reportData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tipo:</span>
                      <span className="font-medium">
                        {reportTypes.find(t => t.value === reportData.type)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frequência:</span>
                      <span className="font-medium">
                        {frequencies.find(f => f.value === reportData.frequency)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Formato:</span>
                      <span className="font-medium">
                        {formats.find(f => f.value === reportData.format)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Métricas:</span>
                      <span className="font-medium">{reportData.metrics.length} selecionadas</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Botões de Navegação */}
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={handlePrevious}
              disabled={currentStep === 1 || isLoading}
            >
              Anterior
            </Button>
            
            <div className="flex gap-2">
              {currentStep < 3 ? (
                <Button 
                  onClick={handleNext}
                  disabled={!canProceed() || isLoading}
                >
                  Próximo
                </Button>
              ) : (
                <Button 
                  onClick={handleSubmit}
                  disabled={!canProceed() || isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Criar Relatório
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};