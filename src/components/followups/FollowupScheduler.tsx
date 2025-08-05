
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, Clock, Phone, Mail, MessageSquare, User, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FollowupSchedulerProps {
  onClose: () => void;
}

const followupTypes = [
  { id: 'call', name: 'Ligação', icon: Phone, description: 'Fazer uma ligação telefônica' },
  { id: 'email', name: 'Email', icon: Mail, description: 'Enviar um email' },
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, description: 'Enviar mensagem no WhatsApp' }
];

const taskTemplates = [
  'Ligar para apresentar nova proposta',
  'Enviar material complementar por email', 
  'Follow-up sobre proposta enviada',
  'Verificar interesse no produto/serviço',
  'Agendar reunião de apresentação',
  'Solicitar feedback sobre atendimento'
];

const contacts = [
  { id: '1', name: 'Ana Silva', phone: '+55 11 99999-1111' },
  { id: '2', name: 'Carlos Santos', phone: '+55 11 99999-2222' },
  { id: '3', name: 'Maria Oliveira', phone: '+55 11 99999-3333' },
  { id: '4', name: 'João Pereira', phone: '+55 11 99999-4444' }
];

export const FollowupScheduler = ({ onClose }: FollowupSchedulerProps) => {
  const [formData, setFormData] = useState({
    contactId: '',
    task: '',
    type: '',
    priority: 'medium',
    date: undefined as Date | undefined,
    time: '',
    notes: '',
    recurring: false,
    recurringType: 'weekly',
    recurringCount: 1
  });

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const handleSave = () => {
    console.log('Scheduling followup:', formData);
    onClose();
  };

  const fillTemplate = (template: string) => {
    setFormData({ ...formData, task: template });
  };

  const selectedContact = contacts.find(c => c.id === formData.contactId);
  const selectedType = followupTypes.find(t => t.id === formData.type);

  const canSave = formData.contactId && formData.task && formData.type && formData.date && formData.time;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agendar Novo Follow-up</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Seleção de contato */}
          <div>
            <Label htmlFor="contact">Contato</Label>
            <Select value={formData.contactId} onValueChange={(value) => setFormData({...formData, contactId: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um contato" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <div>
                        <div className="font-medium">{contact.name}</div>
                        <div className="text-xs text-muted-foreground">{contact.phone}</div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de follow-up */}
          <div>
            <Label>Tipo de Follow-up</Label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {followupTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Card
                    key={type.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      formData.type === type.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setFormData({...formData, type: type.id})}
                  >
                    <CardContent className="p-4 text-center">
                      <Icon className="w-6 h-6 mx-auto mb-2 text-primary" />
                      <h4 className="font-medium text-sm">{type.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Tarefa */}
          <div>
            <Label htmlFor="task">Descrição da Tarefa</Label>
            <Textarea
              id="task"
              value={formData.task}
              onChange={(e) => setFormData({...formData, task: e.target.value})}
              placeholder="Descreva o que deve ser feito..."
            />
            <div className="mt-2">
              <p className="text-sm text-muted-foreground mb-2">Templates sugeridos:</p>
              <div className="flex flex-wrap gap-1">
                {taskTemplates.map((template, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent text-xs"
                    onClick={() => fillTemplate(template)}
                  >
                    {template}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Data e hora */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data</Label>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? format(formData.date, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={(date) => {
                      setFormData({...formData, date});
                      setIsDatePickerOpen(false);
                    }}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="time">Hora</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="time"
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({...formData, time: e.target.value})}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Prioridade */}
          <div>
            <Label>Prioridade</Label>
            <Select value={formData.priority} onValueChange={(value) => setFormData({...formData, priority: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recorrência */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Repeat className="w-5 h-5" />
                  Follow-up Recorrente
                </CardTitle>
                <Switch
                  checked={formData.recurring}
                  onCheckedChange={(checked) => setFormData({...formData, recurring: checked})}
                />
              </div>
            </CardHeader>
            {formData.recurring && (
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Frequência</Label>
                    <Select value={formData.recurringType} onValueChange={(value) => setFormData({...formData, recurringType: value})}>
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
                  <div>
                    <Label htmlFor="recurringCount">Repetições</Label>
                    <Input
                      id="recurringCount"
                      type="number"
                      min="1"
                      max="12"
                      value={formData.recurringCount}
                      onChange={(e) => setFormData({...formData, recurringCount: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Notas adicionais */}
          <div>
            <Label htmlFor="notes">Notas Adicionais</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Informações extras sobre este follow-up..."
            />
          </div>

          {/* Preview */}
          {canSave && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Preview do Follow-up</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{selectedContact?.name}</span>
                  <span className="text-muted-foreground">({selectedContact?.phone})</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedType && <selectedType.icon className="w-4 h-4 text-muted-foreground" />}
                  <span>{formData.task}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {formData.date && format(formData.date, "PPP", { locale: ptBR })} às {formData.time}
                  </span>
                </div>
                {formData.recurring && (
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-muted-foreground" />
                    <span>Repetir {formData.recurringType} por {formData.recurringCount} vezes</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              Agendar Follow-up
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
