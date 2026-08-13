import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { visibleQuickFilters, type QuickFilterCounts, type QuickFilterType } from './quickFilters';

interface QuickFilterPillsProps {
  value: QuickFilterType;
  onChange: (value: QuickFilterType) => void;
  /** Contagens do conjunto carregado. Chave ausente = sem contagem conhecida. */
  counts?: QuickFilterCounts;
  /** Sinalização de SLA da Loja. Desligada, a pílula "Não respondidas" não existe. */
  slaEnabled?: boolean;
  className?: string;
}

/** Verde-limão da pílula ativa e o quase-preto que fica legível em cima dele. */
const ACTIVE_BG = '#DAE27C';
const ACTIVE_FG = '#211E0B';

/** Id compartilhado da animação — o fundo "desliza" entre as pílulas. */
const ACTIVE_LAYOUT_ID = 'conversations-quick-filter-active';

export const QuickFilterPills = ({
  value,
  onChange,
  counts = {},
  slaEnabled = false,
  className,
}: QuickFilterPillsProps) => {
  const reduceMotion = useReducedMotion();
  const filters = visibleQuickFilters(slaEnabled);

  return (
    <div
      role="group"
      aria-label="Filtros rápidos de conversas"
      className={cn(
        'flex items-center gap-2 overflow-x-auto snap-x snap-mandatory',
        // Rola de lado quando não cabe (a coluna da lista tem 320px no desktop)
        // sem deixar barra à mostra em nenhum navegador.
        '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {filters.map(({ id, label, hint }) => {
        const isActive = value === id;
        const count = counts[id];

        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={isActive}
                // Clicar na pílula já ativa desfaz o filtro e volta para "Todas".
                onClick={() => onChange(isActive ? 'todas' : id)}
                className={cn(
                  'relative h-8 flex-shrink-0 snap-start rounded-full border px-3 text-xs font-medium',
                  isActive
                    ? 'border-transparent hover:bg-transparent'
                    : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
                style={isActive ? { color: ACTIVE_FG } : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId={ACTIVE_LAYOUT_ID}
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: ACTIVE_BG }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                  {label}
                  {count !== undefined && (
                    <Badge
                      variant="secondary"
                      className="h-4 min-w-[1rem] justify-center rounded-full border-transparent px-1 text-[10px] font-semibold"
                      style={
                        isActive
                          ? { backgroundColor: 'rgba(33, 30, 11, 0.14)', color: ACTIVE_FG }
                          : undefined
                      }
                    >
                      {count}
                    </Badge>
                  )}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};
