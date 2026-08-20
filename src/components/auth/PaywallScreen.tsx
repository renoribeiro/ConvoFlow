import { useState } from 'react';
import { Lock, Check, LogOut, Loader2, RefreshCw, AlertTriangle, MessageCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant, useRole } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/queryClient';
import {
  criarSessaoDeCheckout,
  CHECKOUT_ENABLED,
  INCLUDED_SLOTS,
  PLAN_FEATURES,
  PLAN_NAME,
  PLAN_PRICE_LABEL,
  SUPORTE_EMAIL,
  SUPORTE_WHATSAPP_URL,
} from '@/lib/billing/checkout';

/**
 * Tela de bloqueio de uma Conta sem acesso liberado (nem pago, nem manual).
 * Ocupa a tela inteira — sem sidebar, sem menu.
 *
 * DUAS TELAS, PORQUE SÃO DUAS SITUAÇÕES DIFERENTES:
 *
 *   GERENTE    → bloqueio PARCIAL. Ele é a única pessoa que pode resolver: só a
 *                Conta assina, e a Conta é dele. Vê o plano, o preço e um botão
 *                que abre o checkout de verdade.
 *   GESTOR e   → bloqueio TOTAL. Não existe caminho de pagamento para eles: o
 *   ATENDENTE    servidor recusaria (`create-checkout-session` exige
 *                `kind='account'`). Mostrar preço a quem não pode pagar é pior
 *                que não mostrar nada — a pessoa tenta, falha e não entende.
 *   SUPERADMIN   nunca chega aqui: tem bypass em `useTenantAccess`.
 *
 * POR QUE O CAMINHO DE PAGAMENTO MORA AQUI, e não numa lista de rotas liberadas
 * no DashboardLayout: a alternativa seria deixar `/dashboard/settings` passar,
 * e essa tela tem sete abas — WhatsApp, Equipe, Segurança, Integrações. Liberar
 * a rota liberaria tudo isso junto, e obrigaria a uma segunda trava por aba,
 * fora de sincronia com a primeira. Aqui a superfície é um botão.
 * `create-checkout-session` resolve o tenant pelo JWT (`profiles.tenant_id`),
 * nunca pela Loja em foco, então o checkout funciona daqui sem sidebar nenhuma.
 *
 * QUEM É O DONO DA CONTA. Seria útil dizer ao gestor "fale com fulano", e
 * deliberadamente não dizemos: o RLS de `tenants` só entrega a linha da própria
 * Loja (`id = get_current_user_tenant_id()`), e o perfil do Gerente vive em
 * outro tenant. Nomeá-lo exigiria uma RPC nova em SECURITY DEFINER expondo
 * nome/e-mail de outra Conta a quem hoje não os alcança. Não vale o furo — a
 * saída é o contato de suporte abaixo.
 */
