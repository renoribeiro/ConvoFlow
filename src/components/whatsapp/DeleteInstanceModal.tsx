import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';
import { SUPORTE_EMAIL } from '@/lib/billing/checkout';
import { Loader2, AlertTriangle, Trash2, ShieldCheck } from 'lucide-react';

/**
 * Excluir instância.
 *
 * QUEM DECIDE É O BANCO. Ao abrir, o modal chama a RPC
 * `whatsapp_instance_delete_preview` e mostra os números reais do que a
 * instância guarda. Se houver qualquer histórico, a exclusão é RECUSADA — o
 * botão de excluir nem aparece. Só instância vazia oferece o botão, e a
 * exclusão em si passa pela edge function `delete-whatsapp-instance`, que
 * chama a RPC `delete_whatsapp_instance` (uma transação: ou apaga tudo, ou
 * nada) e só depois encerra a sessão no provedor.
 *
 * Não existe mais laço de DELETE no navegador. O antigo apagava mensagens e
 * conversas (que o RLS deixava passar até para atendente), falhava na linha
 * da instância e ainda mostrava "sucesso".
 */

type ProviderType = 'evolution' | 'waha' | 'official';

interface WhatsAppInstance {
  id: string;
  name: string;
  instance_key: string;
  phone_number?: string;
  profile_name?: string;
  status: 'close' | 'open' | 'connecting' | string;
  provider?: ProviderType | null;
}

export interface DeleteInstanceCounts {
  conversations: number;
  messages: number;
  contacts: number;
  chatbots: number;
  chatbot_sessions: number;
  campaigns: number;
  followups: number;
  followup_enrollments: number;
  followup_sequences: number;
}

export type DeletePreviewReason = 'empty' | 'has_history' | 'forbidden' | 'not_found' | 'unauthenticated';

export interface DeletePreview {
  ok: boolean;
  reason: DeletePreviewReason;
  message?: string;
  counts?: DeleteInstanceCounts;
  total?: number;
  access?: 'superadmin' | 'own_tenant' | 'gerente_child_store';
}

interface DeleteInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance;
  onSuccess: () => void;
}

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; preview: DeletePreview };

/** Linhas da tabela de contagem, na ordem em que aparecem. */
export const COUNT_ROWS: Array<{ key: keyof DeleteInstanceCounts | 'followups_all'; label: string }> = [
  { key: 'conversations', label: 'Conversas' },
  { key: 'messages', label: 'Mensagens' },
  { key: 'contacts', label: 'Contatos' },
  { key: 'chatbots', label: 'Chatbots' },
  { key: 'chatbot_sessions', label: 'Sessões de chatbot' },
  { key: 'campaigns', label: 'Campanhas' },
  { key: 'followups_all', label: 'Follow-ups' },
];

