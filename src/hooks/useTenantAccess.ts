import { useTenant, useRole } from '@/contexts/TenantContext';

export type AccessSource = 'bypass' | 'paid' | 'manual' | 'locked';

export interface TenantAccess {
  /** Ainda carregando o tenant/role — não decida nada ainda. */
  loading: boolean;
  /** Conta tem acesso liberado (pago, manual, ou perfil com bypass). */
  unlocked: boolean;
  /** Conta deve ver o paywall (já carregou e não tem acesso). */
  locked: boolean;
  /** De onde vem o acesso. */
  source: AccessSource;
}

/**
 * Decide se o usuário atual pode usar o sistema (paywall).
 *
 * Regras (decididas em 2026-06-30):
 *   - superadmin e agência: sempre liberados (bypass).
 *   - loja: precisa de acesso liberado na Conta —
 *       PAGO   (tenants.subscription_status = 'active'), ou
 *       MANUAL (tenants.manual_access_granted = true, liberado por superadmin).
 *   - loja sem Conta ou sem nenhum dos dois → bloqueada.
 *
 * A liberação manual é "permanente até revogar" — não há expiração.
 */
export function useTenantAccess(): TenantAccess {
  const role = useRole();
  const { tenant, loading } = useTenant();

  if (loading || role === null) {
    return { loading: true, unlocked: false, locked: false, source: 'locked' };
  }

  // Superadmin e Agência não passam pelo paywall.
  if (role === 'superadmin' || role === 'agencia') {
    return { loading: false, unlocked: true, locked: false, source: 'bypass' };
  }

  const isPaid = tenant?.subscription_status === 'active';
  const isManual = tenant?.manual_access_granted === true;

  if (isPaid) return { loading: false, unlocked: true, locked: false, source: 'paid' };
  if (isManual) return { loading: false, unlocked: true, locked: false, source: 'manual' };

  return { loading: false, unlocked: false, locked: true, source: 'locked' };
}
