
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScheduleModal } from './ScheduleModal';
import { Calendar, Clock, Mail, MessageSquare, MoreHorizontal, Plus, Edit } from 'lucide-react';

interface Schedule {
  id: string;
  reportName: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: string;
  dayOfMonth?: number;
  time: string;
  deliveryMethods: ('email' | 'whatsapp' | 'dashboard')[];
  recipients: string[];
  isActive: boolean;
  lastRun?: string;
  nextRun: string;
}

const mockSchedules: Schedule[] = [
  {
    id: '1',
    reportName: 'Relatório de Performance Geral',
    frequency: 'weekly',
    dayOfWeek: 'Segunda-feira',
    time: '09:00',
    deliveryMethods: ['email', 'whatsapp'],
    recipients: ['joao@empresa.com', '+55 11 99999-0000'],
    isActive: true,
    lastRun: '18 de Novembro, 2024',
    nextRun: '25 de Novembro, 2024'
  },
  {
    id: '2',
    reportName: 'Análise de Fontes de Tráfego',
    frequency: 'daily',
    time: '08:30',
    deliveryMethods: ['email'],
    recipients: ['marketing@empresa.com'],
    isActive: true,
    lastRun: '20 de Novembro, 2024',
    nextRun: '21 de Novembro, 2024'
  },
  {
    id: '3',
    reportName: 'Relatório Financeiro',
    frequency: 'monthly',
    dayOfMonth: 1,
    time: '10:00',
    deliveryMethods: ['email', 'dashboard'],
    recipients: ['financeiro@empresa.com'],
    isActive: false,
    nextRun: '1 de Dezembro, 2024'
  },
  {
    id: '4',
    reportName: 'Funil de Conversão',
    frequency: 'weekly',
    dayOfWeek: 'Sexta-feira',
    time: '17:00',
    deliveryMethods: ['whatsapp'],
    recipients: ['+55 11 88888-0000'],
    isActive: true,
    lastRun: '15 de Novembro, 2024',
    nextRun: '22 de Novembro, 2024'
  }
];

const getFrequencyLabel = (frequency: string) => {
  const labels = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    quarterly: 'Trimestral'
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
  const [schedules, setSchedules] = useState<Schedule[]>(mockSchedules);
  const [showModal, setShowModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  const toggleScheduleStatus = (id: string) => {
    setSchedules(schedules.map(schedule => 
      schedule.id === id ? { ...schedule, isActive: !schedule.isActive } : schedule
    ));
  };

  const handleEdit = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setShowModal(true);
  };

  const handleSave = (scheduleData: any) => {
    if (selectedSchedule) {
      setSchedules(schedules.map(s => 
        s.id === selectedSchedule.id ? { ...s, ...scheduleData } : s
      ));
    } else {
      const newSchedule = {
        ...scheduleData,
        id: Date.now().toString(),
        lastRun: undefined,
        nextRun: 'Próximo agendamento calculado'
      };
      setSchedules([...schedules, newSchedule]);
    }
    setShowModal(false);
    setSelectedSchedule(null);
  };

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
                <p className="text-2xl font-bold">{schedules.length}</p>
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
                <p className="text-2xl font-bold text-green-600">
                  {schedules.filter(s => s.isActive).length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Por Email</p>
                <p className="text-2xl font-bold text-blue-600">
                  {schedules.filter(s => s.deliveryMethods.includes('email')).length}
                </p>
              </div>
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">WhatsApp</p>
                <p className="text-2xl font-bold text-green-600">
                  {schedules.filter(s => s.deliveryMethods.includes('whatsapp')).length}
                </p>
              </div>
              <MessageSquare className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedules List */}
      <div className="space-y-4">
        {schedules.map((schedule) => (
          <Card key={schedule.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{schedule.reportName}</h3>
                    <Badge variant={schedule.isActive ? 'default' : 'secondary'}>
                      {schedule.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant="outline">
                      {getFrequencyLabel(schedule.frequency)}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>
                        {schedule.frequency === 'daily' && `Diário às ${schedule.time}`}
                        {schedule.frequency === 'weekly' && `${schedule.dayOfWeek} às ${schedule.time}`}
                        {schedule.frequency === 'monthly' && `Dia ${schedule.dayOfMonth} às ${schedule.time}`}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {schedule.deliveryMethods.map(method => (
                          <span key={method} className="flex items-center gap-1">
                            {getMethodIcon(method)}
                          </span>
                        ))}
                      </div>
                      <span>{schedule.deliveryMethods.length} método(s)</span>
                    </div>
                    
                    <div>
                      <span>Próximo envio: {schedule.nextRun}</span>
                    </div>
                  </div>

                  {schedule.lastRun && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Último envio: {schedule.lastRun}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={schedule.isActive}
                    onCheckedChange={() => toggleScheduleStatus(schedule.id)}
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

      <ScheduleModal
        open={showModal}
        onOpenChange={setShowModal}
        schedule={selectedSchedule}
        onSave={handleSave}
      />
    </div>
  );
};
