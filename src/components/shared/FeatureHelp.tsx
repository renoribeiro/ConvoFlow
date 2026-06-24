/**
 * Botão de ajuda contextual. Mostra um ícone (?) que, ao clicar, abre um painel
 * lateral explicando o que a função faz, como configurá-la e um exemplo.
 *
 * O conteúdo vem de src/lib/help/featureHelp.ts, indexado por `helpKey`.
 * Se a chave não existir, nada é renderizado (degradação segura).
 */
import React from 'react';
import { HelpCircle, Lightbulb, ListChecks, Wand2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { getFeatureHelp } from '@/lib/help/featureHelp';
import { cn } from '@/lib/utils';

interface Props {
  helpKey: string;
  /** Classe extra para o botão (ex.: posicionamento). */
  className?: string;
}

export const FeatureHelp: React.FC<Props> = ({ helpKey, className }) => {
  const entry = getFeatureHelp(helpKey);
  if (!entry) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Ajuda: ${entry.title}`}
          title={`Como funciona: ${entry.title}`}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors',
            className,
          )}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{entry.title}</SheetTitle>
          <SheetDescription>{entry.whatItDoes}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 text-sm">
          <section className="space-y-2">
            <h4 className="flex items-center gap-2 font-medium text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              Como configurar
            </h4>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              {entry.howToConfigure.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>

          {entry.example && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <Wand2 className="h-4 w-4 text-primary" />
                Exemplo
              </h4>
              <p className="rounded-md bg-muted p-3 text-muted-foreground">{entry.example}</p>
            </section>
          )}

          {entry.tips && entry.tips.length > 0 && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Dicas
              </h4>
              <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                {entry.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default FeatureHelp;
