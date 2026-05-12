-- =============================================================================
-- Fase 3 — Fix de recursão infinita na RLS hierárquica
-- =============================================================================
-- Após aplicar 20260513000002, qualquer SELECT em `profiles` por um usuário
-- autenticado dispara o erro:
--   "infinite recursion detected in policy for relation profiles"
--
-- CAUSA: as policies criadas usavam SUBQUERIES INLINE em `profiles` dentro
-- da definição USING. Quando o Postgres avalia a policy, a subquery
-- inline dispara as policies de profiles novamente → loop infinito.
--
-- Exemplo problemático:
--   USING (
--     tenant_id = (SELECT tenant_id FROM profiles WHERE id = current_profile_id())
--   )
--
-- A subquery `SELECT FROM profiles` é executada no contexto da query externa,
-- sem o SECURITY DEFINER bypass. Por isso dispara as policies.
--
-- FIX: substituir subqueries inline por chamadas a funções SECURITY DEFINER
-- PLPGSQL (não inlinable pelo planner). Essas funções rodam com privilégios
-- do owner (postgres no Supabase, que tem BYPASSRLS), evitando a recursão.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Helpers PLPGSQL não-inlináveis
-- =============================================================================

-- is_my_descendant(target_id): true se target_id está na subárvore do caller
-- (não inclui o próprio caller). Encapsula a recursão WITH RECURSIVE.
CREATE OR REPLACE FUNCTION public.is_my_descendant(target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_self uuid;
BEGIN
  SELECT id INTO v_self FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_self IS NULL OR target_id = v_self THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    WITH RECURSIVE tree AS (
      SELECT id FROM public.profiles WHERE id = v_self
      UNION ALL
      SELECT p.id FROM public.profiles p
      JOIN tree t ON p.parent_id = t.id
    )
    SELECT 1 FROM tree WHERE id = target_id
  );
END;
$$;

-- is_user_in_my_tenant(target_id): true se target_id é um profile com
-- role='user' E tenant_id = tenant do caller. Usado por enterprise policy.
CREATE OR REPLACE FUNCTION public.is_user_in_my_tenant(target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_my_tenant uuid;
  v_target_tenant uuid;
  v_target_role public.user_role;
BEGIN
  SELECT tenant_id INTO v_my_tenant
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_my_tenant IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tenant_id, role INTO v_target_tenant, v_target_role
  FROM public.profiles WHERE id = target_id LIMIT 1;

  RETURN v_target_role = 'user'::public.user_role
     AND v_target_tenant = v_my_tenant;
END;
$$;

-- is_tenant_in_my_descendants(target_tenant_id): true se algum profile
-- descendente do caller tem aquele tenant_id. Usado por
-- tenants_account_manager_read.
CREATE OR REPLACE FUNCTION public.is_tenant_in_my_descendants(target_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_self uuid;
BEGIN
  IF target_tenant_id IS NULL THEN RETURN FALSE; END IF;
  SELECT id INTO v_self FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_self IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    WITH RECURSIVE tree AS (
      SELECT id FROM public.profiles WHERE id = v_self
      UNION ALL
      SELECT p.id FROM public.profiles p
      JOIN tree t ON p.parent_id = t.id
    )
    SELECT 1 FROM public.profiles p
    JOIN tree t ON p.id = t.id
    WHERE p.tenant_id = target_tenant_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_my_descendant(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_in_my_tenant(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_in_my_descendants(uuid)  TO authenticated;

-- =============================================================================
-- 2. profiles — recriar policies sem subqueries inline
-- =============================================================================

DROP POLICY IF EXISTS "profiles_enterprise_tenant_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_enterprise_tenant_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_account_manager_descendants_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_account_manager_descendants_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_hierarchy" ON public.profiles;

-- account_manager vê e gerencia descendentes (via helper is_my_descendant)
CREATE POLICY "profiles_account_manager_descendants_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_account_manager_safe()
    AND public.is_my_descendant(id)
  );

CREATE POLICY "profiles_account_manager_descendants_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_account_manager_safe()
    AND public.is_my_descendant(id)
  )
  WITH CHECK (
    public.is_account_manager_safe()
    AND public.is_my_descendant(id)
    AND role IN (
      'account_manager'::public.user_role,
      'enterprise'::public.user_role,
      'user'::public.user_role
    )
  );

-- enterprise vê e gerencia users do mesmo tenant (via helper)
CREATE POLICY "profiles_enterprise_tenant_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_enterprise_safe()
    AND public.is_user_in_my_tenant(id)
  );

CREATE POLICY "profiles_enterprise_tenant_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_enterprise_safe()
    AND public.is_user_in_my_tenant(id)
  )
  WITH CHECK (
    public.is_enterprise_safe()
    AND public.is_user_in_my_tenant(id)
  );

-- INSERT em profiles: usa helpers em vez de subquery inline
CREATE POLICY "profiles_insert_hierarchy" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin_safe()
    OR (
      public.is_account_manager_safe()
      AND role = 'enterprise'::public.user_role
      AND parent_id = public.current_profile_id()
    )
    OR (
      public.is_enterprise_safe()
      AND role = 'user'::public.user_role
      AND tenant_id = public.get_current_user_tenant_id()
      AND parent_id = public.current_profile_id()
    )
  );

-- =============================================================================
-- 3. tenants — recriar account_manager_read sem subquery em profiles
-- =============================================================================

DROP POLICY IF EXISTS "tenants_account_manager_read" ON public.tenants;

CREATE POLICY "tenants_account_manager_read" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    public.is_account_manager_safe()
    AND public.is_tenant_in_my_descendants(id)
  );

-- =============================================================================
-- 4. user_activity_log — recriar enterprise_tenant sem subquery em profiles
-- =============================================================================

DROP POLICY IF EXISTS "user_activity_log_enterprise_tenant" ON public.user_activity_log;

CREATE POLICY "user_activity_log_enterprise_tenant" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (
    public.is_enterprise_safe()
    AND public.is_user_in_my_tenant(profile_id)
  );

-- =============================================================================
-- 5. user_activity_log — account_manager_descendants (também tinha subquery via descendant_profile_ids inline)
-- =============================================================================

DROP POLICY IF EXISTS "user_activity_log_account_manager_descendants" ON public.user_activity_log;

CREATE POLICY "user_activity_log_account_manager_descendants" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (
    public.is_account_manager_safe()
    AND public.is_my_descendant(profile_id)
  );

COMMIT;
