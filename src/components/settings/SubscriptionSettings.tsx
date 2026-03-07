import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, CreditCard } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { env } from '@/lib/env';

export const SubscriptionSettings = () => {
  const { tenant } = useTenant();

  if (!tenant) return null;

  const isPro = tenant.plan_type === 'pro' && tenant.subscription_status === 'active';
  // Check if trial is active or expired
  const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const isTrialActive = tenant.status === 'trial' && trialEnds && trialEnds > new Date();
  const isExpired = !isPro && !isTrialActive;

  const handleSubscribe = () => {
    // Redirecionar para o link de pagamento com o tenant_id
    const baseUrl = env.get('STRIPE_PAYMENT_LINK');
    const paymentLink = `${baseUrl}?client_reference_id=${tenant.id}`;
    window.location.href = paymentLink;
  };

  const handlePortal = async () => {
     // TODO: Implementar redirecionamento para portal do cliente
     window.open('https://billing.stripe.com/p/login/test_...', '_blank'); // Replace with actual portal link if available or handle via API
     alert("Acesse o email de confirmação da assinatura para gerenciar sua conta no Stripe.");
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
             <Button onClick={handleSubscribe} className="bg-green-600 hover:bg-green-700 w-full md:w-auto">
               Assinar Agora - R$ 97,00/mês
             </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
