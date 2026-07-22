import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Check, AlertTriangle, CreditCard, Loader2, Store } from 'lucide-react';
import { useTenant, useIsGerente } from '@/contexts/TenantContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getRewardfulReferral } from '@/lib/rewardful';

// =============================================================================
// PLANO GERENTE — R$ 499,90/mês (inclui 5 lojas) + lojas extras R$ 99,90/mês
// =============================================================================
const PLAN_NAME = 'Plano Gerente';
const PLAN_PRICE_LABEL = 'R$ 499,90';
const INCLUDED_SLOTS = 5;
const SLOT_PRICE_LABEL = 'R$ 99,90';

// -----------------------------------------------------------------------------
// STRIPE — cobrança recorrente via Edge Function `create-checkout-session`.
// Os Prices e a chave secreta ficam do lado do servidor (env secrets
// STRIPE_PRICE_GERENTE, STRIPE_PRICE_STORE_SLOT e STRIPE_SECRET_KEY); este
// componente só dispara o checkout. O tenant é resolvido no servidor a partir
// do usuário logado. Enviamos apenas { extraSlots } para lojas extras.
// -----------------------------------------------------------------------------
const CHECKOUT_ENABLED = true;

export const SubscriptionSettings = () => {
  const { tenant } = useTenant();
  const isGerente = useIsGerente();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [buyingSlots, setBuyingSlots] = useState(false);
  const [extraSlots, setExtraSlots] = useState(1);

  if (!tenant) return null;

  const isPro =
    (tenant.plan_type === 'gerente' || tenant.plan_type === 'pro') &&
    tenant.subscription_status === 'active';
  const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const isTrialActive = tenant.status === 'trial' && trialEnds && trialEnds > new Date();
  const isExpired = !isPro && !isTrialActive;

  // Colunas de slots são adicionadas pela migração V2 — leitura defensiva.
  const includedSlots = (tenant as { store_slots_included?: number }).store_slots_included ?? INCLUDED_SLOTS;
  const purchasedExtra = (tenant as { store_slots_extra?: number }).store_slots_extra ?? 0;
  const totalSlots = includedSlots + purchasedExtra;

  const startCheckout = async (body: Record<string, unknown>, setBusy: (v: boolean) => void) => {
    if (!CHECKOUT_ENABLED) {
      toast({
        title: 'Pagamento em breve',
        description: 'A assinatura online ainda está sendo configurada.',
      });
      return;
    }
    try {
      setBusy(true);
      // Se o visitante veio por indicação (Rewardful), anexa o referral ao checkout.
      const referral = getRewardfulReferral();
      const payload = referral ? { ...body, referral } : body;
      const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de checkout não retornada');
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast({
        title: 'Erro ao iniciar checkout',
        description: error.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSubscribe = () => startCheckout({}, setLoading);
  const handleBuySlots = () =>
    startCheckout({ extraSlots: Math.max(1, Math.min(100, extraSlots)) }, setBuyingSlots);

  const handlePortal = () => {
    toast({
      title: 'Portal do Cliente',
      description: 'Acesse o email de confirmação da assinatura para gerenciar sua conta no Stripe.',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Seu Plano Atual</span>
            {isPro ? (
              <Badge className="bg-green-500 hover:bg-green-600">ATIVO</Badge>
            ) : (
              <Badge variant="outline">{tenant.plan_type?.toUpperCase() || 'BASIC'}</Badge>
            )}
          </CardTitle>
          <CardDescription>Gerencie sua assinatura e faturamento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${isPro ? 'bg-green-100' : 'bg-gray-100'}`}>
              <CreditCard className={`w-6 h-6 ${isPro ? 'text-green-600' : 'text-gray-600'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{isPro ? PLAN_NAME : 'Sem assinatura ativa'}</h3>
              <p className="text-sm text-muted-foreground">
                {isPro
                  ? 'Sua assinatura está ativa. Aproveite todos os recursos!'
                  : 'Assine para desbloquear todos os recursos.'}
              </p>
            </div>
          </div>

          {!isPro && (
            <Alert variant={isExpired ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{isExpired ? 'Nenhuma assinatura' : 'Período de avaliação'}</AlertTitle>
              <AlertDescription>
                {isExpired
                  ? 'Você ainda não tem uma assinatura ativa.'
                  : `Você está utilizando a avaliação gratuita.${trialEnds ? ` Expira em ${trialEnds.toLocaleDateString()}` : ''}`}
              </AlertDescription>
            </Alert>
          )}

          {/* Plano Gerente */}
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <h4 className="font-semibold text-lg">{PLAN_NAME}</h4>
              <div className="text-right">
                <span className="text-2xl font-bold">{PLAN_PRICE_LABEL}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> {INCLUDED_SLOTS} lojas incluídas
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Alternância e comparação entre lojas
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Automação, Chatbots e Campanhas
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Gestores e Atendentes por loja
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Loja adicional por {SLOT_PRICE_LABEL}/mês
              </li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2 md:flex-row md:justify-end md:items-center">
          {isPro ? (
            <Button variant="outline" onClick={handlePortal}>Gerenciar Assinatura</Button>
          ) : (
            <Button
              onClick={handleSubscribe}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 w-full md:w-auto"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Assinar Agora — {PLAN_PRICE_LABEL}/mês
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Lojas / slots — só para o Gerente */}
      {isGerente && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" /> Lojas do seu grupo
            </CardTitle>
            <CardDescription>
              Seu plano inclui {includedSlots} lojas. Contrate lojas extras por {SLOT_PRICE_LABEL}/mês cada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="rounded-md border px-3 py-2">
                <span className="text-muted-foreground">Incluídas:</span>{' '}
                <span className="font-semibold">{includedSlots}</span>
              </div>
              <div className="rounded-md border px-3 py-2">
                <span className="text-muted-foreground">Extras contratadas:</span>{' '}
                <span className="font-semibold">{purchasedExtra}</span>
              </div>
              <div className="rounded-md border px-3 py-2">
                <span className="text-muted-foreground">Total disponível:</span>{' '}
                <span className="font-semibold">{totalSlots}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-2">
              <label htmlFor="extra-slots" className="text-sm text-muted-foreground">
                Quantas lojas extras?
              </label>
              <Input
                id="extra-slots"
                type="number"
                min={1}
                max={100}
                value={extraSlots}
                onChange={(e) => setExtraSlots(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-20"
              />
            </div>
            <Button onClick={handleBuySlots} disabled={buyingSlots}>
              {buyingSlots ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Contratar {extraSlots} loja{extraSlots > 1 ? 's' : ''} — {SLOT_PRICE_LABEL}/mês cada
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};
