-- =============================================================================
-- Policies do Gerente estavam MORTAS: procuravam um nome de role que não existe
-- =============================================================================
-- O BUG
--
--   `is_account_manager_safe()` testava  role = 'agencia'
--   `is_enterprise_safe()`      testava  role = 'loja'
--
--   Esses dois valores são de duas renomeações atrás. O enum public.user_role
--   ainda os carrega por compatibilidade, mas NENHUMA linha de profiles usa
--   ('agencia': 0 linhas, 'loja': 0 linhas — conferido em 2026-08-13). As duas
--   funções, portanto, devolviam FALSE para todo mundo, sempre.
--
--   Consequência: as cinco policies que dependem delas nunca disparavam —
--     tenants_account_manager_read
--     profiles_account_manager_descendants_select
--     profiles_account_manager_descendants_update
--     profiles_enterprise_tenant_select
--     profiles_enterprise_tenant_update
--
--   Na prática, o Gerente NÃO ENXERGAVA as próprias lojas nem os usuários
--   delas. A tela "Minhas Lojas" vinha vazia, o seletor de Loja não listava
--   nada e a Comparação de Lojas não tinha o que comparar. A hierarquia estava
--   escrita e implementada, mas desligada por um nome errado.
--
-- POR QUE ISTO NÃO ENTROU NA MIGRAÇÃO DE SEGURANÇA (20260813000005)
--
--   Porque isto AMPLIA acesso, e ampliar acesso no meio de um conserto de
--   segurança é como se corrige um bug criando outro. Vai separado, de olho
--   aberto: aqui o Gerente GANHA a leitura das lojas afiliadas — que é
--   exatamente o que as policies foram escritas para dar.
--
-- O QUE MUDA DE VERDADE
--
--   Só o mapeamento de nome de role. As policies não são tocadas: continuam
--   com o mesmo escopo (descendentes do próprio perfil / lojas da própria
--   Conta). Ninguém passa a ver nada além do que já estava desenhado.
--
--   `is_enterprise_safe()` (Gestor) também é corrigida — ela dá ao gestor a
--   leitura dos perfis da PRÓPRIA loja, que é o que ele precisa para gerenciar
--   os atendentes dele.
--
-- Idempotente: CREATE OR REPLACE.
-- =============================================================================

-- Gerente (ex-agencia, ex-account_manager). Exige status active — mesma regra
-- das outras funções de RLS desde 20260813000005.
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

-- Gestor (ex-loja, ex-enterprise).
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

-- E a de Gestor usada nas policies de INSERT/UPDATE de profiles, pelo mesmo
-- motivo: passa a exigir status active, igual às demais.
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

-- =============================================================================
-- ROLLBACK — volta ao comportamento morto (não recomendado)
--   CREATE OR REPLACE FUNCTION public.is_account_manager_safe() ... role = 'agencia'
--   CREATE OR REPLACE FUNCTION public.is_enterprise_safe()      ... role = 'loja'
-- =============================================================================
