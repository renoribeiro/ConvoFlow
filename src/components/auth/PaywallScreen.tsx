import { Lock, Check, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

const PLAN_PRICE_LABEL = 'R$ 29,90';

// Mesma flag/pendência da aba Assinatura: cobrança real só na Fase 2 (Stripe).
const CHECKOUT_ENABLED = false;

const FEATURES = [
  'Conversas e multi-atendimento',
  'Contatos e Funil de Vendas',
  'Chatbots e Automação',
  'Campanhas e Follow-ups',
  'Relatórios e Rastreamento',
];

/**
 * Tela de bloqueio mostrada a uma Loja cuja Conta ainda não tem acesso
 * liberado (nem pago, nem manual). Ocupa a tela inteira — sem sidebar/menu.
 */
export const PaywallScreen = () => {
  const { logout } = useAuth();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = () => {
    if (!CHECKOUT_ENABLED) {
      toast({
        title: 'Pagamento em breve',
        description: 'A assinatura online ainda está sendo configurada. Fale com o suporte para liberar seu acesso.',
      });
      return;
    }
    // Fase 2: aqui entra a chamada ao checkout do Stripe.
    setLoading(true);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-brand-primary/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Acesso bloqueado</CardTitle>
          <CardDescription>
            {tenant?.name ? <>A Conta <strong>{tenant.name}</strong> ainda não está ativa. </> : null}
            Assine para liberar o sistema.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="text-center">
            <span className="text-4xl font-bold">{PLAN_PRICE_LABEL}</span>
            <span className="text-muted-foreground">/mês</span>
            <p className="text-sm text-muted-foreground mt-1">Plano único com todos os recursos</p>
          </div>

          <ul className="space-y-2 text-sm">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" /> {f}
              </li>
            ))}
          </ul>

          <Button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Assinar Agora — {PLAN_PRICE_LABEL}/mês
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Já pagou ou precisa de liberação? Fale com o suporte / administrador.
          </p>
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
