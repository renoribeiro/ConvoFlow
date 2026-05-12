import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Separator } from '@/components/ui/separator';
import { Filter, X } from 'lucide-react';

export interface ConversationsFilterState {
  hasUnread: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  isArchived: boolean;
}

export const DEFAULT_FILTER_STATE: ConversationsFilterState = {
  hasUnread: false,
  dateFrom: null,
  dateTo: null,
  isArchived: false,
};

interface ConversationFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: ConversationsFilterState;
  onChange: (next: ConversationsFilterState) => void;
}

export function ConversationFiltersModal({ isOpen, onClose, value, onChange }: ConversationFiltersModalProps) {
  const update = (patch: Partial<ConversationsFilterState>) => onChange({ ...value, ...patch });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtrar Conversas
          </DialogTitle>
          <DialogDescription>
            Os filtros são aplicados imediatamente à lista. Filtros avançados
            (status/agentes/tags) requerem que essas colunas sejam adicionadas
            em <code>conversations</code> antes de serem expostos aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasUnread"
              checked={value.hasUnread}
              onCheckedChange={(checked) => update({ hasUnread: !!checked })}
            />
            <Label htmlFor="hasUnread">Apenas conversas com mensagens não lidas</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isArchived"
              checked={value.isArchived}
              onCheckedChange={(checked) => update({ isArchived: !!checked })}
            />
            <Label htmlFor="isArchived">Mostrar arquivadas</Label>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Período (last_message_at)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">De</Label>
                <DatePicker
                  date={value.dateFrom ?? undefined}
                  onDateChange={(date) => update({ dateFrom: date ?? null })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Até</Label>
                <DatePicker
                  date={value.dateTo ?? undefined}
                  onDateChange={(date) => update({ dateTo: date ?? null })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => onChange(DEFAULT_FILTER_STATE)}>
            <X className="w-4 h-4 mr-2" />
            Limpar
          </Button>
          <Button onClick={onClose}>Aplicar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
