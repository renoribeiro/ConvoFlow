import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { AutomationBuilder } from '@/components/automation/AutomationBuilder';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Edit,
  Trash2,
  Copy,
  BarChart3,
  Search,
  Filter,
  Settings,
  MessageSquare,
  Users,
  Target,
  Clock,
  TrendingUp,
  Activity
} from 'lucide-react';

interface AutomationFlow {
  id: string;
  name: string;
  description: string;
  active: boolean;
  trigger_type: string;
  trigger_config: any;
  steps: any;
  created_at: string;
  updated_at: string;
  executions_count?: number;
  success_rate?: number;
}

const Automation = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingFlow, setEditingFlow] = useState<string | null>(null);
  
  const { toast } = useToast();
  
  // Query para buscar fluxos de automação
  const { data: flows = [], isLoading } = useSupabaseQuery({
    table: 'automation_flows',
    queryKey: ['automation-flows'],
    select: `
      id,
      name,
      description,
      active,
      trigger_type,
      trigger_config,
      steps,
      created_at,
      updated_at
    `
  });
  
  // Mutation para deletar fluxo
  const deleteFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: 'delete',
    invalidateQueries: [['automation-flows']],
    successMessage: 'Fluxo deletado com sucesso!'
  });
  
  // Mutation para ativar/desativar fluxo
  const toggleFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: 'update',
    invalidateQueries: [['automation-flows']],
    successMessage: 'Status do fluxo atualizado!'
  });
  
  // Mutation para duplicar fluxo
  const duplicateFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: 'insert',
    invalidateQueries: [['automation-flows']],
    successMessage: 'Fluxo duplicado com sucesso!'
  });
  
  const filteredFlows = flows.filter(flow => {
    const matchesSearch = flow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         flow.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && flow.active) ||
                         (filterStatus === 'inactive' && !flow.active);
    return matchesSearch && matchesFilter;
  });
  
  const handleDeleteFlow = async (flowId: string) => {
    if (confirm('Tem certeza que deseja deletar este fluxo de automação?')) {
      try {
        await deleteFlowMutation.mutateAsync(flowId);
      } catch (error) {
        toast({
          title: 'Erro',
          description: 'Erro ao deletar fluxo de automação',
          variant: 'destructive'
        });
      }
    }
  };
  
  const handleToggleFlow = async (flowId: string, currentStatus: boolean) => {
    try {
      await toggleFlowMutation.mutateAsync({        id: flowId,        data: { active: !currentStatus }      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao alterar status do fluxo',
        variant: 'destructive'
      });
    }
  };
  
  const handleDuplicateFlow = async (flow: AutomationFlow) => {
    try {
      await duplicateFlowMutation.mutateAsync({
        name: `${flow.name} (Cópia)`,
        description: flow.description,
        active: false,
        trigger_type: flow.trigger_type,
        trigger_config: flow.trigger_config,
        steps: flow.steps
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao duplicar fluxo',
        variant: 'destructive'
      });
    }
  };
  
  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'message_received':
        return MessageSquare;
      case 'contact_created':
        return Users;
      case 'funnel_stage_changed':
        return Target;
      case 'scheduled_time':
        return Clock;
      default:
        return Settings;
    }
  };
  
  const getTriggerName = (triggerType: string) => {
    switch (triggerType) {
      case 'message_received':
        return 'Mensagem Recebida';
      case 'contact_created':
        return 'Novo Contato';
      case 'funnel_stage_changed':
        return 'Mudança de Estágio';
      case 'scheduled_time':
        return 'Horário Agendado';
      default:
        return 'Personalizado';
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const getStepsCount = (steps: any) => {
    try {
      const parsedSteps = typeof steps === 'string' ? JSON.parse(steps) : steps;
      return Array.isArray(parsedSteps) ? parsedSteps.length : 0;
    } catch {
      return 0;
    }
  };
  
  // Estatísticas gerais
  const totalFlows = flows.length;
  const activeFlows = flows.filter(f => f.active).length;
  const inactiveFlows = totalFlows - activeFlows;
  
  if (showBuilder) {
    return (
      <AutomationBuilder
        flowId={editingFlow || undefined}
        onClose={() => {
          setShowBuilder(false);
          setEditingFlow(null);
        }}
      />
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automação</h1>
          <p className="text-muted-foreground">
            Crie e gerencie fluxos de automação para otimizar seu atendimento
          </p>
        </div>
        <Button onClick={() => setShowBuilder(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Fluxo
        </Button>
      </div>
      
      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Fluxos</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFlows}</div>
            <p className="text-xs text-muted-foreground">
              Fluxos de automação criados
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fluxos Ativos</CardTitle>
            <Play className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeFlows}</div>
            <p className="text-xs text-muted-foreground">
              Executando automaticamente
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fluxos Inativos</CardTitle>
            <Pause className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{inactiveFlows}</div>
            <p className="text-xs text-muted-foreground">
              Pausados ou em configuração
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">94%</div>
            <p className="text-xs text-muted-foreground">
              Execuções bem-sucedidas
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar fluxos de automação..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('all')}
              >
                Todos
              </Button>
              <Button
                variant={filterStatus === 'active' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('active')}
              >
                Ativos
              </Button>
              <Button
                variant={filterStatus === 'inactive' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('inactive')}
              >
                Inativos
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Lista de Fluxos */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredFlows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Workflow className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchTerm || filterStatus !== 'all' 
                ? 'Nenhum fluxo encontrado' 
                : 'Nenhum fluxo de automação criado'
              }
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || filterStatus !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Crie seu primeiro fluxo de automação para otimizar seu atendimento'
              }
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <Button onClick={() => setShowBuilder(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Fluxo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredFlows.map((flow) => {
            const TriggerIcon = getTriggerIcon(flow.trigger_type);
            const stepsCount = getStepsCount(flow.steps);
            
            return (
              <Card key={flow.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{flow.name}</CardTitle>
                        <Badge variant={flow.active ? 'default' : 'secondary'}>
                          {flow.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {flow.description || 'Sem descrição'}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <TriggerIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {getTriggerName(flow.trigger_type)}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{stepsCount} etapa{stepsCount !== 1 ? 's' : ''}</span>
                      <span>Criado em {formatDate(flow.created_at)}</span>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingFlow(flow.id);
                            setShowBuilder(true);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDuplicateFlow(flow)}
                          disabled={duplicateFlowMutation.isPending}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteFlow(flow.id)}
                          disabled={deleteFlowMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      <Button
                        size="sm"
                        variant={flow.active ? 'secondary' : 'default'}
                        onClick={() => handleToggleFlow(flow.id, flow.active)}
                        disabled={toggleFlowMutation.isPending}
                      >
                        {flow.active ? (
                          <><Pause className="h-3 w-3 mr-1" /> Pausar</>
                        ) : (
                          <><Play className="h-3 w-3 mr-1" /> Ativar</>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Automation;