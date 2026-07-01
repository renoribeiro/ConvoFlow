import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// =============================================================================
// PLANO ÚNICO — R$ 29,90/mês
// =============================================================================
const PLAN_NAME = 'Plano ConvoFlow';
const PLAN_PRICE_LABEL = 'R$ 29,90';

// -----------------------------------------------------------------------------
// PENDÊNCIA STRIPE (Fase 2) — a cobrança real ainda NÃO está ligada.
// Diagnóstico (2026-06-30): stripe_config vazio, 0 webhooks, 0 transações,
// e a função `create-checkout-session` não existe no repo. Enquanto isso,
// CHECKOUT_ENABLED fica `false` e o botão não chama checkout nenhum.
//
// Para ligar a cobrança real (precisa de acesso à conta do Stripe):
//   1. Criar um Price recorrente de R$ 29,90/mês (BRL) no Stripe e colar o ID
//      em STRIPE_PRICE_ID abaixo.
//   2. Cadastrar as chaves: tabela `stripe_config` (secret/publishable) +
//      secrets STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET nas Edge Functions.
//   3. (Re)criar a função `create-checkout-session` usando esse Price e
//      setando `client_reference_id = tenant.id` (o `stripe-webhook` depende
//      disso pra ativar a Conta certa).
//   4. Configurar o endpoint do webhook no painel do Stripe e testar ponta a ponta.
//   5. Trocar CHECKOUT_ENABLED para `true`.
// -----------------------------------------------------------------------------
const CHECKOUT_ENABLED = false;
const STRIPE_PRICE_ID = ''; // TODO Fase 2: price_... do plano de R$ 29,90

export const SubscriptionSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!tenant) return null;

  const isPro = tenant.plan_type === 'pro' && tenant.subscription_status === 'active';
  const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const isTrialActive = tenant.status === 'trial' && trialEnds && trialEnds > new Date();
  const isExpired = !isPro && !isTrialActive;

  const handleSubscribe = async () => {
    // Fase 1: cobrança ainda não conectada ao Stripe.
    if (!CHECKOUT_ENABLED) {
      toast({
        title: 'Pagamento em breve',
        description: 'A assinatura online ainda está sendo configurada. Em breve você poderá assinar por aqui.',
      });
      return;
    }

    try {
      setLoading(true);

      const { data: userResponse } = await supabase.auth.getUser();
      if (!userResponse.user) {
        toast({
          title: 'Erro',
          description: 'Você precisa estar logado para assinar.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId: STRIPE_PRICE_ID,
          tenantId: tenant.id,
          userId: userResponse.user.id,
        }
      });

      if (error) throw error;

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
      setLoading(false);
    }
  };

  const handlePortal = async () => {
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
          <CardDescription>
            Gerencie sua assinatura e faturamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${isPro ? 'bg-green-100' : 'bg-gray-100'}`}>
              <CreditCard className={`w-6 h-6 ${isPro ? 'text-green-600' : 'text-gray-600'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {isPro ? PLAN_NAME : 'Sem assinatura ativa'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isPro
                  ? 'Sua assinatura está ativa. Aproveite todos os recursos!'
                  : 'Assine para apoiar e desbloquear todos os recursos.'}
              </p>
            </div>
          </div>

          {!isPro && (
            <Alert variant={isExpired ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{isExpired ? 'Nenhuma assinatura' : 'Modo Trial'}</AlertTitle>
              <AlertDescription>
                {isExpired
                  ? 'Você ainda não tem uma assinatura ativa.'
                  : `Você está utilizando a versão de avaliação.${trialEnds ? ` Expira em ${trialEnds.toLocaleDateString()}` : ''}`}
              </AlertDescription>
            </Alert>
          )}

          {/* Plano único */}
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
                <Check className="w-4 h-4 text-green-500" /> Automação Avançada (Fluxos)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Chatbots Ilimitados
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Campanhas em Massa
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Relatórios Detalhados
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Múltiplos Atendentes
              </li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2 md:flex-row md:justify-end md:items-center">
          {isPro ? (
            <Button variant="outline" onClick={handlePortal}>Gerenciar Assinatura</Button>
          ) : (
            <>
              {!CHECKOUT_ENABLED && (
                <p className="text-xs text-muted-foreground md:mr-auto">
                  Pagamento online em breve.
                </p>
              )}
              <Button
                onClick={handleSubscribe}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 w-full md:w-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Assinar Agora — {PLAN_PRICE_LABEL}/mês
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
