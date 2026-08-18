-- =============================================================================
-- ConvoFlow — o Gestor volta a enxergar a equipe da Loja dele
-- (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor. Transacional e idempotente.
--
-- Equivale a:
--   supabase/migrations/20260818000002_fix_is_user_in_my_tenant.sql
--
-- NÃO rodar `supabase db push`: 81 migrations locais não estão no ledger.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTAVA QUEBRADO
-- -----------------------------------------------------------------------------
-- `is_user_in_my_tenant` terminava comparando com o cargo 'user':
--
--     RETURN v_target_role = 'user'::public.user_role AND ...
--
-- 'user' é nome de cargo de duas renomeações atrás. A migração 20260716000002
-- converteu todas as linhas e a constraint `profiles_role_modern_only` passou a
-- proibir o valor — ou seja, NENHUMA linha tem role='user' e a função devolve
-- FALSE para todo mundo, sempre.
--
-- Três policies dependem dela e estavam mortas:
--   profiles_enterprise_tenant_select    → Gestor não via NINGUÉM da Loja dele
--   profiles_enterprise_tenant_update    → não editava atendente nenhum
--   user_activity_log_enterprise_tenant  → nem o histórico de atividade deles
--
-- É o mesmo defeito de 20260813000006 (cinco policies mortas por comparar com
-- 'agencia') e do can_manage_profile. Helper deixado para trás numa renomeação.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — comprove que está morta (rode fora da transação):
-- -----------------------------------------------------------------------------
--   SELECT count(*) AS linhas_com_cargo_user
--     FROM public.profiles WHERE role::text = 'user';
--   -- Esperado: 0. É por isso que a função nunca devolve TRUE.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_user_in_my_tenant(target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_my_tenant     uuid;
  v_target_tenant uuid;
  v_target_role   public.user_role;
BEGIN
  IF target_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tenant_id INTO v_my_tenant
    FROM public.profiles
   WHERE user_id = auth.uid()
     AND status = 'active'
   LIMIT 1;

  IF v_my_tenant IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tenant_id, role INTO v_target_tenant, v_target_role
    FROM public.profiles
   WHERE id = target_id
   LIMIT 1;

  -- Só ATENDENTE da mesma Loja. A própria linha do Gestor já vem por
  -- users_own_profile, e a Loja aceita no máximo um Gestor — incluir o cargo
  -- só abriria a porta para Gestor editar Gestor se o dado ficasse sujo.
  RETURN v_target_role = 'atendente'::public.user_role
     AND v_target_tenant IS NOT NULL
     AND v_target_tenant = v_my_tenant;
END;
$function$;

COMMENT ON FUNCTION public.is_user_in_my_tenant(uuid) IS
  'True quando o perfil alvo é um ATENDENTE da mesma Loja do chamador ativo. Usada por profiles_enterprise_tenant_select/update e user_activity_log_enterprise_tenant. Comparava contra o cargo legado ''user'', que não existe desde a hierarquia V2 — devolvia FALSE para todo mundo (corrigido em 20260818000002).';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260818000002', 'fix_is_user_in_my_tenant')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) A função e o ledger:
--
--   SELECT 'funcao' AS item,
--          CASE WHEN pg_get_functiondef(p.oid) LIKE '%atendente%'
--               THEN 'ok' ELSE 'AINDA VELHA' END AS situacao
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='is_user_in_my_tenant'
--   UNION ALL
--   SELECT 'ledger',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM supabase_migrations.schema_migrations
--    WHERE version = '20260818000002';
--
-- 2) Quem cada Gestor passa a enxergar (esperado: os atendentes da Loja dele,
--    e ninguém de outra Loja):
--
--   SELECT g.id AS gestor, tg.name AS loja,
--          count(a.id) AS atendentes_visiveis
--     FROM public.profiles g
--     JOIN public.tenants tg ON tg.id = g.tenant_id
--     LEFT JOIN public.profiles a
--            ON a.tenant_id = g.tenant_id
--           AND a.role = 'atendente'::public.user_role
--    WHERE g.role = 'gestor'::public.user_role
--      AND g.status = 'active'
--    GROUP BY 1,2
--    ORDER BY 2;
--
-- 3) O teste de verdade é pelo produto: entre como Gestor, abra Equipe e
--    convide um Atendente. Antes desta correção a tela listaria só você mesmo.
-- =============================================================================
