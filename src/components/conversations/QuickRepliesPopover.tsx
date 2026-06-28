import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface QuickReply {
  id: string;
  title: string;
  content: string;
}

/**
 * Static quick replies. A `quick_replies` table (per-tenant, customizable) should
 * replace this constant once it exists in Supabase — see the upgrade report.
 */
export const QUICK_REPLIES: QuickReply[] = [
  { id: '1', title: 'Saudação', content: 'Olá! Tudo bem? Como posso te ajudar?' },
  { id: '2', title: 'Agradecimento', content: 'Muito obrigado pelo contato! Vou verificar e te retorno em breve.' },
  { id: '3', title: 'Ausência', content: 'No momento estou indisponível, mas retorno assim que possível.' },
  { id: '4', title: 'Confirmação', content: 'Perfeito, confirmado! Qualquer dúvida é só chamar.' },
  { id: '5', title: 'Encerramento', content: 'Obrigado pela preferência! Se precisar de algo mais, estou à disposição.' },
];

interface QuickRepliesPopoverProps {
  /** Called with the selected reply content. Fills the textarea — does NOT auto-send. */
  onSelect: (content: string) => void;
  /** Controlled open state (parent opens it when the user types "/" in an empty textarea). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

export function QuickRepliesPopover({ onSelect, open, onOpenChange, disabled }: QuickRepliesPopoverProps) {
  const handleSelect = (reply: QuickReply) => {
    onSelect(reply.content);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label="Respostas rápidas"
            >
              <Zap className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Respostas rápidas <span className="opacity-60">(digite /)</span>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" side="top" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Buscar resposta rápida..." />
          <CommandList>
            <CommandEmpty>Nenhuma resposta encontrada.</CommandEmpty>
            <CommandGroup heading="Respostas rápidas">
              {QUICK_REPLIES.map((reply) => (
                <CommandItem
                  key={reply.id}
                  value={`${reply.title} ${reply.content}`}
                  onSelect={() => handleSelect(reply)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="text-sm font-medium">{reply.title}</span>
                  <span className="text-xs text-muted-foreground line-clamp-1">{reply.content}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
