
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Bell,
  Shield,
  Database,
  CreditCard,
  Headset,
  CalendarClock,
} from 'lucide-react';
import { AttendanceSettings } from '@/components/settings/AttendanceSettings';
import { FollowupSettings } from '@/components/settings/FollowupSettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { IntegrationSettings } from '@/components/settings/IntegrationSettings';
import { SubscriptionSettings } from '@/components/settings/SubscriptionSettings';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { useCapabilities } from '@/contexts/TenantContext';
import { Capability } from '@/types/userHierarchy';
import { useSearchParams } from 'react-router-dom';

/**
 * Ajuda contextual de cada aba. "profile" fica de fora de propósito:
 * ProfileSettings já traz o próprio botão no cabeçalho do card, porque o mesmo
 * componente também atende a rota /dashboard/profile.
 */
const TAB_HELP_KEYS: Record<string, string> = {
  attendance: 'page:settings-attendance',
  followups: 'page:settings-followups',
  subscription: 'page:settings-subscription',
  notifications: 'page:settings-notifications',
  security: 'page:settings-security',
  integrations: 'page:settings-integrations',
};

interface AbaConfig {
  value: string;
  label: string;
  icon: typeof User;
  /** Capacidade exigida para a aba existir. Ausente = todo mundo vê. */
  requer?: Capability;
  render: () => JSX.Element;
}

/**
 * As abas e quem alcança cada uma.
 *
 * ASSINATURA exige `billing.view`, que na matriz de capacidades é verdadeiro
 * só para gerente e superadmin. Quem responde pela cobrança é a CONTA, e a
 * Conta é do Gerente — Gestor e Atendente pertencem a uma Loja, que não assina
 * nada (ver a RPC tenant_access_state e a trava de `kind` no
 * create-checkout-session).
 *
 * Até 2026-08-18 esta lista era fixa e a aba aparecia para todo mundo: um
 * Atendente via o plano, o preço e um botão "Assinar Agora". O servidor já
 * recusava o checkout dele (`billing.manage` nega o atendente, e o tenant dele
 * não é `kind='account'`), então isto é conserto de VISIBILIDADE — nunca houve
 * risco de um atendente contratar de fato. Mas oferecer um botão que não
 * poderia funcionar é errado por si só.
 *
 * ATENDIMENTO fica sem `requer` de propósito: o AttendanceSettings já mostra as
 * preferências da Loja em modo leitura para quem não tem `store.admin`, e ver
 * como a Loja está configurada é útil para o atendente.
 */
const ABAS: AbaConfig[] = [
  { value: 'profile', label: 'Perfil', icon: User, render: () => <ProfileSettings /> },
  { value: 'attendance', label: 'Atendimento', icon: Headset, render: () => <AttendanceSettings /> },
  // Sem `requer`, pelo mesmo motivo de ATENDIMENTO: o painel já mostra os
  // valores em modo leitura para quem não tem `store.admin`, e saber o que a
  // Loja cancela sozinho muda como o atendente planeja o proprio follow-up.
  {
    value: 'followups',
    label: 'Follow-ups',
    icon: CalendarClock,
    render: () => <FollowupSettings />,
  },
  {
    value: 'subscription',
    label: 'Assinatura',
    icon: CreditCard,
    requer: 'billing.view',
    render: () => <SubscriptionSettings />,
  },
  { value: 'notifications', label: 'Notificações', icon: Bell, render: () => <NotificationSettings /> },
  { value: 'security', label: 'Segurança', icon: Shield, render: () => <SecuritySettings /> },
  { value: 'integrations', label: 'Integrações', icon: Database, render: () => <IntegrationSettings /> },
];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const capabilities = useCapabilities();

  const abasVisiveis = ABAS.filter((aba) => !aba.requer || capabilities[aba.requer]);

  /**
   * Aba pedida pela URL, se ela existir PARA ESTE CARGO. Sem esta checagem, um
   * `?tab=subscription` digitado à mão abriria o painel de cobrança mesmo sem a
   * aba na barra — esconder o botão não é esconder a tela.
   */
  const pedida = searchParams.get('tab');
  const currentTab =
    pedida && abasVisiveis.some((a) => a.value === pedida) ? pedida : 'profile';

  // Aba controlada pela URL: sobrevive a remontagens (foco da janela, etc.) e
  // permite deep-link (ex.: /dashboard/settings?tab=integrations).
  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        prev.set('tab', value);
        return prev;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        helpKey="page:settings"
        description="Gerencie as configurações da sua conta e preferências do sistema"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Configurações' }
        ]}
      />

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList
          className="grid w-full"
          style={{ gridTemplateColumns: `repeat(${abasVisiveis.length}, minmax(0, 1fr))` }}
        >
          {abasVisiveis.map((aba) => {
            const Icon = aba.icon;
            return (
              <TabsTrigger key={aba.value} value={aba.value} className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {aba.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TAB_HELP_KEYS[currentTab] && (
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <span>Como funciona esta aba</span>
            <FeatureHelp helpKey={TAB_HELP_KEYS[currentTab]} />
          </div>
        )}

        {abasVisiveis.map((aba) => (
          <TabsContent key={aba.value} value={aba.value}>
            {aba.render()}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
