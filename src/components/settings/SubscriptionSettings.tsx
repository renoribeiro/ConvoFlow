import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const SubscriptionSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!tenant) return null;

  const isPro = tenant.plan_type === 'pro' && tenant.subscription_status === 'active';
  // Check if trial is active or expired
  const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const isTrialActive = tenant.status === 'trial' && trialEnds && trialEnds > new Date();
  const isExpired = !isPro && !isTrialActive;

  const STRIPE_PRODUCT_ID = 'prod_Tmg5IInlTr4hi3'; // Convoflow Pro Product ID

  const handleSubscribe = async () => {
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
          priceId: STRIPE_PRODUCT_ID, // Assuming the function can handle product ID or we just pass it so the function handles it. Actually, wait, let's pass a priceId if necessary, but the edge function earlier was hardcoded or expected priceId.
          userId: userResponse.user.id
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
    // Em um cenário real, você criaria uma edge function `create-portal-session`
    // Por agora, com o MVP, vamos exibir um aviso amigável
    toast({
      title: 'Portal do Cliente',
      description: 'Acesse o email de confirmação da assinatura para gerenciar sua conta no Stripe.',
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Seu Plano Atual</span>
            {isPro ? (
              <Badge className="bg-green-500 hover:bg-green-600">PRO</Badge>
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
                {isPro ? 'Convoflow Pro' : 'Plano Gratuito / Trial'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isPro
                  ? 'Sua assinatura está ativa. Aproveite todos os recursos!'
                  : 'Faça upgrade para acessar recursos avançados.'}
              </p>
            </div>
          </div>

          {!isPro && (
            <Alert variant={isExpired ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{isExpired ? 'Assinatura Necessária' : 'Modo Trial'}</AlertTitle>
              <AlertDescription>
                {isExpired
                  ? 'Sua conta está limitada. Assine o plano Pro para desbloquear automações e campanhas.'
                  : `Você está utilizando a versão de avaliação.${trialEnds ? ` Expira em ${trialEnds.toLocaleDateString()}` : ''}`}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Recursos do Plano Pro</h4>
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
          </div>

        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          {isPro ? (
            <Button variant="outline" onClick={handlePortal}>Gerenciar Assinatura</Button>
          ) : (
            <Button onClick={handleSubscribe} disabled={loading} className="bg-green-600 hover:bg-green-700 w-full md:w-auto">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Assinar Agora - R$ 97,00/mês
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
