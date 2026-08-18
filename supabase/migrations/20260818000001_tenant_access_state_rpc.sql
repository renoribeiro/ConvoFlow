-- =============================================================================
-- RPC tenant_access_state — a Loja herda o acesso da Conta dela
-- =============================================================================
-- REGRA DE NEGÓCIO (decidida em 2026-08-18):
--   Só uma CONTA (kind='account', o tenant de um gerente) tem assinatura.
--   Uma LOJA nunca tem assinatura própria: o acesso dela vem da Conta pai.
--   Não existe bloqueio por Loja — se a Conta está liberada, todas as Lojas
--   dela funcionam.
--
-- O DEFEITO QUE ISTO CONSERTA:
--   A vaga de Loja mora na linha da Conta; o acesso era lido na linha da LOJA.
--   `useTenantAccess` avaliava dois booleanos numa linha só, e para um gestor
--   essa linha é a Loja (profiles.tenant_id do gestor É a Loja). Loja criada
--   pelo `create-store` nasce com subscription_status NULL e
--   manual_access_granted false — ou seja, o gestor convidado batia no paywall
--   mesmo com a Conta paga. `parent_tenant_id` era caminhado para baixo em todo
--   lugar e para cima em lugar nenhum.
--
-- POR QUE UMA FUNÇÃO E NÃO UMA POLICY:
--   `public.tenants` tem quatro policies de SELECT (superadmin, própria linha,
--   descendentes do gerente, filhas da própria Conta). NENHUMA deixa quem está
--   dentro de uma Loja ler a linha da Conta pai — e é de propósito. Liberar a
--   linha inteira da Conta para um gestor entregaria de brinde
--   subscription_id, plan_type, store_slots_* e o nome comercial da Conta.
--
--   Esta função SECURITY DEFINER devolve DOIS valores e nada mais: se está
--   liberado e por quê. Nenhuma coluna da Conta é alcançável por ela.
--
-- NENHUMA COLUNA NOVA: `parent_tenant_id`, `kind`, `subscription_status` e
-- `manual_access_granted` já carregam todo o significado. O que faltava era o
-- pulo de uma linha para a outra.
--
-- ESPELHO EM TYPESCRIPT: `src/lib/access/tenantAccess.ts` (resolveTenantAccess)
-- escreve a mesma regra e é o caminho de degradação do front quando esta função
-- não responde. Os dois precisam concordar — o teste
-- `src/lib/access/tenantAccess.test.ts` fixa as formas de linha que existem em
-- produção.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_access_state(p_tenant_id uuid)
RETURNS TABLE (unlocked boolean, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_linha   public.tenants%ROWTYPE;
  v_cobranca public.tenants%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL THEN
    unlocked := false; source := 'locked'; RETURN NEXT; RETURN;
  END IF;

  -- ---------------------------------------------------------------------
  -- Quem pode perguntar. A função enxerga a tabela inteira (SECURITY
  -- DEFINER), então o alcance é fechado aqui e não pelo RLS.
  --   superadmin           → qualquer Conta.
  --   qualquer perfil ativo → a própria Conta/Loja.
  --   dono de uma Conta     → as Lojas filhas dela (gerente com Loja em foco).
  -- Perfil não-ativo: get_current_user_tenant_id() exige status='active' e
  -- devolve NULL, então nenhuma das duas últimas condições casa.
  -- ---------------------------------------------------------------------
  IF NOT (
    public.is_super_admin_safe()
    OR p_tenant_id = public.get_current_user_tenant_id()
    OR EXISTS (
      SELECT 1 FROM public.tenants f
       WHERE f.id = p_tenant_id
         AND f.parent_tenant_id IS NOT NULL
         AND f.parent_tenant_id = public.get_current_user_tenant_id()
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para consultar o acesso desta Conta.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_linha FROM public.tenants t WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    unlocked := false; source := 'locked'; RETURN NEXT; RETURN;
  END IF;

  -- ---------------------------------------------------------------------
  -- Qual linha responde pela cobrança.
  --
  --   1) Loja COM pai      → a Conta pai.
  --   2) Conta, ou Loja SEM pai (órfã) → ela mesma.
  --
  -- O caso (2) não é detalhe: existem Lojas órfãs em produção
  -- ("Loja - Yuri Saldanha", "Loja - Bruno Moura"), com parent_tenant_id NULL e
  -- a liberação manual na própria linha. Um JOIN comum devolveria zero linhas
  -- para elas e trancaria gente que hoje trabalha. Por isso a subida é
  -- condicional e explícita, nunca um JOIN.
  --
  -- Pai apagado (FK sem ON DELETE, mas defensivo): cai na própria linha em vez
  -- de trancar.
  -- ---------------------------------------------------------------------
  v_cobranca := v_linha;

  IF v_linha.kind = 'store' AND v_linha.parent_tenant_id IS NOT NULL THEN
    SELECT * INTO v_cobranca FROM public.tenants p WHERE p.id = v_linha.parent_tenant_id;
    IF NOT FOUND THEN
      v_cobranca := v_linha;
    END IF;
  END IF;

  -- Mesma ordem de sempre: pago ganha de liberação manual.
  IF v_cobranca.subscription_status = 'active' THEN
    unlocked := true;  source := 'paid';
  ELSIF v_cobranca.manual_access_granted IS TRUE THEN
    unlocked := true;  source := 'manual';
  ELSE
    unlocked := false; source := 'locked';
  END IF;

  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.tenant_access_state(uuid) IS
  'Diz se um tenant tem acesso liberado e por quê (paid/manual/locked). Loja com parent_tenant_id herda da Conta pai; Conta e Loja órfã respondem por si. Devolve apenas os dois valores — nenhuma coluna da Conta pai vaza para quem está dentro de uma Loja. Espelho em TS: src/lib/access/tenantAccess.ts.';

REVOKE ALL ON FUNCTION public.tenant_access_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_access_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_access_state(uuid) TO authenticated;

-- =============================================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.tenant_access_state(uuid);
--   (o front volta sozinho ao comportamento antigo: sem a função, o hook cai no
--    caminho de degradação e avalia a própria linha, como antes desta migração.)
-- =============================================================================
