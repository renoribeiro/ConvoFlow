import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import {
  Workflow,
  Plus,
  Trash2,
  Play,
  Pause,
  Settings,
  MessageSquare,
  Clock,
  Users,
  Target,
  Mail,
  Phone,
  Calendar,
  Filter,
  ArrowRight,
  Save,
  X
} from 'lucide-react';

interface AutomationStep {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'delay';
  config: Record<string, any>;
  position: { x: number; y: number };
  connections: string[];
}

interface AutomationFlow {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  steps: AutomationStep[];
  trigger_type: string;
  trigger_config: Record<string, any>;
}

interface AutomationBuilderProps {
  flowId?: string;
  onClose: () => void;
}

export const AutomationBuilder = ({ flowId, onClose }: AutomationBuilderProps) => {
  const [flow, setFlow] = useState<AutomationFlow>({
    name: '',
    description: '',
    active: false,
    steps: [],
    trigger_type: '',
    trigger_config: {}
  });
  
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [draggedStep, setDraggedStep] = useState<string | null>(null);
  
  const { toast } = useToast();
  
  // Query para buscar o fluxo existente
  const { data: existingFlowData } = useSupabaseQuery({
    table: 'automation_flows',
    queryKey: ['automation-flow', flowId],
    select: '*',
    filters: flowId ? [{ column: 'id', operator: 'eq', value: flowId }] : [],
    enabled: !!flowId
  });

  const existingFlow = existingFlowData?.[0];
  
  // Query para buscar templates de mensagem
  const { data: messageTemplates = [], refetch: refetchTemplates } = useSupabaseQuery({
    table: 'message_templates',
    queryKey: ['message-templates'],
    select: 'id, name, content'
  });
  
  // Estados para criação de novo template
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  
  // Mutation para criar novo template
  const createTemplateMutation = useSupabaseMutation({
    table: 'message_templates',
    operation: 'insert',
    invalidateQueries: [['message-templates']],
    successMessage: 'Template criado com sucesso!'
  });
  
  // Query para buscar estágios do funil
  const { data: funnelStages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel-stages'],
    select: 'id, name, color'
  });
  
  // Mutation para salvar fluxo
  const saveFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: flowId ? 'update' : 'insert',
    invalidateQueries: [['automation-flows']],
    successMessage: flowId ? 'Fluxo atualizado!' : 'Fluxo criado!'
  });
  
  // Carregar fluxo existente
  useState(() => {
    if (existingFlow && existingFlow.length > 0) {
      setFlow(existingFlow[0]);
    }
  }, [existingFlow]);
  
  const triggerTypes = [
    {
      id: 'message_received',
      name: 'Mensagem Recebida',
      description: 'Acionado quando uma nova mensagem é recebida',
      icon: MessageSquare,
      config: {
        keywords: { type: 'array', label: 'Palavras-chave' },
        exact_match: { type: 'boolean', label: 'Correspondência exata' }
      }
    },
    {
      id: 'contact_created',
      name: 'Novo Contato',
      description: 'Acionado quando um novo contato é criado',
      icon: Users,
      config: {
        source: { type: 'select', label: 'Fonte', options: ['whatsapp', 'website', 'manual'] }
      }
    },
    {
      id: 'funnel_stage_changed',
      name: 'Mudança de Estágio',
      description: 'Acionado quando um contato muda de estágio no funil',
      icon: Target,
      config: {
        from_stage: { type: 'select', label: 'Do estágio', options: funnelStages },
        to_stage: { type: 'select', label: 'Para o estágio', options: funnelStages }
      }
    },
    {
      id: 'scheduled_time',
      name: 'Horário Agendado',
      description: 'Acionado em horários específicos',
      icon: Clock,
      config: {
        schedule_type: { type: 'select', label: 'Tipo', options: ['daily', 'weekly', 'monthly'] },
        time: { type: 'time', label: 'Horário' }
      }
    }
  ];
  
  const actionTypes = [
    {
      id: 'send_message',
      name: 'Enviar Mensagem',
      description: 'Enviar mensagem via WhatsApp',
      icon: MessageSquare,
      config: {
        message_template_id: { type: 'select', label: 'Template', options: messageTemplates },
        custom_message: { type: 'textarea', label: 'Mensagem personalizada' }
      }
    },
    {
      id: 'change_funnel_stage',
      name: 'Alterar Estágio',
      description: 'Mover contato para outro estágio do funil',
      icon: Target,
      config: {
        stage_id: { type: 'select', label: 'Novo estágio', options: funnelStages }
      }
    },
    {
      id: 'schedule_followup',
      name: 'Agendar Follow-up',
      description: 'Criar um follow-up automático',
      icon: Calendar,
      config: {
        delay_hours: { type: 'number', label: 'Atraso (horas)' },
        followup_type: { type: 'select', label: 'Tipo', options: ['call', 'whatsapp', 'email'] },
        message: { type: 'textarea', label: 'Mensagem' }
      }
    },
    {
      id: 'add_tag',
      name: 'Adicionar Tag',
      description: 'Adicionar tag ao contato',
      icon: Filter,
      config: {
        tag_name: { type: 'text', label: 'Nome da tag' }
      }
    },
    {
      id: 'delay',
      name: 'Aguardar',
      description: 'Adicionar um atraso antes da próxima ação',
      icon: Clock,
      config: {
        delay_type: { type: 'select', label: 'Tipo', options: ['minutes', 'hours', 'days'] },
        delay_value: { type: 'number', label: 'Valor' }
      }
    }
  ];
  
  const conditionTypes = [
    {
      id: 'contact_has_tag',
      name: 'Contato tem Tag',
      description: 'Verificar se o contato possui uma tag específica',
      icon: Filter,
      config: {
        tag_name: { type: 'text', label: 'Nome da tag' }
      }
    },
    {
      id: 'contact_in_stage',
      name: 'Contato no Estágio',
      description: 'Verificar se o contato está em um estágio específico',
      icon: Target,
      config: {
        stage_id: { type: 'select', label: 'Estágio', options: funnelStages }
      }
    },
    {
      id: 'message_contains',
      name: 'Mensagem Contém',
      description: 'Verificar se a mensagem contém palavras específicas',
      icon: MessageSquare,
      config: {
        keywords: { type: 'array', label: 'Palavras-chave' },
        case_sensitive: { type: 'boolean', label: 'Sensível a maiúsculas' }
      }
    }
  ];
  
  const addStep = (type: 'action' | 'condition' | 'delay') => {
    const newStep: AutomationStep = {
      id: `step_${Date.now()}`,
      type,
      config: {},
      position: { x: 0, y: flow.steps.length * 120 + 150 },
      connections: []
    };
    
    setFlow(prev => ({
      ...prev,
      steps: [...prev.steps, newStep]
    }));
  };
  
  const removeStep = (stepId: string) => {
    setFlow(prev => ({
      ...prev,
      steps: prev.steps.filter(step => step.id !== stepId)
    }));
    
    if (selectedStep === stepId) {
      setSelectedStep(null);
    }
  };
  
  const updateStep = (stepId: string, updates: Partial<AutomationStep>) => {
    setFlow(prev => ({
      ...prev,
      steps: prev.steps.map(step => 
        step.id === stepId ? { ...step, ...updates } : step
      )
    }));
  };
  
  const updateStepConfig = (stepId: string, key: string, value: any) => {
    setFlow(prev => ({
      ...prev,
      steps: prev.steps.map(step => 
        step.id === stepId 
          ? { ...step, config: { ...step.config, [key]: value } }
          : step
      )
    }));
  };
  
  const createNewTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateContent.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome e conteúdo do template são obrigatórios',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      const templateData = {
        name: newTemplateName.trim(),
        content: newTemplateContent.trim(),
        type: 'text',
        channel: 'whatsapp',
        category: 'automation',
        status: 'active'
      };
      
      const result = await createTemplateMutation.mutateAsync({ data: templateData });
      
      // Limpar formulário
      setNewTemplateName('');
      setNewTemplateContent('');
      setShowNewTemplateForm(false);
      
      // Atualizar lista de templates
      await refetchTemplates();
      
      // Selecionar o novo template criado
      if (selectedStep && result?.data?.[0]?.id) {
        updateStepConfig(selectedStep, 'message_template_id', result.data[0].id);
      }
      
    } catch (error) {
      console.error('Erro ao criar template:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao criar template de mensagem',
        variant: 'destructive'
      });
    }
  };

  const handleSave = async () => {
    try {
      if (!flow.name || !flow.trigger_type) {
        toast({
          title: 'Erro',
          description: 'Nome e tipo de gatilho são obrigatórios',
          variant: 'destructive'
        });
        return;
      }
      
      const dataToSave = {
        name: flow.name,
        description: flow.description || '',
        active: flow.active,
        trigger_type: flow.trigger_type,
        steps: JSON.stringify(flow.steps),
        trigger_config: JSON.stringify(flow.trigger_config)
      };
      
      console.log('Dados para salvar:', dataToSave);
      
      if (flowId) {
        await saveFlowMutation.mutateAsync({
          data: dataToSave,
          options: { filter: { column: 'id', operator: 'eq', value: flowId } }
        });
      } else {
        await saveFlowMutation.mutateAsync({ data: dataToSave });
      }
      
      onClose();
    } catch (error) {
      console.error('Erro ao salvar fluxo:', error);
      toast({
        title: 'Erro',
        description: `Erro ao salvar fluxo de automação: ${error.message || 'Erro desconhecido'}`,
        variant: 'destructive'
      });
    }
  };
  
  const renderConfigField = (field: any, value: any, onChange: (value: any) => void) => {
    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.label}
          />
        );
      case 'textarea':
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.label}
            rows={3}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder={field.label}
          />
        );
      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              checked={value || false}
              onCheckedChange={onChange}
            />
            <Label>{field.label}</Label>
          </div>
        );
      case 'select':
        // Verificar se é o campo de template de mensagem para adicionar funcionalidade especial
        if (field.label === 'Template') {
          return (
            <div className="space-y-2">
              <Select value={value || ''} onValueChange={onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={`Selecione ${field.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((option: any) => (
                    <SelectItem key={option.id || option} value={option.id || option}>
                      {option.name || option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Botão para adicionar novo template */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowNewTemplateForm(!showNewTemplateForm)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {showNewTemplateForm ? 'Cancelar' : 'Criar Novo Template'}
              </Button>
              
              {/* Formulário para criar novo template */}
              {showNewTemplateForm && (
                <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                  <div>
                    <Label>Nome do Template</Label>
                    <Input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Digite o nome do template"
                    />
                  </div>
                  <div>
                    <Label>Conteúdo</Label>
                    <Textarea
                      value={newTemplateContent}
                      onChange={(e) => setNewTemplateContent(e.target.value)}
                      placeholder="Digite o conteúdo da mensagem..."
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={createNewTemplate}
                      disabled={createTemplateMutation.isPending || !newTemplateName.trim() || !newTemplateContent.trim()}
                      className="flex-1"
                    >
                      {createTemplateMutation.isPending ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                          Criando...
                        </>
                      ) : (
                        'Criar Template'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        }
        
        // Renderização padrão para outros selects
        return (
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={`Selecione ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option: any) => (
                <SelectItem key={option.id || option} value={option.id || option}>
                  {option.name || option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'array':
        return (
          <Input
            value={Array.isArray(value) ? value.join(', ') : ''}
            onChange={(e) => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder={`${field.label} (separadas por vírgula)`}
          />
        );
      default:
        return null;
    }
  };
  
  const selectedStepData = selectedStep ? flow.steps.find(s => s.id === selectedStep) : null;
  const selectedStepType = selectedStepData ? 
    [...actionTypes, ...conditionTypes].find(t => t.id === selectedStepData.config.type) : null;
  
  return (
    <div className="flex h-[80vh] gap-4">
      {/* Canvas Principal */}
      <div className="flex-1 bg-muted/20 rounded-lg p-4 relative overflow-auto">
        <div className="absolute top-4 left-4 right-4 z-10">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <Input
                      value={flow.name}
                      onChange={(e) => setFlow(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome do fluxo de automação"
                      className="font-medium"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={flow.active}
                      onCheckedChange={(checked) => setFlow(prev => ({ ...prev, active: checked }))}
                    />
                    <Label>Ativo</Label>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saveFlowMutation.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {saveFlowMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button variant="outline" onClick={onClose}>
                    <X className="h-4 w-4 mr-2" />
                    Fechar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Área do Canvas */}
        <div className="mt-20 min-h-[600px] relative">
          {/* Gatilho */}
          <Card className="absolute top-0 left-1/2 transform -translate-x-1/2 w-64">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Play className="h-4 w-4 text-green-500" />
                Gatilho
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select 
                value={flow.trigger_type} 
                onValueChange={(value) => setFlow(prev => ({ ...prev, trigger_type: value, trigger_config: {} }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um gatilho" />
                </SelectTrigger>
                <SelectContent>
                  {triggerTypes.map((trigger) => (
                    <SelectItem key={trigger.id} value={trigger.id}>
                      {trigger.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          
          {/* Seta do gatilho */}
          {flow.trigger_type && (
            <div className="absolute top-24 left-1/2 transform -translate-x-1/2">
              <ArrowRight className="h-6 w-6 text-muted-foreground rotate-90" />
            </div>
          )}
          
          {/* Steps */}
          {flow.steps.map((step, index) => {
            const stepType = [...actionTypes, ...conditionTypes].find(t => t.id === step.config.type);
            const Icon = stepType?.icon || Settings;
            
            return (
              <div key={step.id}>
                <Card 
                  className={`absolute w-64 cursor-pointer transition-all hover:shadow-md ${
                    selectedStep === step.id ? 'ring-2 ring-primary' : ''
                  }`}
                  style={{
                    top: step.position.y,
                    left: '50%',
                    transform: 'translateX(-50%)'
                  }}
                  onClick={() => setSelectedStep(step.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {stepType?.name || 'Configurar'}
                      </CardTitle>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStep(step.id);
                        }}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {stepType?.description || 'Clique para configurar'}
                    </p>
                  </CardContent>
                </Card>
                
                {/* Seta para próximo step */}
                {index < flow.steps.length - 1 && (
                  <div 
                    className="absolute"
                    style={{
                      top: step.position.y + 80,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 1
                    }}
                  >
                    <ArrowRight className="h-6 w-6 text-muted-foreground rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Painel Lateral */}
      <div className="w-80 space-y-4">
        {/* Adicionar Steps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Adicionar Etapa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => addStep('action')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ação
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => addStep('condition')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Condição
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => addStep('delay')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Atraso
            </Button>
          </CardContent>
        </Card>
        
        {/* Configuração do Gatilho */}
        {flow.trigger_type && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configurar Gatilho</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const trigger = triggerTypes.find(t => t.id === flow.trigger_type);
                if (!trigger) return null;
                
                return Object.entries(trigger.config).map(([key, field]) => (
                  <div key={key}>
                    <Label>{field.label}</Label>
                    {renderConfigField(
                      field,
                      flow.trigger_config[key],
                      (value) => setFlow(prev => ({
                        ...prev,
                        trigger_config: { ...prev.trigger_config, [key]: value }
                      }))
                    )}
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        )}
        
        {/* Configuração do Step Selecionado */}
        {selectedStepData && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configurar Etapa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tipo de Etapa</Label>
                <Select 
                  value={selectedStepData.config.type || ''} 
                  onValueChange={(value) => updateStepConfig(selectedStep!, 'type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedStepData.type === 'action' ? actionTypes : conditionTypes).map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedStepType && Object.entries(selectedStepType.config).map(([key, field]) => (
                <div key={key}>
                  <Label>{field.label}</Label>
                  {renderConfigField(
                    field,
                    selectedStepData.config[key],
                    (value) => updateStepConfig(selectedStep!, key, value)
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};