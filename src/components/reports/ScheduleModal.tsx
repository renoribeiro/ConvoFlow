
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Schedule {
  id?: string;
  reportName: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: string;
  dayOfMonth?: number;
  time: string;
  deliveryMethods: ('email' | 'whatsapp' | 'dashboard')[];
  recipients: string[];
  isActive: boolean;
}

// Interface para dados do banco
interface DatabaseSchedule {
  id?: string;
  name: string;
  template_id: string;
  cron_expression: string;
  recipients: string[];
  parameters?: any;
  is_active: boolean;
  last_run?: string;
  next_run?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  report_templates?: {
    name: string;
    type: string;
  };
}

interface ScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
  onSave: (schedule: Schedule) => void;
}

const reportTemplates = [
  'Relatório de Performance Geral',
  'Análise de Fontes de Tráfego',
  'Relatório Financeiro',
  'Funil de Conversão',
  'Relatório Executivo',
  'Performance de Campanhas'
];

const daysOfWeek = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo'
];

export const ScheduleModal = ({ open, onOpenChange, schedule, onSave }: ScheduleModalProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Schedule>({
    reportName: '',
    frequency: 'weekly',
    time: '09:00',
    deliveryMethods: [],
    recipients: [],
    isActive: true
  });
  const [newRecipient, setNewRecipient] = useState('');

  // Função para converter cron expression para formato do modal
  const parseCronExpression = (cronExpr: string) => {
    // Formato básico: "0 9 * * 1" (todo segunda às 9h)
    // Para simplificar, vamos assumir alguns padrões comuns
    const parts = cronExpr.split(' ');
    if (parts.length >= 5) {
      const hour = parseInt(parts[1]) || 9;
      const minute = parseInt(parts[0]) || 0;
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      // Detectar frequência baseada no padrão
      if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
        return { frequency: 'daily' as const, time };
      } else if (parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
        return { frequency: 'weekly' as const, time, dayOfWeek: parts[4] };
      } else if (parts[2] !== '*' && parts[3] === '*' && parts[4] === '*') {
        return { frequency: 'monthly' as const, time, dayOfMonth: parseInt(parts[2]) };
      }
    }
    return { frequency: 'weekly' as const, time: '09:00' };
  };

  useEffect(() => {
    if (schedule) {
      // Se é um agendamento do banco de dados, converter para o formato do modal
      if ('cron_expression' in schedule) {
        const dbSchedule = schedule as any as DatabaseSchedule;
        const cronData = parseCronExpression(dbSchedule.cron_expression);
        setFormData({
          reportName: dbSchedule.report_templates?.name || dbSchedule.name,
          frequency: cronData.frequency,
          time: cronData.time,
          dayOfWeek: cronData.dayOfWeek,
          dayOfMonth: cronData.dayOfMonth,
          deliveryMethods: dbSchedule.parameters?.deliveryMethods || ['email'],
          recipients: dbSchedule.recipients || [],
          isActive: dbSchedule.is_active,
        });
      } else {
        setFormData(schedule);
      }
    } else {
      setFormData({
        reportName: '',
        frequency: 'weekly',
        time: '09:00',
        deliveryMethods: [],
        recipients: [],
        isActive: true
      });
    }
  }, [schedule, open]);

  const handleDeliveryMethodChange = (method: 'email' | 'whatsapp' | 'dashboard', checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        deliveryMethods: [...formData.deliveryMethods, method]
      });
    } else {
      setFormData({
        ...formData,
        deliveryMethods: formData.deliveryMethods.filter(m => m !== method)
      });
    }
  };

  const addRecipient = () => {
    if (newRecipient.trim() && !formData.recipients.includes(newRecipient.trim())) {
      setFormData({
        ...formData,
        recipients: [...formData.recipients, newRecipient.trim()]
      });
      setNewRecipient('');
    }
  };

  const removeRecipient = (recipient: string) => {
    setFormData({
      ...formData,
      recipients: formData.recipients.filter(r => r !== recipient)
    });
  };

  // Função para gerar cron expression baseada na frequência
  const generateCronExpression = () => {
    const [hour, minute] = formData.time.split(':').map(Number);
    
    switch (formData.frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        const dayOfWeek = formData.dayOfWeek || '1'; // Segunda-feira por padrão
        return `${minute} ${hour} * * ${dayOfWeek}`;
      case 'monthly':
        const dayOfMonth = formData.dayOfMonth || 1;
        return `${minute} ${hour} ${dayOfMonth} * *`;
      default:
        return `${minute} ${hour} * * 1`; // Segunda-feira por padrão
    }
  };

  const handleSave = async () => {
    // Validação dos campos obrigatórios
    if (!formData.reportName) {
      toast({
        title: 'Erro de Validação',
        description: 'Por favor, selecione um relatório.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.time) {
      toast({
        title: 'Erro de Validação',
        description: 'Por favor, defina um horário.',
        variant: 'destructive',
      });
      return;
    }

    if (formData.deliveryMethods.length === 0) {
      toast({
        title: 'Erro de Validação',
        description: 'Por favor, selecione pelo menos um método de entrega.',
        variant: 'destructive',
      });
      return;
    }

    if (formData.recipients.length === 0) {
      toast({
        title: 'Erro de Validação',
        description: 'Por favor, adicione pelo menos um destinatário.',
        variant: 'destructive',
      });
      return;
    }

    // Validação específica para frequência semanal
    if (formData.frequency === 'weekly' && !formData.dayOfWeek) {
      toast({
        title: 'Erro de Validação',
        description: 'Por favor, selecione o dia da semana.',
        variant: 'destructive',
      });
      return;
    }

    // Validação específica para frequência mensal
    if (formData.frequency === 'monthly' && !formData.dayOfMonth) {
      toast({
        title: 'Erro de Validação',
        description: 'Por favor, selecione o dia do mês.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Converter dados do modal para formato do banco
      const scheduleData = {
        name: formData.reportName,
        template_id: 'template_1', // Por enquanto usando um ID fixo
        cron_expression: generateCronExpression(),
        recipients: formData.recipients,
        parameters: {
          deliveryMethods: formData.deliveryMethods,
          frequency: formData.frequency,
          dayOfWeek: formData.dayOfWeek,
          dayOfMonth: formData.dayOfMonth,
        },
        is_active: formData.isActive,
      };
      
      console.log('Salvando agendamento:', scheduleData);
      await onSave(scheduleData as any);
      console.log('Agendamento salvo com sucesso');
      
      // Fechar o modal após salvar com sucesso
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao salvar agendamento. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {schedule ? 'Editar Agendamento' : 'Novo Agendamento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Relatório */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reportName">Relatório</Label>
              <Select
                value={formData.reportName}
                onValueChange={(value) => setFormData({...formData, reportName: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar relatório" />
                </SelectTrigger>
                <SelectContent>
                  {reportTemplates.map(template => (
                    <SelectItem key={template} value={template}>
                      {template}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Frequência e Horário */}
          <div className="space-y-4">
            <h3 className="font-medium">Configurações de Agendamento</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value: any) => setFormData({...formData, frequency: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({...formData, time: e.target.value})}
                />
              </div>
            </div>

            {/* Dia da Semana para Semanal */}
            {formData.frequency === 'weekly' && (
              <div className="space-y-2">
                <Label>Dia da Semana</Label>
                <Select
                  value={formData.dayOfWeek}
                  onValueChange={(value) => setFormData({...formData, dayOfWeek: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {daysOfWeek.map(day => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dia do Mês para Mensal */}
            {formData.frequency === 'monthly' && (
              <div className="space-y-2">
                <Label>Dia do Mês</Label>
                <Select
                  value={formData.dayOfMonth?.toString()}
                  onValueChange={(value) => setFormData({...formData, dayOfMonth: parseInt(value)})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({length: 28}, (_, i) => i + 1).map(day => (
                      <SelectItem key={day} value={day.toString()}>
                        Dia {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          {/* Métodos de Entrega */}
          <div className="space-y-4">
            <h3 className="font-medium">Métodos de Entrega</h3>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="email"
                  checked={formData.deliveryMethods.includes('email')}
                  onCheckedChange={(checked) => handleDeliveryMethodChange('email', checked as boolean)}
                />
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="whatsapp"
                  checked={formData.deliveryMethods.includes('whatsapp')}
                  onCheckedChange={(checked) => handleDeliveryMethodChange('whatsapp', checked as boolean)}
                />
                <label htmlFor="whatsapp" className="text-sm font-medium">
                  WhatsApp
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dashboard"
                  checked={formData.deliveryMethods.includes('dashboard')}
                  onCheckedChange={(checked) => handleDeliveryMethodChange('dashboard', checked as boolean)}
                />
                <label htmlFor="dashboard" className="text-sm font-medium">
                  Notificação no Dashboard
                </label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Destinatários */}
          <div className="space-y-4">
            <h3 className="font-medium">Destinatários</h3>
            
            <div className="flex gap-2">
              <Input
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                placeholder="Email ou número do WhatsApp"
                onKeyPress={(e) => e.key === 'Enter' && addRecipient()}
              />
              <Button onClick={addRecipient}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {formData.recipients.length > 0 && (
              <div className="space-y-2">
                <Label>Destinatários configurados:</Label>
                <div className="flex flex-wrap gap-2">
                  {formData.recipients.map((recipient, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {recipient}
                      <button onClick={() => removeRecipient(recipient)}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {schedule ? 'Atualizar' : 'Criar'} Agendamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
