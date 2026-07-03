import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { IWhatsAppProvider } from '@/services/whatsapp';

interface SendTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adapter da instância ativa (deve ser Meta/official). */
  adapter: IWhatsAppProvider;
  /** Telefone do destinatário (formato aceito pelo adapter). */
  toPhone: string;
  /**
   * Chamado após envio bem-sucedido para persistir a linha na thread. Recebe um
   * resumo textual do que foi enviado (ex.: "Template: pedido_confirmado").
   */
  onSent: (summary: string) => Promise<void> | void;
}

/**
 * Envia um template aprovado (HSM) direto da conversa — o caminho para reabrir
 * o atendimento fora da janela de 24h da Meta.
 *
 * v1: o usuário digita o nome exato do template aprovado (mesmo padrão das
 * Campanhas). Não buscamos a lista viva de templates da Meta ainda —
 * melhoria futura via GET /{WABA_ID}/message_templates (SKILL §7.1).
 */
export function SendTemplateDialog({
  open,
  onOpenChange,
  adapter,
  toPhone,
  onSent,
}: SendTemplateDialogProps) {
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const reset = () => {
    setTemplateName('');
    setLanguage('pt_BR');
    setParams([]);
  };

  const handleOpenChange = (next: boolean) => {
    if (sending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const name = templateName.trim();
    if (!name) {
      toast.error('Informe o nome do template aprovado.');
      return;
    }
    if (typeof adapter.sendTemplate !== 'function') {
      toast.error('Este provider não suporta envio de template.');
      return;
    }

    setSending(true);
    try {
      const res = await adapter.sendTemplate(toPhone, {
        templateName: name,
        language,
        // Descarta parâmetros vazios preservando a ordem dos preenchidos.
        bodyParams: params.map((p) => p.trim()).filter((p) => p.length > 0),
      });

      if (res.status !== 'sent' && res.status !== 'pending') {
        toast.error(`Template não enviado: ${res.error || 'Erro desconhecido.'}`);
        return;
      }

      await onSent(`Template: ${name}`);
      toast.success('Template enviado.');
      reset();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[SendTemplateDialog] falha ao enviar template', { error: msg });
      toast.error(`Falha ao enviar template: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar template aprovado</DialogTitle>
          <DialogDescription>
            Fora da janela de 24h, a Meta só permite reabrir a conversa com um template já aprovado no
            Gerenciador do WhatsApp Business.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nome do template *</Label>
            <Input
              id="tpl-name"
              placeholder="Ex: pedido_confirmado"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">
              Use o nome exato (status <strong>APROVADO</strong>) do Gerenciador do WhatsApp Business.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-language">Idioma do template</Label>
            <Select value={language} onValueChange={setLanguage} disabled={sending}>
              <SelectTrigger id="tpl-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                <SelectItem value="en_US">English (US)</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Parâmetros do corpo</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline disabled:opacity-50"
                onClick={() => setParams((prev) => [...prev, ''])}
                disabled={sending}
              >
                + Adicionar parâmetro
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Valores para {'{{1}}'}, {'{{2}}'}, etc., na ordem em que aparecem no template.
            </p>
            {params.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhum parâmetro adicionado.</p>
            )}
            {params.map((param, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground w-8 shrink-0">{`{{${idx + 1}}}`}</span>
                <Input
                  value={param}
                  placeholder={`Valor de {{${idx + 1}}}`}
                  onChange={(e) => {
                    setParams((prev) => {
                      const updated = [...prev];
                      updated[idx] = e.target.value;
                      return updated;
                    });
                  }}
                  disabled={sending}
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  onClick={() => setParams((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={sending}
                  aria-label="Remover parâmetro"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              O template precisa estar <strong>aprovado</strong> e com o nome/idioma exatos. Se não
              estiver, a Meta recusa o envio.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={sending || !templateName.trim()}>
            {sending ? 'Enviando...' : 'Enviar template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendTemplateDialog;