export function countFor(counts: DeleteInstanceCounts, key: (typeof COUNT_ROWS)[number]['key']): number {
  if (key === 'followups_all') {
    return (counts.followups ?? 0) + (counts.followup_enrollments ?? 0) + (counts.followup_sequences ?? 0);
  }
  return counts[key] ?? 0;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

/** O que acontece no provedor — por provedor, sem mentir para a Meta. */
export function providerEffectLines(provider: ProviderType | null | undefined): string[] {
  const p = provider || 'evolution';
  if (p === 'official') {
    return [
      'Na Meta, nada muda: o número continua registrado lá e o app do ConvoFlow continua inscrito na sua conta do WhatsApp Business.',
      'O que é apagado é o vínculo aqui: a instância e o token de acesso guardado no cofre.',
    ];
  }
  if (p === 'waha') {
    return [
      'A sessão é apagada no seu servidor WAHA, com o endereço e a chave desta instância. O servidor continua seu.',
      'A instância é apagada do ConvoFlow.',
    ];
  }
  return [
    'A sessão é encerrada e a instância é apagada do servidor WhatsApp da plataforma (Evolution).',
    'A instância é apagada do ConvoFlow.',
  ];
}

export const DeleteInstanceModal = ({ open, onOpenChange, instance, onSuccess }: DeleteInstanceModalProps) => {
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' });
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const loadPreview = useCallback(async () => {
    setPreview({ kind: 'loading' });
    try {
      // types.ts ainda não conhece a RPC (mesmo cast de loja_message_counts).
      const { data, error } = await (supabase as any).rpc('whatsapp_instance_delete_preview', {
        p_instance_id: instance.id,
      });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== 'object' || typeof data.ok !== 'boolean') {
        throw new Error('Resposta inesperada ao conferir a instância.');
      }
      setPreview({ kind: 'loaded', preview: data as DeletePreview });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível conferir a instância.';
      logger.error('Falha no preview de exclusão de instância', { instanceId: instance.id, error: message });
      setPreview({ kind: 'error', message });
    }
  }, [instance.id]);

  useEffect(() => {
    if (open) void loadPreview();
  }, [open, loadPreview]);

  const handleDelete = async () => {
    if (preview.kind !== 'loaded' || !preview.preview.ok) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-whatsapp-instance', {
        body: { instance_id: instance.id },
      });
      if (error) {
        throw new Error(await mensagemDaEdgeFunction(error, 'Não foi possível excluir a instância.'));
      }
      if (!data || data.ok !== true) {
        // Recusa que o preview não viu (ex.: mensagem chegou no meio). Nada foi
        // apagado; recarregar o preview mostra o motivo com os números.
        const message = data?.error || 'Exclusão recusada. Nada foi apagado.';
        toast({ title: 'Exclusão recusada', description: message, variant: 'destructive' });
        await loadPreview();
        return;
      }

      if (data.provider_cleanup === 'failed') {
        toast({
          title: 'Instância excluída do ConvoFlow',
          description:
            'Mas o servidor do provedor não confirmou o encerramento da sessão. Nada precisa ser refeito aqui; avise quem opera a plataforma.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Instância excluída', description: 'Nenhum histórico foi apagado: a instância estava vazia.' });
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível excluir a instância.';
      logger.error('Erro ao excluir instância', { instanceId: instance.id, error: message });
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const loaded = preview.kind === 'loaded' ? preview.preview : null;
  const canDelete = !!loaded && loaded.ok === true;
  const refusedWithHistory = !!loaded && !loaded.ok && loaded.reason === 'has_history';
  const refusedOther = !!loaded && !loaded.ok && loaded.reason !== 'has_history';
  const providerLabel =
    instance.provider === 'official' ? 'API Oficial (Meta)' : instance.provider === 'waha' ? 'WAHA' : 'Evolution';

  const renderCounts = (counts: DeleteInstanceCounts) => (
    <div className="rounded-lg border divide-y text-sm" data-testid="delete-counts">
      {COUNT_ROWS.map((row) => {
        const n = countFor(counts, row.key);
        return (
          <div key={row.key} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-muted-foreground">{row.label}</span>
            <span className={n > 0 ? 'font-semibold text-red-700' : 'font-medium'}>{fmt(n)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!deleting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Excluir instância
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
            <div className="flex justify-between gap-4">
              <span className="font-medium">Nome</span>
              <span className="text-right">{instance.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium">Chave</span>
              <code className="bg-background px-2 py-0.5 rounded text-xs">{instance.instance_key}</code>
            </div>
            {instance.phone_number && (
              <div className="flex justify-between gap-4">
                <span className="font-medium">Número</span>
                <span>{instance.phone_number}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="font-medium">Provedor</span>
              <span>{providerLabel}</span>
            </div>
          </div>

          {preview.kind === 'loading' && (
            <div className="space-y-2" data-testid="delete-preview-loading">
              <p className="text-sm text-muted-foreground">Conferindo o que esta instância guarda…</p>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {preview.kind === 'error' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Não deu para conferir a instância</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{preview.message}</p>
                <p>Sem essa conferência, a exclusão não é oferecida.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadPreview()}>
                  Tentar de novo
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {refusedWithHistory && loaded?.counts && (
            <>
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Exclusão recusada: esta instância guarda histórico</AlertTitle>
                <AlertDescription className="text-red-800">
                  Excluir apagaria tudo o que está abaixo, sem volta. Por isso o ConvoFlow não exclui
                  instância com histórico — e não há como forçar.
                </AlertDescription>
              </Alert>
              {renderCounts(loaded.counts)}
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
                <p className="font-medium">O que fazer em vez de excluir</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>
                    Quer usar este número de novo, ou trocar a conexão? Isso é <strong>reconectar</strong>, não
                    excluir. A reconexão sem perder o histórico está chegando; até lá, escreva para{' '}
                    <a className="underline" href={`mailto:${SUPORTE_EMAIL}`}>{SUPORTE_EMAIL}</a> antes de
                    mexer.
                  </li>
                  {(!instance.provider || instance.provider === 'evolution') && (
                    <li>Quer só parar de receber por este número? Use "Desconectar" na linha da instância; o histórico fica.</li>
                  )}
                </ul>
              </div>
            </>
          )}

          {refusedOther && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Exclusão recusada</AlertTitle>
              <AlertDescription>{loaded?.message || 'Você não pode excluir esta instância.'}</AlertDescription>
            </Alert>
          )}

          {canDelete && loaded?.counts && (
            <>
              <Alert className="border-emerald-200 bg-emerald-50">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <AlertTitle className="text-emerald-900">Esta instância está vazia</AlertTitle>
                <AlertDescription className="text-emerald-900">
                  Nenhuma conversa, mensagem, contato, chatbot, campanha ou follow-up depende dela. Excluir não
                  apaga histórico nenhum.
                </AlertDescription>
              </Alert>
              {renderCounts(loaded.counts)}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">O que acontece ao excluir</h4>
                <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1">
                  {providerEffectLines(instance.provider).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  <li>Os registros de webhook desta instância são apagados junto.</li>
                  <li>Esta ação não pode ser desfeita.</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            {canDelete ? 'Cancelar' : 'Fechar'}
          </Button>
          {canDelete && (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir instância
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