export const PaywallScreen = () => {
  const role = useRole();
  const { logout } = useAuth();
  const { tenant, refreshTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [enviando, setEnviando] = useState(false);
  const [reconferindo, setReconferindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const podeAssinar = role === 'gerente' && CHECKOUT_ENABLED;

  // O tenant em mãos pode ser a Conta (gerente) ou a Loja (gestor/atendente).
  // Chamar a Loja de "Conta" no texto confunde exatamente quem está tentando
  // entender por que o sistema não abre.
  const nome = tenant?.name?.trim() || null;
  const ehConta = tenant?.kind === 'account';

  const handleAssinar = async () => {
    setFalha(null);
    setEnviando(true);
    try {
      const url = await criarSessaoDeCheckout();
      window.location.href = url;
      // Sem `setEnviando(false)`: a página está saindo para o Stripe.
    } catch (erro) {
      const mensagem =
        erro instanceof Error && erro.message
          ? erro.message
          : 'Não foi possível iniciar o pagamento.';
      // A frase fica NA TELA, não só num toast que some em segundos — é ela que
      // diz se o problema é a cobrança fora do ar, uma assinatura já ativa ou
      // permissão. Sem isso o botão volta a falhar calado, que é o defeito que
      // esta tela existe para consertar.
      setFalha(mensagem);
      toast({
        title: 'Não foi possível abrir o pagamento',
        description: mensagem,
        variant: 'destructive',
      });
      setEnviando(false);
    }
  };

  /**
   * "Já paguei". Cobre o pagamento feito em outra aba, a liberação manual que o
   * superadmin acabou de conceder e o 409 ("esta Conta já possui assinatura
   * ativa") — os três são a mesma coisa: a linha em cache está velha.
   */
  const handleReconferir = async () => {
    setReconferindo(true);
    try {
      await refreshTenant();
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TENANT] });
      toast({
        title: 'Acesso reconferido',
        description: 'Se o pagamento já foi confirmado, o sistema abre em seguida.',
      });
    } finally {
      setReconferindo(false);
    }
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
            {podeAssinar ? (
              <>
                {nome && ehConta ? (
                  <>
                    A Conta <strong>{nome}</strong> não está ativa.{' '}
                  </>
                ) : (
                  <>Sua Conta não está ativa. </>
                )}
                Assine para liberar o sistema para todas as suas Lojas.
              </>
            ) : (
              <>
                {nome ? (
                  <>
                    A Conta responsável {ehConta ? 'por' : 'pela Loja'} <strong>{nome}</strong> não
                    está ativa.{' '}
                  </>
                ) : (
                  <>A Conta a que você pertence não está ativa. </>
                )}
                Por isso o sistema não abre.
              </>
            )}
          </CardDescription>
        </CardHeader>

        {podeAssinar ? (
          // ----------------------------------------------- GERENTE: pode pagar
          <CardContent className="space-y-5">
            <div className="text-center">
              <span className="text-4xl font-bold">{PLAN_PRICE_LABEL}</span>
              <span className="text-muted-foreground">/mês</span>
              <p className="text-sm text-muted-foreground mt-1">
                {PLAN_NAME} — {INCLUDED_SLOTS} lojas incluídas
              </p>
            </div>

            <ul className="space-y-2 text-sm">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>

            {falha ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Pagamento não iniciado</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{falha}</p>
                  <p className="text-xs">
                    Se continuar assim, fale com o suporte pelos contatos abaixo — ninguém precisa
                    ficar sem acesso esperando o checkout.
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              onClick={handleAssinar}
              disabled={enviando}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Assinar agora — {PLAN_PRICE_LABEL}/mês
            </Button>

            <Button
              variant="outline"
              onClick={handleReconferir}
              disabled={reconferindo}
              className="w-full gap-2"
            >
              {reconferindo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Já paguei — reconferir acesso
            </Button>

            <ContatoDeSuporte titulo="Prefere resolver com uma pessoa?" />
          </CardContent>
        ) : (
          // ------------------------------ GESTOR / ATENDENTE: nada a contratar
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Quem contrata o plano é a <strong>Conta</strong>, nunca a Loja. A Loja onde você
              trabalha herda o acesso dela — então não há nada para você assinar ou configurar
              nesta tela.
            </p>
            <p className="text-sm text-muted-foreground">
              Fale com a pessoa responsável pela Conta, o <strong>Gerente</strong>. Assim que o
              acesso for regularizado, todas as Lojas voltam juntas e você entra normalmente — não
              é preciso liberar uma por uma.
            </p>

            <ContatoDeSuporte titulo="Não sabe quem responde pela Conta?" />
          </CardContent>
        )}

        <CardFooter className="justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-2"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

/**
 * A saída que nunca falha. Está nas duas variantes de propósito: o checkout
 * pode estar fora do ar e o Gerente pode não estar por perto — em nenhum dos
 * dois casos a tela pode virar um beco sem saída.
 */
const ContatoDeSuporte = ({ titulo }: { titulo: string }) => (
  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
    <p className="text-xs font-medium">{titulo}</p>
    <div className="flex flex-col gap-1 text-xs">
      <a
        href={SUPORTE_WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-brand-primary hover:underline"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Falar com o suporte no WhatsApp
      </a>
      <a
        href={`mailto:${SUPORTE_EMAIL}`}
        className="inline-flex items-center gap-2 text-brand-primary hover:underline"
      >
        <Mail className="h-3.5 w-3.5" />
        {SUPORTE_EMAIL}
      </a>
    </div>
  </div>
);
