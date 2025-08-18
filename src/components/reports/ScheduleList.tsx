
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScheduleModal } from './ScheduleModal';
import { 
  useReportSchedules, 
  useCreateReportSchedule, 
  useUpdateReportSchedule, 
  useDeleteReportSchedule, 
  useToggleReportSchedule 
} from '@/hooks/useReports';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Mail, MessageSquare, MoreHorizontal, Plus, Edit, AlertCircle } from 'lucide-react';

// Tipos baseados no schema do banco
interface Schedule {
  id: string;
  name: string;
  template_id: string;
  cron_expression: string;
  recipients: string[];
  parameters?: any;
  is_active: boolean;
  last_run?: string;
  next_run?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  report_templates?: {
    name: string;
    type: string;
  };
}

// Função para detectar frequência baseada na cron expression
const getFrequencyFromCron = (cronExpr: string) => {
  const parts = cronExpr.split(' ');
  if (parts.length >= 5) {
    if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      return 'daily';
    } else if (parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
      return 'weekly';
    } else if (parts[2] !== '*' && parts[3] === '*' && parts[4] === '*') {
      return 'monthly';
    }
  }
  return 'unknown';
};

const getFrequencyLabel = (frequency: string) => {
  const labels = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    unknown: 'Personalizado'
  };
  return labels[frequency as keyof typeof labels] || frequency;
};

const getMethodIcon = (method: string) => {
  switch (method) {
    case 'email': return <Mail className="w-4 h-4" />;
    case 'whatsapp': return <MessageSquare className="w-4 h-4" />;
    default: return null;
  }
};

export const ScheduleList = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const { toast } = useToast();
  
  // Buscar agendamentos do banco de dados
  const { data: schedules = [], isLoading, error } = useReportSchedules();
  
  // Mutations para gerenciar agendamentos
  const createScheduleMutation = useCreateReportSchedule();
  const updateScheduleMutation = useUpdateReportSchedule();
  const deleteScheduleMutation = useDeleteReportSchedule();
  const toggleScheduleMutation = useToggleReportSchedule();

  const handleEdit = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setShowModal(true);
  };

  const handleSave = async (scheduleData: any) => {
    try {
      console.log('Iniciando salvamento de agendamento:', scheduleData);
      
      if (selectedSchedule) {
        // Atualizar agendamento existente
        console.log('Atualizando agendamento existente:', selectedSchedule.id);
        await updateScheduleMutation.mutateAsync({
          id: selectedSchedule.id,
          name: scheduleData.reportName,
          cron_expression: scheduleData.cron_expression,
          recipients: scheduleData.recipients,
          parameters: {
            deliveryMethods: scheduleData.deliveryMethods,
            frequency: scheduleData.frequency,
            dayOfWeek: scheduleData.dayOfWeek,
            dayOfMonth: scheduleData.dayOfMonth,
            time: scheduleData.time
          },
          is_active: scheduleData.isActive,
        });
        console.log('Agendamento atualizado com sucesso');
      } else {
        // Criar novo agendamento
        console.log('Criando novo agendamento');
        const newSchedule = await createScheduleMutation.mutateAsync({
          name: scheduleData.reportName,
          template_id: 'default_template', // TODO: Permitir seleção de template
          cron_expression: scheduleData.cron_expression,
          recipients: scheduleData.recipients,
          parameters: {
            deliveryMethods: scheduleData.deliveryMethods,
            frequency: scheduleData.frequency,
            dayOfWeek: scheduleData.dayOfWeek,
            dayOfMonth: scheduleData.dayOfMonth,
            time: scheduleData.time
          },
          is_active: scheduleData.isActive,
        });
        console.log('Novo agendamento criado:', newSchedule);
      }
      
      // Fechar modal e limpar seleção apenas após sucesso
      setShowModal(false);
      setSelectedSchedule(null);
      
      toast({
        title: 'Sucesso',
        description: selectedSchedule ? 'Agendamento atualizado com sucesso!' : 'Agendamento criado com sucesso!',
      });
      
    } catch (error) {
      console.error('Erro detalhado ao salvar agendamento:', error);
      
      // Propagar o erro para que o ScheduleModal possa tratá-lo
      throw error;
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar agendamentos: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agendamentos</h2>
          <p className="text-muted-foreground">
            Configure envios automáticos de relatórios
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{schedules.length}</p>
                )}
              </div>
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Ativos</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">
                    {schedules.filter(s => s.is_active).length}
                  </p>
                )}
              </div>
              <Clock className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Diários</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold text-blue-600">
                    {schedules.filter(s => getFrequencyFromCron(s.cron_expression) === 'daily').length}
                  </p>
                )}
              </div>
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Semanais</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">
                    {schedules.filter(s => getFrequencyFromCron(s.cron_expression) === 'weekly').length}
                  </p>
                )}
              </div>
              <MessageSquare className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-36" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Schedules List */}
      {!isLoading && schedules.length > 0 && (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <Card key={schedule.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {schedule.report_templates?.name || schedule.name}
                      </h3>
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                        {schedule.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline">
                        {getFrequencyLabel(getFrequencyFromCron(schedule.cron_expression))}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>
                          {schedule.cron_expression || 'Horário não definido'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <span>{schedule.recipients?.length || 0} destinatário(s)</span>
                      </div>
                      
                      <div>
                        <span>
                          Próximo: {schedule.next_run ? 
                            new Date(schedule.next_run).toLocaleDateString('pt-BR') : 
                            'Não agendado'
                          }
                        </span>
                      </div>
                    </div>

                    {schedule.last_run && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        Último envio: {new Date(schedule.last_run).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={schedule.is_active}
                      onCheckedChange={(checked) => {
                        toggleScheduleMutation.mutate({
                          id: schedule.id,
                          isActive: checked,
                        });
                      }}
                      disabled={toggleScheduleMutation.isPending}
                    />
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEdit(schedule)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && schedules.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum agendamento encontrado</h3>
            <p className="text-muted-foreground mb-4">
              Crie seu primeiro agendamento para automatizar o envio de relatórios.
            </p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Agendamento
            </Button>
          </CardContent>
        </Card>
      )}

      <ScheduleModal
        open={showModal}
        onOpenChange={setShowModal}
        schedule={selectedSchedule}
        onSave={handleSave}
      />
    </div>
  );
};
