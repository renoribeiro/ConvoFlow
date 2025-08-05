import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap,
  Play,
  Pause,
  Square,
  Settings,
  Plus,
  Edit,
  Trash2,
  Copy,
  Eye,
  Clock,
  Users,
  MessageSquare,
  Mail,
  Phone,
  Calendar,
  Target,
  Filter,
  ArrowRight,
  ArrowDown,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Save,
  Download,
  Upload,
  Code,
  Webhook,
  Database,
  Globe,
  Smartphone,
  Send,
  UserPlus,
  Tag,
  FileText,
  BarChart3,
  Bell,
  Shield,
  Key,
  Workflow,
  GitBranch,
  Timer,
  Activity,
  TrendingUp,
  Hash
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';

interface WorkflowAutomation {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft' | 'error';
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  created_at: string;
  updated_at: string;
  created_by: string;
  execution_count: number;
  success_rate: number;
  last_execution?: string;
  tags: string[];
}

interface WorkflowTrigger {
  type: 'event' | 'schedule' | 'webhook' | 'manual';
  event?: string;
  schedule?: {
    type: 'interval' | 'cron';
    value: string;
  };
  webhook_url?: string;
  config: Record<string, any>;
}

interface WorkflowCondition {
  id: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'exists' | 'not_exists';
  value: any;
  logical_operator?: 'AND' | 'OR';
}

interface WorkflowAction {
  id: string;
  type: 'send_message' | 'send_email' | 'create_contact' | 'update_contact' | 'add_tag' | 'remove_tag' | 'create_task' | 'webhook' | 'delay' | 'condition';
  config: Record<string, any>;
  delay_seconds?: number;
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  trigger_data: any;
  execution_log: ExecutionLogEntry[];
  error_message?: string;
}

interface ExecutionLogEntry {
  timestamp: string;
  action_id: string;
  action_type: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  data?: any;
}

// Workflows mockados
const mockWorkflows: WorkflowAutomation[] = [
  {
    id: '1',
    name: 'Boas-vindas para Novos Contatos',
    description: 'Envia mensagem de boas-vindas automaticamente para novos contatos',
    status: 'active',
    trigger: {
      type: 'event',
      event: 'contact_created',
      config: {}
    },
    conditions: [
      {
        id: '1',
        field: 'source',
        operator: 'equals',
        value: 'website'
      }
    ],
    actions: [
      {
        id: '1',
        type: 'delay',
        config: {},
        delay_seconds: 300
      },
      {
        id: '2',
        type: 'send_message',
        config: {
          template: 'welcome_message',
          channel: 'whatsapp',
          message: 'Olá! Bem-vindo(a) ao nosso atendimento. Como posso ajudá-lo(a) hoje?'
        }
      },
      {
        id: '3',
        type: 'add_tag',
        config: {
          tag: 'novo_contato'
        }
      }
    ],
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-03T10:00:00Z',
    created_by: 'João Silva',
    execution_count: 1250,
    success_rate: 98.5,
    last_execution: '2024-01-03T09:30:00Z',
    tags: ['boas-vindas', 'automático']
  },
  {
    id: '2',
    name: 'Follow-up de Carrinho Abandonado',
    description: 'Envia lembretes para clientes que abandonaram o carrinho',
    status: 'active',
    trigger: {
      type: 'event',
      event: 'cart_abandoned',
      config: {}
    },
    conditions: [
      {
        id: '1',
        field: 'cart_value',
        operator: 'greater_than',
        value: 50
      }
    ],
    actions: [
      {
        id: '1',
        type: 'delay',
        config: {},
        delay_seconds: 3600
      },
      {
        id: '2',
        type: 'send_email',
        config: {
          template: 'cart_abandonment',
          subject: 'Você esqueceu algo no seu carrinho!',
          discount_code: 'VOLTA10'
        }
      },
      {
        id: '3',
        type: 'delay',
        config: {},
        delay_seconds: 86400
      },
      {
        id: '4',
        type: 'send_message',
        config: {
          channel: 'whatsapp',
          message: 'Oi! Vi que você deixou alguns itens no carrinho. Que tal finalizar sua compra com 10% de desconto? Use o código VOLTA10'
        }
      }
    ],
    created_at: '2024-01-02T14:00:00Z',
    updated_at: '2024-01-03T08:00:00Z',
    created_by: 'Maria Santos',
    execution_count: 856,
    success_rate: 87.3,
    last_execution: '2024-01-03T08:15:00Z',
    tags: ['e-commerce', 'follow-up']
  },
  {
    id: '3',
    name: 'Relatório Diário de Vendas',
    description: 'Envia relatório diário de vendas para a equipe',
    status: 'active',
    trigger: {
      type: 'schedule',
      schedule: {
        type: 'cron',
        value: '0 9 * * *'
      },
      config: {}
    },
    conditions: [],
    actions: [
      {
        id: '1',
        type: 'webhook',
        config: {
          url: 'https://api.convoflow.com/reports/daily-sales',
          method: 'GET'
        }
      },
      {
        id: '2',
        type: 'send_email',
        config: {
          recipients: ['vendas@empresa.com', 'gerencia@empresa.com'],
          template: 'daily_sales_report',
          subject: 'Relatório Diário de Vendas'
        }
      }
    ],
    created_at: '2024-01-01T16:00:00Z',
    updated_at: '2024-01-02T12:00:00Z',
    created_by: 'Sistema',
    execution_count: 30,
    success_rate: 100,
    last_execution: '2024-01-03T09:00:00Z',
    tags: ['relatório', 'vendas', 'diário']
  },
  {
    id: '4',
    name: 'Qualificação de Leads',
    description: 'Qualifica leads automaticamente baseado em critérios',
    status: 'draft',
    trigger: {
      type: 'event',
      event: 'lead_created',
      config: {}
    },
    conditions: [
      {
        id: '1',
        field: 'company_size',
        operator: 'greater_than',
        value: 50,
        logical_operator: 'AND'
      },
      {
        id: '2',
        field: 'budget',
        operator: 'greater_than',
        value: 10000
      }
    ],
    actions: [
      {
        id: '1',
        type: 'add_tag',
        config: {
          tag: 'lead_qualificado'
        }
      },
      {
        id: '2',
        type: 'create_task',
        config: {
          title: 'Contatar lead qualificado',
          assignee: 'vendas@empresa.com',
          priority: 'high'
        }
      }
    ],
    created_at: '2024-01-03T11:00:00Z',
    updated_at: '2024-01-03T11:00:00Z',
    created_by: 'Ana Costa',
    execution_count: 0,
    success_rate: 0,
    tags: ['leads', 'qualificação']
  }
];

