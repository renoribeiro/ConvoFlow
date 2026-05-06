import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useWahaApi } from '@/hooks/useWahaApi';
import { useMetaApi } from '@/hooks/useMetaApi';
import { newInstanceSchema, type ProviderType } from '@/lib/validations/whatsappInstance';
import { env } from '@/lib/env';
import { ProviderSelector } from './ProviderSelector';
import {
  OfficialApiForm,
  initialOfficialValues,
  type OfficialFormValues,
} from './forms/OfficialApiForm';
import {
  WahaApiForm,
  initialWahaValues,
  type WahaFormValues,
} from './forms/WahaApiForm';
import {
  EvolutionApiForm,
  initialEvolutionValues,
  type EvolutionFormValues,
  type EvolutionWebhookStatus,
} from './forms/EvolutionApiForm';
import { QRCodeModal } from './QRCodeModal';

interface CreateInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type WizardStep = 'select-provider' | 'configure';

export const CreateInstanceModal = ({ open, onOpenChange, onSuccess }: CreateInstanceModalProps) => {
  const [step, setStep] = useState<WizardStep>('select-provider');
  const [provider, setProvider] = useState<ProviderType | null>(null);
  const [loading, setLoading] = useState(false);

  const [officialValues, setOfficialValues] = useState<OfficialFormValues>(initialOfficialValues);
  const [wahaValues, setWahaValues] = useState<WahaFormValues>(initialWahaValues);
  const [evolutionValues, setEvolutionValues] = useState<EvolutionFormValues>(initialEvolutionValues);

  const [evolutionWebhookStatus, setEvolutionWebhookStatus] =
    useState<EvolutionWebhookStatus>('idle');
  const [evolutionWebhookError, setEvolutionWebhookError] = useState<string | null>(null);

  const [showQRModal, setShowQRModal] = useState(false);
  const [createdInstanceName, setCreatedInstanceName] = useState('');

  const { toast } = useToast();
  const { createInstance: createEvolution } = useEvolutionApi();
  const { createInstance: createWaha } = useWahaApi();
  const { createInstance: createMeta } = useMetaApi();

  const resetWizard = () => {
    setStep('select-provider');
    setProvider(null);
    setOfficialValues(initialOfficialValues());
    setWahaValues(initialWahaValues());
    setEvolutionValues(initialEvolutionValues());
    setEvolutionWebhookStatus('idle');
    setEvolutionWebhookError(null);
  };

  const handleClose = (next: boolean) => {
    if (loading) return;
    onOpenChange(next);
    if (!next) {
      resetWizard();
    }
  };

  const goToConfigure = () => {
    if (!provider) return;
    setStep('configure');
  };

  const goBackToSelect = () => {
    if (loading) return;
    setStep('select-provider');
  };

  const buildPayload = () => {
    if (provider === 'official') {
      return { provider: 'official', ...officialValues } as const;
    }
    if (provider === 'waha') {
      return { provider: 'waha', ...wahaValues } as const;
    }
    if (provider === 'evolution') {
      return { provider: 'evolution', ...evolutionValues } as const;
    }
    return null;
  };

  const handleSubmit = async () => {
    const payload = buildPayload();
    if (!payload) {
      toast({ title: 'Erro', description: 'Selecione um provider', variant: 'destructive' });
      return;
    }

    const parsed = newInstanceSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      toast({
        title: 'Verifique os campos',
        description: firstIssue?.message || 'Dados inválidos',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      if (parsed.data.provider === 'evolution') {
        setEvolutionWebhookStatus(parsed.data.enableWebhookAutomation ? 'configuring' : 'idle');
        setEvolutionWebhookError(null);
        try {
          await createEvolution(
            parsed.data.instance_key,
            env.get('EVOLUTION_WEBHOOK_URL') || undefined,
            {
              enableWebhookAutomation: parsed.data.enableWebhookAutomation,
              retryAttempts: parsed.data.retryAttempts,
              retryDelay: parsed.data.retryDelay,
            },
          );
          if (parsed.data.enableWebhookAutomation) setEvolutionWebhookStatus('success');
        } catch (err: any) {
          if (parsed.data.enableWebhookAutomation && err?.message?.includes('webhook')) {
            setEvolutionWebhookStatus('error');
            setEvolutionWebhookError(err.message);
          }
          throw err;
        }

        setCreatedInstanceName(parsed.data.instance_key);
        setShowQRModal(true);
      } else if (parsed.data.provider === 'waha') {
        await createWaha(parsed.data);
      } else if (parsed.data.provider === 'official') {
        await createMeta(parsed.data);
      }

      onSuccess();
      onOpenChange(false);
      resetWizard();
    } catch (err) {
      logger.error('Falha ao criar instância', {
        provider: parsed.data.provider,
        error: err instanceof Error ? err.message : err,
      });
      // toast já é exibido pelo hook subjacente
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    if (provider === 'official') {
      return (
        <OfficialApiForm
          values={officialValues}
          onChange={(patch) => setOfficialValues((prev) => ({ ...prev, ...patch }))}
          loading={loading}
        />
      );
    }
    if (provider === 'waha') {
      return (
        <WahaApiForm
          values={wahaValues}
          onChange={(patch) => setWahaValues((prev) => ({ ...prev, ...patch }))}
          loading={loading}
        />
      );
    }
    if (provider === 'evolution') {
      return (
        <EvolutionApiForm
          values={evolutionValues}
          onChange={(patch) => setEvolutionValues((prev) => ({ ...prev, ...patch }))}
          loading={loading}
          webhookStatus={evolutionWebhookStatus}
          webhookError={evolutionWebhookError}
        />
      );
    }
    return null;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === 'select-provider' ? 'Nova Instância de WhatsApp' : 'Configurar API'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {step === 'select-provider'
                ? 'Escolha qual API o ConvoFlow vai usar para esta instância.'
                : 'Preencha os dados de acesso. Os campos sensíveis serão protegidos.'}
            </DialogDescription>
          </DialogHeader>

          {step === 'select-provider' ? (
            <ProviderSelector value={provider} onChange={setProvider} disabled={loading} />
          ) : (
            renderForm()
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {step === 'select-provider' ? (
              <>
                <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={goToConfigure} disabled={!provider || loading}>
                  Continuar
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={goBackToSelect} disabled={loading}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex-1" />
                <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {provider === 'evolution' && (
                    <>
                      <QrCode className="mr-2 h-4 w-4" />
                      Criar e abrir QR Code
                    </>
                  )}
                  {provider === 'waha' && 'Salvar instância'}
                  {provider === 'official' && 'Validar e conectar'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => {
          setShowQRModal(false);
          setCreatedInstanceName('');
        }}
        instanceName={createdInstanceName}
      />
    </>
  );
};

export default CreateInstanceModal;
