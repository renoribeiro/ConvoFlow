
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

interface Schedule {
  id?: string;
  reportName: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: string;
  dayOfMonth?: number;
  time: string;
  deliveryMethods: ('email' | 'whatsapp' | 'dashboard')[];
  recipients: string[];
  isActive: boolean;
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
  const [formData, setFormData] = useState<Schedule>({
    reportName: '',
    frequency: 'weekly',
    time: '09:00',
    deliveryMethods: [],
    recipients: [],
    isActive: true
  });
  const [newRecipient, setNewRecipient] = useState('');

  useEffect(() => {
    if (schedule) {
      setFormData(schedule);
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

  const handleSave = () => {
    if (!formData.reportName || !formData.time || formData.deliveryMethods.length === 0) {
      return;
    }
    onSave(formData);
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
                    <SelectItem value="quarterly">Trimestral</SelectItem>
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
