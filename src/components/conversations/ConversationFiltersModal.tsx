import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Filter, X } from 'lucide-react';

interface ConversationFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FilterState {
  status: string;
  assignedTo: string;
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  tags: string[];
  hasUnread: boolean;
  priority: string;
}

export function ConversationFiltersModal({ isOpen, onClose }: ConversationFiltersModalProps) {
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    assignedTo: 'all',
    dateRange: {
      from: null,
      to: null
    },
    tags: [],
    hasUnread: false,
    priority: 'all'
  });

  const statusOptions = [
    { value: 'all', label: 'Todos os Status' },
    { value: 'open', label: 'Abertas' },
    { value: 'pending', label: 'Pendentes' },
    { value: 'resolved', label: 'Resolvidas' },
    { value: 'closed', label: 'Fechadas' }
  ];

  const assignedOptions = [
    { value: 'all', label: 'Todos os Agentes' },
    { value: 'me', label: 'Atribuídas a mim' },
    { value: 'unassigned', label: 'Não atribuídas' },
    { value: 'agent1', label: 'João Silva' },
    { value: 'agent2', label: 'Maria Santos' }
  ];

  const priorityOptions = [
    { value: 'all', label: 'Todas as Prioridades' },
    { value: 'high', label: 'Alta' },
    { value: 'medium', label: 'Média' },
    { value: 'low', label: 'Baixa' }
  ];

  const availableTags = [
    'Suporte',
    'Vendas',
    'Urgente',
    'Follow-up',
    'Reclamação',
    'Elogio'
  ];

  const handleTagToggle = (tag: string) => {
    setFilters(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const handleApplyFilters = () => {
    // Aqui você aplicaria os filtros às conversas
    console.log('Aplicando filtros:', filters);
    toast.success('Filtros aplicados com sucesso!');
    onClose();
  };

  const handleClearFilters = () => {
    setFilters({
      status: 'all',
      assignedTo: 'all',
      dateRange: {
        from: null,
        to: null
      },
      tags: [],
      hasUnread: false,
      priority: 'all'
    });
    toast.success('Filtros limpos!');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtrar Conversas
          </DialogTitle>
          <DialogDescription>
            Configure os filtros para encontrar conversas específicas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status */}
          <div className="space-y-2">
            <Label>Status da Conversa</Label>
            <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Atribuição */}
          <div className="space-y-2">
            <Label>Atribuído a</Label>
            <Select value={filters.assignedTo} onValueChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignedOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prioridade */}
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={filters.priority} onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="grid grid-cols-2 gap-2">
              {availableTags.map(tag => (
                <div key={tag} className="flex items-center space-x-2">
                  <Checkbox
                    id={tag}
                    checked={filters.tags.includes(tag)}
                    onCheckedChange={() => handleTagToggle(tag)}
                  />
                  <Label htmlFor={tag} className="text-sm">
                    {tag}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Mensagens não lidas */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasUnread"
              checked={filters.hasUnread}
              onCheckedChange={(checked) => setFilters(prev => ({ ...prev, hasUnread: !!checked }))}
            />
            <Label htmlFor="hasUnread">
              Apenas conversas com mensagens não lidas
            </Label>
          </div>

          {/* Período */}
          <div className="space-y-2">
            <Label>Período</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">De</Label>
                <DatePicker
                  date={filters.dateRange.from}
                  onDateChange={(date) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, from: date }
                  }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Até</Label>
                <DatePicker
                  date={filters.dateRange.to}
                  onDateChange={(date) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, to: date }
                  }))}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={handleClearFilters}>
            <X className="w-4 h-4 mr-2" />
            Limpar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleApplyFilters}>
              Aplicar Filtros
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}