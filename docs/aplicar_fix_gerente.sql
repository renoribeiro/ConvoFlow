-- =============================================================================
-- ConvoFlow — destravar a hierarquia do Gerente (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor. Transacional e idempotente.
--
-- Equivale a: supabase/migrations/20260813000006_fix_dead_role_helpers.sql
--
-- O QUE ISTO CONSERTA, EM PORTUGUÊS
--   O Gerente não enxergava as próprias lojas. "Minhas Lojas" vinha vazia, o
--   seletor de Loja não listava nada, a Comparação de Lojas não tinha o que
--   comparar. Motivo: duas funções de permissão procuravam nomes de cargo de
--   duas renomeações atrás ('agencia' e 'loja'), que nenhuma linha usa. Elas
--   respondiam "não" para todo mundo, então as regras que dependiam delas
--   nunca ligavam.
--
-- ATENÇÃO: isto AMPLIA acesso (o Gerente ganha a leitura das lojas afiliadas).
-- É o acesso que essas regras foram escritas para dar — mas por isso vai
-- separado do pacote de segurança, para ser revisado de olho aberto.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_account_manager_safe()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND status = 'active'
       AND role::text IN ('gerente', 'agencia', 'account_manager')
  );
$function$;

COMMENT ON FUNCTION public.is_account_manager_safe() IS
  'True para o Gerente (dono de agência). Aceita os nomes legados agencia/account_manager. Até 2026-08-13 testava só "agencia", valor que nenhuma linha usa — o que deixava mortas as policies de leitura das lojas afiliadas.';

CREATE OR REPLACE FUNCTION public.is_enterprise_safe()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND status = 'active'
       AND role::text IN ('gestor', 'loja', 'enterprise', 'tenant_admin')
  );
$function$;

COMMENT ON FUNCTION public.is_enterprise_safe() IS
  'True para o Gestor (dono de uma loja). Aceita os nomes legados loja/enterprise/tenant_admin. Até 2026-08-13 testava só "loja", valor que nenhuma linha usa.';

CREATE OR REPLACE FUNCTION public.is_gestor_safe()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND status = 'active'
       AND role = 'gestor'::public.user_role
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_gerente_safe()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND status = 'active'
       AND role = 'gerente'::public.user_role
  );
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260813000006', 'fix_dead_role_helpers')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO — rodar depois. As duas linhas devem sair com 'ok'.
-- =============================================================================
-- SELECT 'is_account_manager_safe reconhece gerente' AS item,
--        CASE WHEN prosrc ILIKE '%gerente%' THEN 'sim' ELSE 'nao' END AS valor,
--        CASE WHEN prosrc ILIKE '%gerente%' THEN 'ok' ELSE 'FALTA' END AS status
--   FROM pg_proc
--  WHERE proname = 'is_account_manager_safe' AND pronamespace = 'public'::regnamespace
-- UNION ALL
-- SELECT 'is_enterprise_safe reconhece gestor',
--        CASE WHEN prosrc ILIKE '%gestor%' THEN 'sim' ELSE 'nao' END,
--        CASE WHEN prosrc ILIKE '%gestor%' THEN 'ok' ELSE 'FALTA' END
--   FROM pg_proc
--  WHERE proname = 'is_enterprise_safe' AND pronamespace = 'public'::regnamespace;
--
-- OBSERVAÇÃO sobre os dados de hoje: a Conta "Conta Teste Gerente" está com
-- kind='store' e parent_tenant_id nulo, mas tem um GERENTE dentro. É dado
-- inconsistente de antes — uma agência deveria ser kind='account'. Mesmo depois
-- desta correção, esse gerente continuará sem lojas afiliadas, porque não há
-- nenhuma loja apontando para ele. Para arrumar:
--   UPDATE public.tenants SET kind = 'account', plan_type = 'gerente'
--    WHERE name = 'Conta Teste Gerente';
--   -- e depois pendurar as lojas dele:
--   -- UPDATE public.tenants SET parent_tenant_id = '<id-da-conta-teste-gerente>'
--   --  WHERE id = '<id-da-loja>';
-- =============================================================================