// Execuções mockadas
const mockExecutions: WorkflowExecution[] = [
  {
    id: '1',
    workflow_id: '1',
    status: 'completed',
    started_at: '2024-01-03T09:30:00Z',
    completed_at: '2024-01-03T09:35:00Z',
    trigger_data: {
      contact_id: 'contact_123',
      contact_name: 'João Silva',
      source: 'website'
    },
    execution_log: [
      {
        timestamp: '2024-01-03T09:30:00Z',
        action_id: '1',
        action_type: 'delay',
        status: 'success',
        message: 'Aguardando 5 minutos'
      },
      {
        timestamp: '2024-01-03T09:35:00Z',
        action_id: '2',
        action_type: 'send_message',
        status: 'success',
        message: 'Mensagem enviada com sucesso'
      },
      {
        timestamp: '2024-01-03T09:35:01Z',
        action_id: '3',
        action_type: 'add_tag',
        status: 'success',
        message: 'Tag adicionada: novo_contato'
      }
    ]
  },
  {
    id: '2',
    workflow_id: '2',
    status: 'failed',
    started_at: '2024-01-03T08:15:00Z',
    completed_at: '2024-01-03T08:16:00Z',
    trigger_data: {
      cart_id: 'cart_456',
      customer_email: 'cliente@email.com',
      cart_value: 150.00
    },
    execution_log: [
      {
        timestamp: '2024-01-03T08:15:00Z',
        action_id: '1',
        action_type: 'delay',
        status: 'success',
        message: 'Aguardando 1 hora'
      },
      {
        timestamp: '2024-01-03T08:16:00Z',
        action_id: '2',
        action_type: 'send_email',
        status: 'error',
        message: 'Falha ao enviar email: endereço inválido'
      }
    ],
    error_message: 'Email address is invalid'
  }
];

const getTriggerIcon = (type: string) => {
  switch (type) {
    case 'event': return <Zap className="h-4 w-4" />;
    case 'schedule': return <Clock className="h-4 w-4" />;
    case 'webhook': return <Webhook className="h-4 w-4" />;
    case 'manual': return <Play className="h-4 w-4" />;
    default: return <Activity className="h-4 w-4" />;
  }
};

