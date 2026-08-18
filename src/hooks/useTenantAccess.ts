import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant, useRole } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import {
  normalizeAccessDecision,
  resolveTenantAccess,
  type AccessDecision,
  type AccessSource,
} from '@/lib/access/tenantAccess';

export type { AccessSource };

export interface TenantAccess {
  /** Ainda carregando o tenant/role/acesso — não decida nada ainda. */
  loading: boolean;
  /** Conta tem acesso liberado (pago, manual, ou perfil com bypass). */
  unlocked: boolean;
  /** Conta deve ver o paywall (já carregou e não tem acesso). */
  locked: boolean;
  /** De onde vem o acesso. */
  source: AccessSource;
}

const CARREGANDO: TenantAccess = {
  loading: true,
  unlocked: false,
  locked: false,
  source: 'locked',
};

const BYPASS: TenantAccess = {
  loading: false,
  unlocked: true,
  locked: false,
  source: 'bypass',
};

const decidido = (d: AccessDecision): TenantAccess => ({
  loading: false,
  unlocked: d.unlocked,
  locked: !d.unlocked,
  source: d.source,
});

/**
 * Decide se o usuário atual pode usar o sistema (paywall).
 *
 * Regras:
 *   - superadmin e gerente (agência): sempre liberados (bypass), sem consulta.
 *   - gestor/atendente: o acesso vem da CONTA. Como o tenant deles é uma Loja e
 *     o RLS de `tenants` não deixa uma Loja ler a Conta pai, quem responde é a
 *     função `public.tenant_access_state` (migração 20260818000001), que sobe
 *     para o pai e devolve só dois valores: liberado e por quê.
 *   - Loja órfã (sem `parent_tenant_id`) responde por si mesma — é o que mantém
 *     as Lojas antigas funcionando.
 *
 * DEGRADAÇÃO. Se a RPC falhar (função ainda não aplicada em produção, rede
 * caindo), o hook NÃO tranca ninguém: cai para a avaliação da linha que já está
 * carregada, que é exatamente o comportamento anterior a esta mudança. Sem
 * isso, subir o frontend antes de rodar o SQL colocaria todo mundo no paywall.
 *
 * `locked` NUNCA é verdadeiro enquanto a consulta está no ar — quem está
 * esperando resposta continua em `loading`, e o DashboardLayout mostra o
 * carregando em vez de piscar o paywall na cara de quem tem acesso.
 */
export function useTenantAccess(): TenantAccess {
  const role = useRole();
  const { tenant, loading } = useTenant();
  const tenantId = tenant?.id ?? null;

  const temBypass = role === 'superadmin' || role === 'gerente';
  const habilitada = !loading && role !== null && !temBypass && !!tenantId;

  // Primeiro segmento 'tenant' → faixa estática do cache (ver queryClient.ts).
  // A chave inclui o tenant ativo, então trocar de Loja pelo seletor já busca o
  // acesso da Loja nova sozinho, sem invalidação manual.
  const consulta = useQuery({
    queryKey: [QUERY_KEYS.TENANT, 'access-state', tenantId],
    enabled: habilitada,
    // Uma tentativa a mais cobre a queda de rede passageira. Além disso não
    // vale: os dois erros prováveis aqui — função ainda não aplicada e permissão
    // negada — são permanentes, e insistir só prolonga o tempo que a pessoa
    // passa olhando o carregando antes de cair na degradação.
    retry: 1,
    retryDelay: 400,
    queryFn: async (): Promise<AccessDecision> => {
      // Cast local: função nova, fora dos tipos gerados em types.ts.
      const { data, error } = await (supabase as any).rpc('tenant_access_state', {
        p_tenant_id: tenantId,
      });

      if (error) {
        logger.warn(
          '[useTenantAccess] tenant_access_state falhou; avaliando a linha carregada',
          { tenantId, message: error.message },
        );
        throw error;
      }

      const linha = Array.isArray(data) ? data[0] : data;
      if (!linha) {
        throw new Error('tenant_access_state não devolveu nenhuma linha');
      }
      return normalizeAccessDecision(linha);
    },
  });

  if (loading || role === null) return CARREGANDO;
  if (temBypass) return BYPASS;

  // Sem tenant não há o que avaliar — mesma resposta de antes.
  if (!tenantId) return decidido({ unlocked: false, source: 'locked' });

  // Degradação: a linha em mãos é a da Loja, então `parent` é nulo de propósito.
  if (consulta.isError) return decidido(resolveTenantAccess(tenant, null));

  if (consulta.data) return decidido(consulta.data);

  // Consulta no ar. Nunca `locked` aqui.
  return CARREGANDO;
}
