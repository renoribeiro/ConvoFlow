import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { AutomationBuilder } from '@/components/automation/AutomationBuilder';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Edit,
  Trash2,
  Copy,
  Search,
  Filter,
  Settings,
  MessageSquare,
  Users,
  Target,
  Clock,
  TrendingUp,
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
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingFlow, setEditingFlow] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationFlow | null>(null);

  const { toast } = useToast();

  const { data: flows = [], isLoading } = useSupabaseQuery({
    table: 'automation_flows',
    queryKey: ['automation-flows'],
    select: 'id, name, description, active, trigger_type, trigger_config, steps, created_at, updated_at',
  });

  const deleteFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: 'delete',
    invalidateQueries: [['automation-flows']],
    successMessage: 'Fluxo excluído com sucesso!',
  });

  const toggleFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: 'update',
    invalidateQueries: [['automation-flows']],
    successMessage: 'Status do fluxo atualizado!',
  });

  const duplicateFlowMutation = useSupabaseMutation({
    table: 'automation_flows',
    operation: 'insert',
    invalidateQueries: [['automation-flows']],
    successMessage: 'Fluxo duplicado com sucesso!',
  });

  const filteredFlows = flows.filter((flow) => {
    const matchesSearch =
      flow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flow.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && flow.active) ||
      (filterStatus === 'inactive' && !flow.active);
    return matchesSearch && matchesFilter;
  });

  const handleDeleteFlow = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFlowMutation.mutateAsync({
        data: deleteTarget.id,
        options: { filter: { column: 'id', operator: 'eq', value: deleteTarget.id } },
      } as any);
      setDeleteTarget(null);
    } catch {
      toast({ title: 'Erro', description: 'Erro ao excluir fluxo', variant: 'destructive' });
    }
  };

  const handleToggleFlow = async (flowId: string, currentStatus: boolean) => {
    try {
      await toggleFlowMutation.mutateAsync({
        data: { active: !currentStatus },
        options: { filter: { column: 'id', operator: 'eq', value: flowId } },
      });
    } catch {
      toast({ title: 'Erro', description: 'Erro ao alterar status do fluxo', variant: 'destructive' });
    }
  };

  const handleDuplicateFlow = async (flow: AutomationFlow) => {
    try {
      await duplicateFlowMutation.mutateAsync({
        data: {
          name: `${flow.name} (Cópia)`,
          description: flow.description,
          active: false,
          trigger_type: flow.trigger_type,
          trigger_config: flow.trigger_config,
          steps: flow.steps,
        },
      });
    } catch {
      toast({ title: 'Erro', description: 'Erro ao duplicar fluxo', variant: 'destructive' });
    }
  };

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'message_received': return MessageSquare;
      case 'contact_created': return Users;
      case 'funnel_stage_changed': return Target;
      case 'scheduled_time': return Clock;
      default: return Settings;
    }
  };

  const getTriggerName = (triggerType: string) => {
    switch (triggerType) {
      case 'message_received': return 'Mensagem Recebida';
      case 'contact_created': return 'Novo Contato';
      case 'funnel_stage_changed': return 'Mudança de Estágio';
      case 'scheduled_time': return 'Horário Agendado';
      default: return 'Personalizado';
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const getStepsCount = (steps: any) => {
    try {
      const parsedSteps = typeof steps === 'string' ? JSON.parse(steps) : steps;
      return Array.isArray(parsedSteps) ? parsedSteps.length : 0;
    } catch {
      return 0;
    }
  };

  const totalFlows = flows.length;
  const activeFlows = flows.filter((f) => f.active).length;
  const inactiveFlows = totalFlows - activeFlows;

  const calculateSuccessRate = (): string => {
    const flowsWithExecutions = flows.filter((f) => f.executions_count && f.executions_count > 0);
    if (flowsWithExecutions.length === 0) return '--';
    const totalRate = flowsWithExecutions.reduce((sum, f) => sum + (f.success_rate || 0), 0);
    return `${Math.round(totalRate / flowsWithExecutions.length)}%`;
  };

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
      <PageHeader
        title="Automação"
        description="Crie e gerencie fluxos de automação para otimizar seu atendimento"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Automação' },
        ]}
        actions={
          <Button size="sm" onClick={() => setShowBuilder(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Fluxo
          </Button>
        }
      />

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Fluxos</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFlows}</div>
            <p className="text-xs text-muted-foreground">Fluxos criados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fluxos Ativos</CardTitle>
            <Play className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activeFlows}</div>
            <p className="text-xs text-muted-foreground">Executando automaticamente</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fluxos Inativos</CardTitle>
            <Pause className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{inactiveFlows}</div>
            <p className="text-xs text-muted-foreground">Pausados ou em configuração</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-600">{calculateSuccessRate()}</div>
            <p className="text-xs text-muted-foreground">Execuções bem-sucedidas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar fluxos de automação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {(['all', 'active', 'inactive'] as const).map((status) => (
                <Button
                  key={status}
                  variant={filterStatus === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus(status)}
                >
                  {status === 'all' ? 'Todos' : status === 'active' ? 'Ativos' : 'Inativos'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de fluxos */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4 rounded" />
                <Skeleton className="h-4 w-1/2 rounded" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredFlows.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={<Workflow className="h-10 w-10" />}
              title={
                searchTerm || filterStatus !== 'all'
                  ? 'Nenhum fluxo encontrado'
                  : 'Nenhum fluxo de automação criado'
              }
              description={
                searchTerm || filterStatus !== 'all'
                  ? 'Tente ajustar os filtros de busca'
                  : 'Crie seu primeiro fluxo para otimizar o atendimento'
              }
              action={
                !searchTerm && filterStatus === 'all'
                  ? { label: 'Criar Primeiro Fluxo', onClick: () => setShowBuilder(true), icon: <Plus className="h-4 w-4 mr-2" /> }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredFlows.map((flow) => {
            const TriggerIcon = getTriggerIcon(flow.trigger_type);
            const stepsCount = getStepsCount(flow.steps);

            return (
              <Card key={flow.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm font-semibold truncate">{flow.name}</CardTitle>
                        <Badge variant={flow.active ? 'default' : 'secondary'} className="text-xs">
                          {flow.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      {flow.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {flow.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TriggerIcon className="h-3.5 w-3.5" />
                    <span>{getTriggerName(flow.trigger_type)}</span>
                    <span className="ml-auto">{stepsCount} etapa{stepsCount !== 1 ? 's' : ''}</span>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Criado em {formatDate(flow.created_at)}
                  </p>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Editar"
                        onClick={() => {
                          setEditingFlow(flow.id);
                          setShowBuilder(true);
                        }}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Duplicar"
                        onClick={() => handleDuplicateFlow(flow)}
                        disabled={duplicateFlowMutation.isPending}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:text-destructive hover:bg-destructive/10"
                        title="Excluir"
                        onClick={() => setDeleteTarget(flow)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      variant={flow.active ? 'outline' : 'default'}
                      className="h-7 text-xs"
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        isOpen={deleteTarget !== null}
        onConfirm={handleDeleteFlow}
        onClose={() => setDeleteTarget(null)}
        title="Excluir Fluxo"
        description={`Tem certeza que deseja excluir o fluxo "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={deleteFlowMutation.isPending}
      />
    </div>
  );
};

export default Automation;
