import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { X, Users, MessageSquare, Send, Calendar, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CampaignWizardProps {
  onClose: () => void;
  campaignId?: string | null;
}

interface CampaignData {
  name: string;
  description: string;
  message: string;
  whatsapp_instance_id: string;
  target_type: 'all' | 'segment' | 'funnel_stage';
  funnel_stage_id?: string;
  scheduled_at?: string;
  status: 'draft' | 'scheduled' | 'active';
}

export const CampaignWizard = ({ onClose, campaignId }: CampaignWizardProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignData, setCampaignData] = useState<CampaignData>({
    name: '',
    description: '',
    message: '',
    whatsapp_instance_id: '',
    target_type: 'all',
    status: 'draft'
  });
  
  const { toast } = useToast();
  
  // Query para buscar instâncias do WhatsApp
  const { data: instances = [] } = useSupabaseQuery({
    table: 'whatsapp_instances',
    queryKey: ['whatsapp-instances'],
    select: 'id, instance_name, status',
    filters: [{ column: 'status', operator: 'eq', value: 'open' }]
  });
  
  // Query para buscar estágios do funil
  const { data: funnelStages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel-stages'],
    select: 'id, name, color',
    orderBy: [{ column: 'order_index', ascending: true }]
  });
  
  // Query para contar contatos por segmento
  const { data: contactsCount } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['contacts-count', campaignData.target_type, campaignData.funnel_stage_id],
    select: 'id',
    filters: campaignData.target_type === 'funnel_stage' && campaignData.funnel_stage_id 
      ? [{ column: 'funnel_stage_id', operator: 'eq', value: campaignData.funnel_stage_id }]
      : [],
    enabled: true
  });
  
  // Mutation para criar/atualizar campanha
  const saveMutation = useSupabaseMutation({
    table: 'campaigns',
    operation: campaignId ? 'update' : 'insert',
    invalidateQueries: [['campaigns']],
    successMessage: campaignId ? 'Campanha atualizada com sucesso!' : 'Campanha criada com sucesso!'
  });
  
  const steps = [
    { number: 1, title: 'Informações Básicas', icon: MessageSquare },
    { number: 2, title: 'Público-Alvo', icon: Users },
    { number: 3, title: 'Agendamento', icon: Calendar },
    { number: 4, title: 'Revisão', icon: Target }
  ];
  
  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleSave = async () => {
    try {
      const dataToSave = {
        ...campaignData,
        scheduled_at: campaignData.scheduled_at || null
      };
      
      if (campaignId) {
        await saveMutation.mutateAsync({
          ...dataToSave,
          id: campaignId
        });
      } else {
        await saveMutation.mutateAsync(dataToSave);
      }
      
      onClose();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao salvar campanha. Tente novamente.',
        variant: 'destructive'
      });
    }
  };
  
  const getEstimatedReach = () => {
    if (campaignData.target_type === 'all') {
      return contactsCount?.length || 0;
    }
    if (campaignData.target_type === 'funnel_stage' && campaignData.funnel_stage_id) {
      return contactsCount?.length || 0;
    }
    return 0;
  };
  
  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return campaignData.name && campaignData.message && campaignData.whatsapp_instance_id;
      case 2:
        return campaignData.target_type && (campaignData.target_type !== 'funnel_stage' || campaignData.funnel_stage_id);
      case 3:
        return true; // Agendamento é opcional
      case 4:
        return true;
      default:
        return false;
    }
  };
  
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {campaignId ? 'Editar Campanha' : 'Nova Campanha de Disparo'}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Etapa {currentStep} de {steps.length}: {steps[currentStep - 1].title}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-4">
          <Progress value={(currentStep / steps.length) * 100} className="h-2" />
          <div className="flex justify-between mt-2">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className={`flex items-center gap-1 text-xs ${
                  currentStep >= step.number ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  <Icon className="h-3 w-3" />
                  {step.title}
                </div>
              );
            })}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Etapa 1: Informações Básicas */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome da Campanha *</Label>
              <Input
                id="name"
                value={campaignData.name}
                onChange={(e) => setCampaignData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Promoção Black Friday"
              />
            </div>
            
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={campaignData.description}
                onChange={(e) => setCampaignData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descreva o objetivo desta campanha..."
                rows={3}
              />
            </div>
            
            <div>
              <Label htmlFor="instance">Instância do WhatsApp *</Label>
              <Select value={campaignData.whatsapp_instance_id} onValueChange={(value) => setCampaignData(prev => ({ ...prev, whatsapp_instance_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="message">Mensagem *</Label>
              <Textarea
                id="message"
                value={campaignData.message}
                onChange={(e) => setCampaignData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Digite a mensagem que será enviada..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Você pode usar variáveis como {'{name}'}, {'{phone}'}, {'{email}'}
              </p>
            </div>
          </div>
        )}
        
        {/* Etapa 2: Público-Alvo */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Tipo de Público-Alvo</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                <Card 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    campaignData.target_type === 'all' ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setCampaignData(prev => ({ ...prev, target_type: 'all', funnel_stage_id: undefined }))}
                >
                  <CardContent className="p-4 text-center">
                    <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <h4 className="font-medium">Todos os Contatos</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enviar para toda a base
                    </p>
                  </CardContent>
                </Card>
                
                <Card 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    campaignData.target_type === 'funnel_stage' ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setCampaignData(prev => ({ ...prev, target_type: 'funnel_stage' }))}
                >
                  <CardContent className="p-4 text-center">
                    <Target className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <h4 className="font-medium">Por Estágio do Funil</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Segmentar por estágio
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="cursor-not-allowed opacity-50">
                  <CardContent className="p-4 text-center">
                    <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <h4 className="font-medium">Segmento Personalizado</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Em breve
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            {campaignData.target_type === 'funnel_stage' && (
              <div>
                <Label>Estágio do Funil</Label>
                <Select value={campaignData.funnel_stage_id} onValueChange={(value) => setCampaignData(prev => ({ ...prev, funnel_stage_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um estágio" />
                  </SelectTrigger>
                  <SelectContent>
                    {funnelStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Estimativa de Alcance</h4>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-lg font-semibold">{getEstimatedReach()}</span>
                <span className="text-muted-foreground">contatos serão alcançados</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Etapa 3: Agendamento */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div>
              <Label>Tipo de Envio</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <Card 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    !campaignData.scheduled_at ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setCampaignData(prev => ({ ...prev, scheduled_at: undefined, status: 'active' }))}
                >
                  <CardContent className="p-4 text-center">
                    <Send className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <h4 className="font-medium">Enviar Agora</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Iniciar campanha imediatamente
                    </p>
                  </CardContent>
                </Card>
                
                <Card 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    campaignData.scheduled_at ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setCampaignData(prev => ({ ...prev, status: 'scheduled' }))}
                >
                  <CardContent className="p-4 text-center">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <h4 className="font-medium">Agendar Envio</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Programar para data específica
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            {campaignData.status === 'scheduled' && (
              <div>
                <Label htmlFor="scheduled_at">Data e Hora do Envio</Label>
                <Input
                  id="scheduled_at"
                  type="datetime-local"
                  value={campaignData.scheduled_at}
                  onChange={(e) => setCampaignData(prev => ({ ...prev, scheduled_at: e.target.value }))}
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
            )}
          </div>
        )}
        
        {/* Etapa 4: Revisão */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Revisão da Campanha</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Nome</Label>
                    <p className="font-medium">{campaignData.name}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Descrição</Label>
                    <p className="text-sm">{campaignData.description || 'Sem descrição'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Público-Alvo</Label>
                    <div className="flex items-center gap-2">
                      {campaignData.target_type === 'all' && (
                        <Badge variant="secondary">Todos os Contatos</Badge>
                      )}
                      {campaignData.target_type === 'funnel_stage' && (
                        <Badge variant="secondary">
                          Estágio: {funnelStages.find(s => s.id === campaignData.funnel_stage_id)?.name}
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground">({getEstimatedReach()} contatos)</span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Agendamento</Label>
                    <p className="text-sm">
                      {campaignData.scheduled_at 
                        ? `Agendado para ${new Date(campaignData.scheduled_at).toLocaleString('pt-BR')}`
                        : 'Envio imediato'
                      }
                    </p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Prévia da Mensagem</Label>
                  <div className="bg-muted/50 p-4 rounded-lg mt-2">
                    <div className="bg-green-500 text-white p-3 rounded-lg max-w-xs">
                      <p className="text-sm whitespace-pre-wrap">{campaignData.message}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <Separator />
        
        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={handlePrevious}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Anterior
          </Button>
          
          <div className="flex gap-2">
            {currentStep < steps.length ? (
              <Button 
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={handleSave}
                disabled={!canProceed() || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Salvando...' : (campaignId ? 'Atualizar Campanha' : 'Criar Campanha')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};