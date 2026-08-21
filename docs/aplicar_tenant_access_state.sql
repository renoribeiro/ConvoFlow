-- =============================================================================
-- ConvoFlow — a Loja passa a herdar o acesso da Conta (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor do Supabase. É transacional: ou entra tudo, ou
-- não entra nada. Idempotente: rodar duas vezes não quebra.
--
-- Equivale a:
--   supabase/migrations/20260818000001_tenant_access_state_rpc.sql
--
-- NÃO rodar `supabase db push` neste projeto: 81 migrations locais não estão no
-- ledger e algumas mexem em dado real de usuário.
--
-- -----------------------------------------------------------------------------
-- PARA QUE SERVE
-- -----------------------------------------------------------------------------
-- Hoje, um Gestor convidado para uma Loja recém-criada bate no paywall mesmo
-- com a Conta liberada. A vaga de Loja mora na linha da Conta, mas o acesso era
-- lido na linha da LOJA — e Loja nova nasce com subscription_status NULL e
-- manual_access_granted false.
--
-- Esta função devolve, para um tenant, se ele está liberado e por quê, subindo
-- para a Conta pai quando o tenant é uma Loja com pai. É a peça que faltava:
-- `parent_tenant_id` já existia e era caminhado só para baixo.
--
-- NENHUMA COLUNA NOVA. NENHUMA POLICY NOVA. Nada de dado é alterado por este
-- script — ele só cria uma função.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — veja o estado de hoje (rode fora da transação):
-- -----------------------------------------------------------------------------
--   SELECT t.name, t.kind, p.name AS conta_pai,
--          t.subscription_status, t.manual_access_granted,
--          p.subscription_status AS pai_subscription,
--          p.manual_access_granted AS pai_manual
--     FROM public.tenants t
--     LEFT JOIN public.tenants p ON p.id = t.parent_tenant_id
--    ORDER BY t.kind, t.name;
--
-- Em 2026-08-18 isso devolvia 6 linhas, nenhuma com subscription_status='active'
-- (todo o acesso de hoje é liberação manual).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_access_state(p_tenant_id uuid)
RETURNS TABLE (unlocked boolean, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_linha    public.tenants%ROWTYPE;
  v_cobranca public.tenants%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL THEN
    unlocked := false; source := 'locked'; RETURN NEXT; RETURN;
  END IF;

  -- Quem pode perguntar. A função enxerga a tabela inteira (SECURITY DEFINER),
  -- então o alcance é fechado aqui e não pelo RLS.
  --   superadmin            → qualquer Conta.
  --   qualquer perfil ativo → a própria Conta/Loja.
  --   dono de uma Conta     → as Lojas filhas dela.
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

  -- Loja COM pai sobe para a Conta; Conta e Loja órfã respondem por si.
  -- A subida é condicional de propósito: um JOIN comum devolveria zero linhas
  -- para uma Loja órfã e a trancaria. Havia duas assim quando isto foi escrito;
  -- foram removidas em 2026-08-20 (docs/remover_lojas_orfas.sql) e o ramo fica
  -- porque o schema continua permitindo uma Loja sem pai.
  v_cobranca := v_linha;

  IF v_linha.kind = 'store' AND v_linha.parent_tenant_id IS NOT NULL THEN
    SELECT * INTO v_cobranca FROM public.tenants p WHERE p.id = v_linha.parent_tenant_id;
    IF NOT FOUND THEN
      v_cobranca := v_linha;
    END IF;
  END IF;

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

-- Registro no ledger, já que a aplicação é manual.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260818000001', 'tenant_access_state_rpc')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) A função existe, os GRANTs estão certos e o ledger recebeu a linha:
--
--   SELECT 'funcao' AS item,
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END AS situacao
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'tenant_access_state'
--   UNION ALL
--   SELECT 'grant authenticated',
--          CASE WHEN has_function_privilege('authenticated',
--                 'public.tenant_access_state(uuid)', 'EXECUTE')
--               THEN 'ok' ELSE 'FALTA' END
--   UNION ALL
--   SELECT 'anon NAO executa',
--          CASE WHEN has_function_privilege('anon',
--                 'public.tenant_access_state(uuid)', 'EXECUTE')
--               THEN 'FALHOU' ELSE 'ok' END
--   UNION ALL
--   SELECT 'ledger',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM supabase_migrations.schema_migrations
--    WHERE version = '20260818000001';
--
-- 2) NÃO tente chamar a função aqui no SQL Editor. Não há JWT, `auth.uid()` é
--    NULL, e ela levanta "Sem permissão para consultar o acesso desta Conta."
--    por construção. Isso é o comportamento certo, não erro de instalação.
--
--    Para conferir o RESULTADO esperado por tenant, rode a consulta equivalente
--    abaixo — ela reproduz a mesma regra sem passar pela função:
--
--   SELECT t.name AS tenant, t.kind,
--          COALESCE(c.name, t.name) AS responde_pela_cobranca,
--          CASE
--            WHEN COALESCE(c.subscription_status, t.subscription_status) = 'active'
--              THEN 'paid'
--            WHEN COALESCE(c.manual_access_granted, t.manual_access_granted) IS TRUE
--              THEN 'manual'
--            ELSE 'locked'
--          END AS situacao
--     FROM public.tenants t
--     LEFT JOIN public.tenants c
--            ON t.kind = 'store'
--           AND t.parent_tenant_id IS NOT NULL
--           AND c.id = t.parent_tenant_id
--    ORDER BY situacao, t.name;
--
--    Esperado em 2026-08-18 (6 linhas):
--      Conta Teste Gerente   account  -> manual
--      EncaixaRH             store    -> manual  (via Conta "Mario Acioli")
--      Loja - Yuri Saldanha  store    -> manual  (órfã: responde por si)
--      Loja Teste            store    -> manual  (via "Conta Teste Gerente")  <= ERA locked
--      Mario Acioli          account  -> manual
--      Loja - Bruno Moura    store    -> locked  (órfã sem liberação: já era assim)
--
--    A única mudança de situação é "Loja Teste", que é exatamente o defeito.
--    "Loja - Bruno Moura" continua trancada — pré-existente, não é regressão.
--
--    ATUALIZAÇÃO 2026-08-20: as duas órfãs foram removidas do banco
--    (docs/remover_lojas_orfas.sql). Rodando a consulta HOJE saem 4 linhas, e
--    todas liberadas: Conta Teste Gerente, EncaixaRH, Loja Teste e Mario
--    Acioli. Se você está aplicando esta função num banco onde as órfãs ainda
--    existem, vale a lista de 6 acima.
--
-- 3) O teste de verdade é pelo produto: convide um Gestor para a "Loja Teste" e
--    confirme que ele entra no dashboard em vez de ver "Acesso bloqueado".
-- =============================================================================