const getActionIcon = (type: string) => {
  switch (type) {
    case 'send_message': return <MessageSquare className="h-4 w-4" />;
    case 'send_email': return <Mail className="h-4 w-4" />;
    case 'create_contact': return <UserPlus className="h-4 w-4" />;
    case 'update_contact': return <Users className="h-4 w-4" />;
    case 'add_tag': return <Tag className="h-4 w-4" />;
    case 'remove_tag': return <Tag className="h-4 w-4" />;
    case 'create_task': return <FileText className="h-4 w-4" />;
    case 'webhook': return <Webhook className="h-4 w-4" />;
    case 'delay': return <Timer className="h-4 w-4" />;
    case 'condition': return <GitBranch className="h-4 w-4" />;
    default: return <Settings className="h-4 w-4" />;
  }
};

const getStatusBadge = (status: string) => {
  const variants = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    draft: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800'
  };

  const labels = {
    active: 'Ativo',
    inactive: 'Inativo',
    draft: 'Rascunho',
    error: 'Erro',
    running: 'Executando',
    completed: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado'
  };

  return (
    <Badge className={variants[status as keyof typeof variants]}>
      {labels[status as keyof typeof labels]}
    </Badge>
  );
};

const WorkflowCard = ({ workflow, onEdit, onDelete, onToggle, onView }: {
  workflow: WorkflowAutomation;
  onEdit: (workflow: WorkflowAutomation) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onView: (workflow: WorkflowAutomation) => void;
}) => {
  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {getTriggerIcon(workflow.trigger.type)}
            </div>
            <div>
              <h3 className="font-semibold">{workflow.name}</h3>
              <p className="text-sm text-muted-foreground">{workflow.description}</p>
            </div>
          </div>
          {getStatusBadge(workflow.status)}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Execuções:</span>
            <span className="ml-2 font-medium">{workflow.execution_count.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Taxa de Sucesso:</span>
            <span className={`ml-2 font-medium ${getSuccessRateColor(workflow.success_rate)}`}>
              {workflow.success_rate.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Trigger:</span>
            <span className="ml-2 font-medium capitalize">{workflow.trigger.type}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Ações:</span>
            <span className="ml-2 font-medium">{workflow.actions.length}</span>
          </div>
        </div>

        {workflow.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {workflow.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {workflow.last_execution && (
          <div className="text-xs text-muted-foreground mb-4">
            Última execução: {new Date(workflow.last_execution).toLocaleString()}
          </div>
        )}

        <Separator className="mb-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => onView(workflow)}>
              <Eye className="h-4 w-4 mr-1" />
              Visualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(workflow)}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggle(workflow.id)}
            >
              {workflow.status === 'active' ? (
                <>
                  <Pause className="h-4 w-4 mr-1" />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Ativar
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(workflow.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const WorkflowBuilder = ({ workflow, onSave, onCancel }: {
  workflow?: WorkflowAutomation;
  onSave: (workflow: Partial<WorkflowAutomation>) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [trigger, setTrigger] = useState<WorkflowTrigger>(workflow?.trigger || {
    type: 'event',
    config: {}
  });
  const [conditions, setConditions] = useState<WorkflowCondition[]>(workflow?.conditions || []);
  const [actions, setActions] = useState<WorkflowAction[]>(workflow?.actions || []);
  const [tags, setTags] = useState<string[]>(workflow?.tags || []);
  const { toast } = useToast();

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "Erro",
        description: "Nome do workflow é obrigatório",
        variant: "destructive"
      });
      return;
    }

    if (actions.length === 0) {
      toast({
        title: "Erro",
        description: "Pelo menos uma ação é obrigatória",
        variant: "destructive"
      });
      return;
    }

    onSave({
      name,
      description,
      trigger,
      conditions,
      actions,
      tags,
      status: 'draft'
    });
  };

  const addCondition = () => {
    const newCondition: WorkflowCondition = {
      id: Date.now().toString(),
      field: '',
      operator: 'equals',
      value: ''
    };
    setConditions([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<WorkflowCondition>) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const addAction = () => {
    const newAction: WorkflowAction = {
      id: Date.now().toString(),
      type: 'send_message',
      config: {}
    };
    setActions([...actions, newAction]);
  };

  const removeAction = (id: string) => {
    setActions(actions.filter(a => a.id !== id));
  };

  const updateAction = (id: string, updates: Partial<WorkflowAction>) => {
    setActions(actions.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações Básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Nome do Workflow *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Boas-vindas para novos contatos"
            />
          </div>
          
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o que este workflow faz..."
              rows={3}
            />
          </div>
          
          <div>
            <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
            <Input
              id="tags"
              value={tags.join(', ')}
              onChange={(e) => setTags(e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder="Ex: boas-vindas, automático, marketing"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Trigger (Gatilho)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tipo de Trigger</Label>
            <Select value={trigger.type} onValueChange={(value: any) => setTrigger({ ...trigger, type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Evento</SelectItem>
                <SelectItem value="schedule">Agendamento</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {trigger.type === 'event' && (
            <div>
              <Label>Evento</Label>
              <Select value={trigger.event} onValueChange={(value) => setTrigger({ ...trigger, event: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact_created">Contato Criado</SelectItem>
                  <SelectItem value="message_received">Mensagem Recebida</SelectItem>
                  <SelectItem value="cart_abandoned">Carrinho Abandonado</SelectItem>
                  <SelectItem value="lead_created">Lead Criado</SelectItem>
                  <SelectItem value="campaign_sent">Campanha Enviada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {trigger.type === 'schedule' && (
            <div className="space-y-2">
              <Label>Agendamento</Label>
              <Select 
                value={trigger.schedule?.type} 
                onValueChange={(value: any) => setTrigger({ 
                  ...trigger, 
                  schedule: { ...trigger.schedule, type: value } as any
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de agendamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Intervalo</SelectItem>
                  <SelectItem value="cron">Cron</SelectItem>
                </SelectContent>
              </Select>
              
              <Input
                placeholder={trigger.schedule?.type === 'cron' ? '0 9 * * *' : '3600'}
                value={trigger.schedule?.value || ''}
                onChange={(e) => setTrigger({ 
                  ...trigger, 
                  schedule: { ...trigger.schedule, value: e.target.value } as any
                })}
              />
            </div>
          )}
          
          {trigger.type === 'webhook' && (
            <div>
              <Label>URL do Webhook</Label>
              <Input
                placeholder="https://api.exemplo.com/webhook"
                value={trigger.webhook_url || ''}
                onChange={(e) => setTrigger({ ...trigger, webhook_url: e.target.value })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Condições</span>
            </div>
            <Button variant="outline" size="sm" onClick={addCondition}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conditions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhuma condição definida. O workflow será executado para todos os triggers.
            </p>
          ) : (
            <div className="space-y-4">
              {conditions.map((condition, index) => (
                <div key={condition.id} className="flex items-center space-x-2 p-4 border rounded-lg">
                  {index > 0 && (
                    <Select 
                      value={condition.logical_operator || 'AND'} 
                      onValueChange={(value: any) => updateCondition(condition.id, { logical_operator: value })}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">E</SelectItem>
                        <SelectItem value="OR">OU</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  
                  <Input
                    placeholder="Campo"
                    value={condition.field}
                    onChange={(e) => updateCondition(condition.id, { field: e.target.value })}
                    className="flex-1"
                  />
                  
                  <Select 
                    value={condition.operator} 
                    onValueChange={(value: any) => updateCondition(condition.id, { operator: value })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Igual a</SelectItem>
                      <SelectItem value="not_equals">Diferente de</SelectItem>
                      <SelectItem value="contains">Contém</SelectItem>
                      <SelectItem value="not_contains">Não contém</SelectItem>
                      <SelectItem value="greater_than">Maior que</SelectItem>
                      <SelectItem value="less_than">Menor que</SelectItem>
                      <SelectItem value="exists">Existe</SelectItem>
                      <SelectItem value="not_exists">Não existe</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Input
                    placeholder="Valor"
                    value={condition.value}
                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                    className="flex-1"
                  />
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeCondition(condition.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Ações</span>
            </div>
            <Button variant="outline" size="sm" onClick={addAction}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhuma ação definida. Adicione pelo menos uma ação.
            </p>
          ) : (
            <div className="space-y-4">
              {actions.map((action, index) => (
                <div key={action.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium">Ação {index + 1}</span>
                      {getActionIcon(action.type)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeAction(action.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <Label>Tipo de Ação</Label>
                      <Select 
                        value={action.type} 
                        onValueChange={(value: any) => updateAction(action.id, { type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="send_message">Enviar Mensagem</SelectItem>
                          <SelectItem value="send_email">Enviar Email</SelectItem>
                          <SelectItem value="create_contact">Criar Contato</SelectItem>
                          <SelectItem value="update_contact">Atualizar Contato</SelectItem>
                          <SelectItem value="add_tag">Adicionar Tag</SelectItem>
                          <SelectItem value="remove_tag">Remover Tag</SelectItem>
                          <SelectItem value="create_task">Criar Tarefa</SelectItem>
                          <SelectItem value="webhook">Webhook</SelectItem>
                          <SelectItem value="delay">Aguardar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {action.type === 'delay' && (
                      <div>
                        <Label>Tempo de Espera (segundos)</Label>
                        <Input
                          type="number"
                          placeholder="300"
                          value={action.delay_seconds || ''}
                          onChange={(e) => updateAction(action.id, { delay_seconds: parseInt(e.target.value) })}
                        />
                      </div>
                    )}
                    
                    {(action.type === 'send_message' || action.type === 'send_email') && (
                      <div>
                        <Label>Mensagem/Conteúdo</Label>
                        <Textarea
                          placeholder="Digite sua mensagem..."
                          value={action.config.message || action.config.content || ''}
                          onChange={(e) => updateAction(action.id, { 
                            config: { 
                              ...action.config, 
                              [action.type === 'send_email' ? 'content' : 'message']: e.target.value 
                            }
                          })}
                          rows={3}
                        />
                      </div>
                    )}
                    
                    {(action.type === 'add_tag' || action.type === 'remove_tag') && (
                      <div>
                        <Label>Tag</Label>
                        <Input
                          placeholder="nome_da_tag"
                          value={action.config.tag || ''}
                          onChange={(e) => updateAction(action.id, { 
                            config: { ...action.config, tag: e.target.value }
                          })}
                        />
                      </div>
                    )}
                    
                    {action.type === 'webhook' && (
                      <div className="space-y-2">
                        <div>
                          <Label>URL</Label>
                          <Input
                            placeholder="https://api.exemplo.com/endpoint"
                            value={action.config.url || ''}
                            onChange={(e) => updateAction(action.id, { 
                              config: { ...action.config, url: e.target.value }
                            })}
                          />
                        </div>
                        <div>
                          <Label>Método</Label>
                          <Select 
                            value={action.config.method || 'POST'} 
                            onValueChange={(value) => updateAction(action.id, { 
                              config: { ...action.config, method: value }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GET">GET</SelectItem>
                              <SelectItem value="POST">POST</SelectItem>
                              <SelectItem value="PUT">PUT</SelectItem>
                              <SelectItem value="DELETE">DELETE</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end space-x-4">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Salvar Workflow
        </Button>
      </div>
    </div>
  );
};

const WorkflowExecutions = ({ workflowId }: { workflowId?: string }) => {
  const [executions] = useState<WorkflowExecution[]>(
    workflowId ? mockExecutions.filter(e => e.workflow_id === workflowId) : mockExecutions
  );
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null);

  if (selectedExecution) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setSelectedExecution(null)}>
            ← Voltar
          </Button>
          <div>
            <h3 className="text-lg font-semibold">Detalhes da Execução</h3>
            <p className="text-sm text-muted-foreground">
              ID: {selectedExecution.id}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {getStatusBadge(selectedExecution.status)}
                <div className="text-sm">
                  <p><strong>Iniciado:</strong> {new Date(selectedExecution.started_at).toLocaleString()}</p>
                  {selectedExecution.completed_at && (
                    <p><strong>Concluído:</strong> {new Date(selectedExecution.completed_at).toLocaleString()}</p>
                  )}
                  {selectedExecution.error_message && (
                    <p className="text-red-600"><strong>Erro:</strong> {selectedExecution.error_message}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados do Trigger</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                {JSON.stringify(selectedExecution.trigger_data, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total de Ações:</span>
                  <span>{selectedExecution.execution_log.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sucessos:</span>
                  <span className="text-green-600">
                    {selectedExecution.execution_log.filter(l => l.status === 'success').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Erros:</span>
                  <span className="text-red-600">
                    {selectedExecution.execution_log.filter(l => l.status === 'error').length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Log de Execução</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {selectedExecution.execution_log.map((entry, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <div className="flex-shrink-0">
                      {entry.status === 'success' && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {entry.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                      {entry.status === 'skipped' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {getActionIcon(entry.action_type)}
                        <span className="font-medium capitalize">{entry.action_type.replace('_', ' ')}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.message}</p>
                      {entry.data && (
                        <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                          {JSON.stringify(entry.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Execuções Recentes</h3>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="space-y-4">
        {executions.map((execution) => (
          <Card key={execution.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedExecution(execution)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div>
                    {execution.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-500" />}
                    {execution.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
                    {execution.status === 'running' && <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />}
                    {execution.status === 'cancelled' && <Square className="h-5 w-5 text-gray-500" />}
                  </div>
                  <div>
                    <p className="font-medium">Execução {execution.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(execution.started_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {getStatusBadge(execution.status)}
                  <p className="text-xs text-muted-foreground mt-1">
                    {execution.execution_log.length} ações
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {executions.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma execução encontrada</h3>
            <p className="text-muted-foreground">
              Este workflow ainda não foi executado.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const WorkflowsList = () => {
  const [workflows, setWorkflows] = useState<WorkflowAutomation[]>(mockWorkflows);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowAutomation | null>(null);
  const { toast } = useToast();

  const filteredWorkflows = workflows.filter(workflow => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workflow.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filter === 'all' || workflow.status === filter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (workflow: WorkflowAutomation) => {
    toast({
      title: "Editar workflow",
      description: `Editando ${workflow.name}`
    });
  };

  const handleDelete = (id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id));
    toast({
      title: "Workflow removido",
      description: "O workflow foi removido com sucesso"
    });
  };

  const handleToggle = (id: string) => {
    setWorkflows(prev => prev.map(workflow => {
      if (workflow.id === id) {
        const newStatus = workflow.status === 'active' ? 'inactive' : 'active';
        return { ...workflow, status: newStatus };
      }
      return workflow;
    }));
    
    const workflow = workflows.find(w => w.id === id);
    const action = workflow?.status === 'active' ? 'pausado' : 'ativado';
    
    toast({
      title: "Status alterado",
      description: `Workflow ${action} com sucesso`
    });
  };

  const handleView = (workflow: WorkflowAutomation) => {
    setSelectedWorkflow(workflow);
  };

  if (selectedWorkflow) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setSelectedWorkflow(null)}>
            ← Voltar
          </Button>
          <div>
            <h3 className="text-lg font-semibold">{selectedWorkflow.name}</h3>
            <p className="text-sm text-muted-foreground">{selectedWorkflow.description}</p>
          </div>
        </div>
        <WorkflowExecutions workflowId={selectedWorkflow.id} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            placeholder="Buscar workflows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredWorkflows.map((workflow) => (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onView={handleView}
          />
        ))}
      </div>

      {filteredWorkflows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Workflow className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum workflow encontrado</h3>
            <p className="text-muted-foreground">
              {filter === 'all' ? 
                'Você ainda não criou nenhum workflow.' :
                `Não há workflows com status "${filter}".`
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export const WorkflowAutomation = () => {
  const [activeTab, setActiveTab] = useState('workflows');
  const [isBuilding, setIsBuilding] = useState(false);
  const { toast } = useToast();

  const handleSaveWorkflow = (workflowData: Partial<WorkflowAutomation>) => {
    console.log('Saving workflow:', workflowData);
    toast({
      title: "Workflow criado",
      description: "Seu workflow foi salvo com sucesso"
    });
    setIsBuilding(false);
    setActiveTab('workflows');
  };

  const handleCancelBuilder = () => {
    setIsBuilding(false);
  };

  if (isBuilding) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleCancelBuilder}>
            ← Voltar
          </Button>
          <div>
            <h2 className="text-2xl font-bold">Criar Workflow</h2>
            <p className="text-muted-foreground">
              Configure as automações para seu negócio
            </p>
          </div>
        </div>

        <WorkflowBuilder onSave={handleSaveWorkflow} onCancel={handleCancelBuilder} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Automação de Workflows</h2>
          <p className="text-muted-foreground">
            Automatize processos e aumente a eficiência do seu negócio
          </p>
        </div>
        <Button onClick={() => setIsBuilding(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Criar Workflow
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="executions">Execuções</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows">
          <WorkflowsList />
        </TabsContent>

        <TabsContent value="executions">
          <WorkflowExecutions />
        </TabsContent>
      </Tabs>
    </div>
  );
};