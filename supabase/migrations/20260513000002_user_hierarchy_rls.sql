-- =============================================================================
-- Fase 2 — RLS hierárquica para os 4 níveis de usuário
-- =============================================================================
-- Adiciona helpers SECURITY DEFINER (descendant_profile_ids,
-- can_manage_profile) e substitui as policies básicas de profiles/tenants
-- por policies que respeitam a hierarquia:
--
--   superadmin      → enxerga e gerencia tudo
--   account_manager → enxerga e gerencia descendentes (enterprises + users)
--   enterprise      → enxerga e gerencia usuários do mesmo tenant
--   user            → enxerga apenas o próprio profile
--
-- A recursão é encapsulada em função SECURITY DEFINER (descendant_profile_ids)
-- para evitar recursão de policy chamando policy. Padrão estabelecido em
-- is_super_admin_safe (migration 20260113000001).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Helpers de hierarquia
-- =============================================================================

-- descendant_profile_ids(root_id):
-- Retorna o conjunto de profiles abaixo de `root_id` na árvore parent_id,
-- INCLUINDO o próprio root_id. Caminhamento via WITH RECURSIVE.
-- SECURITY DEFINER + STABLE: o planner reusa dentro de um statement e
-- a recursão bypassa RLS (não dispara as policies de profiles dentro da
-- própria avaliação delas).

CREATE OR REPLACE FUNCTION public.descendant_profile_ids(root_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.profiles WHERE id = root_id
    UNION ALL
    SELECT p.id FROM public.profiles p
    JOIN tree t ON p.parent_id = t.id
  )
  SELECT id FROM tree;
$$;

-- can_manage_profile(target_id):
-- True se o caller atual pode editar/suspender target_id segundo as regras:
--   - superadmin: sempre
--   - account_manager: se target estiver na subárvore do caller (inclui ele
--     mesmo) — mas nunca pode editar a si próprio via essa policy (cai em
--     users_own_profile)
--   - enterprise: se target.tenant_id = caller.tenant_id e target.role = 'user'
--   - user: nunca (cai em users_own_profile para si mesmo)
--
-- NÃO permite editar o próprio caller via esta função (usa-se users_own_profile
-- para isso). Garante separação semântica entre "gerenciar outro" e "editar a si".

CREATE OR REPLACE FUNCTION public.can_manage_profile(target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id      UUID;
  v_caller_role    public.user_role;
  v_caller_tenant  UUID;
  v_target_role    public.user_role;
  v_target_tenant  UUID;
  v_target_parent  UUID;
BEGIN
  SELECT id, role, tenant_id
    INTO v_caller_id, v_caller_role, v_caller_tenant
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_id IS NULL THEN RETURN FALSE; END IF;
  IF v_caller_id = target_id THEN RETURN FALSE; END IF; -- self editing via outra policy

  IF v_caller_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  SELECT role, tenant_id, parent_id
    INTO v_target_role, v_target_tenant, v_target_parent
  FROM public.profiles WHERE id = target_id LIMIT 1;

  IF v_target_role IS NULL THEN RETURN FALSE; END IF;

  IF v_caller_role = 'account_manager' THEN
    RETURN target_id IN (
      SELECT id FROM public.descendant_profile_ids(v_caller_id)
      WHERE id <> v_caller_id
    );
  END IF;

  IF v_caller_role = 'enterprise' THEN
    RETURN v_target_role = 'user'
       AND v_target_tenant IS NOT NULL
       AND v_target_tenant = v_caller_tenant;
  END IF;

  RETURN FALSE;
END;
$$;

-- =============================================================================
-- 2. profiles — substituir policies básicas por hierárquicas
-- =============================================================================
-- Mantemos users_own_profile (self), service_role_full_access e o equivalente
-- superadmin (vamos recriar com nome consistente). Adicionamos policies
-- para account_manager e enterprise.

DROP POLICY IF EXISTS "super_admin_full_access" ON public.profiles;

CREATE POLICY "profiles_superadmin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe())
  WITH CHECK (public.is_super_admin_safe());

-- account_manager: SELECT e UPDATE em descendentes (não inclui self;
-- self é coberto por users_own_profile).
CREATE POLICY "profiles_account_manager_descendants_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_account_manager_safe()
    AND id IN (
      SELECT did FROM public.descendant_profile_ids(public.current_profile_id()) did
      WHERE did <> public.current_profile_id()
    )
  );

CREATE POLICY "profiles_account_manager_descendants_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_account_manager_safe()
    AND id IN (
      SELECT did FROM public.descendant_profile_ids(public.current_profile_id()) did
      WHERE did <> public.current_profile_id()
    )
  )
  WITH CHECK (
    public.is_account_manager_safe()
    AND id IN (
      SELECT did FROM public.descendant_profile_ids(public.current_profile_id()) did
      WHERE did <> public.current_profile_id()
    )
    -- impede que account_manager mude um descendente para superadmin
    AND role IN ('account_manager'::public.user_role,
                 'enterprise'::public.user_role,
                 'user'::public.user_role)
  );

-- enterprise: SELECT e UPDATE em users do mesmo tenant.
CREATE POLICY "profiles_enterprise_tenant_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_enterprise_safe()
    AND tenant_id IS NOT NULL
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles
      WHERE id = public.current_profile_id()
    )
    AND role = 'user'::public.user_role
  );

CREATE POLICY "profiles_enterprise_tenant_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_enterprise_safe()
    AND tenant_id IS NOT NULL
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles
      WHERE id = public.current_profile_id()
    )
    AND role = 'user'::public.user_role
  )
  WITH CHECK (
    public.is_enterprise_safe()
    AND tenant_id = (
      SELECT tenant_id FROM public.profiles
      WHERE id = public.current_profile_id()
    )
    AND role = 'user'::public.user_role
  );

-- INSERT em profiles é normalmente feito pelo trigger handle_new_user
-- (SECURITY DEFINER). Defesa em profundidade: bloqueia INSERT direto
-- exceto superadmin e service_role.
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
      AND tenant_id = (
        SELECT tenant_id FROM public.profiles WHERE id = public.current_profile_id()
      )
      AND parent_id = public.current_profile_id()
    )
  );

-- =============================================================================
-- 3. tenants — ampliar SELECT para account_manager
-- =============================================================================
-- Mantém as policies da Fase 1; adiciona leitura para account_manager
-- enxergar tenants dos enterprises descendentes.

CREATE POLICY "tenants_account_manager_read" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    public.is_account_manager_safe()
    AND id IN (
      SELECT p.tenant_id FROM public.profiles p
      WHERE p.tenant_id IS NOT NULL
        AND p.id IN (SELECT public.descendant_profile_ids(public.current_profile_id()))
    )
  );

-- =============================================================================
-- 4. affiliates — account_manager lê seu próprio registro
-- =============================================================================

CREATE POLICY "affiliates_self_read" ON public.affiliates
  FOR SELECT TO authenticated
  USING (
    id = (
      SELECT affiliate_id FROM public.profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "affiliates_self_update" ON public.affiliates
  FOR UPDATE TO authenticated
  USING (
    id = (
      SELECT affiliate_id FROM public.profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  )
  WITH CHECK (
    id = (
      SELECT affiliate_id FROM public.profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- =============================================================================
-- 5. user_activity_log — refinamento hierárquico
-- =============================================================================
-- Substitui a policy genérica "self_read" por uma versão que cobre
-- toda a árvore para account_manager / enterprise.

DROP POLICY IF EXISTS "user_activity_log_self_read" ON public.user_activity_log;

CREATE POLICY "user_activity_log_self_read" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE POLICY "user_activity_log_account_manager_descendants" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (
    public.is_account_manager_safe()
    AND profile_id IN (SELECT public.descendant_profile_ids(public.current_profile_id()))
  );

CREATE POLICY "user_activity_log_enterprise_tenant" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (
    public.is_enterprise_safe()
    AND profile_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.tenant_id IS NOT NULL
        AND p.tenant_id = (
          SELECT tenant_id FROM public.profiles
          WHERE id = public.current_profile_id()
        )
        AND p.role = 'user'::public.user_role
    )
  );

-- =============================================================================
-- 6. Permissão de execução das funções helper
-- =============================================================================
-- Garantir que authenticated possa EXECUTE (são STABLE SECURITY DEFINER,
-- então rodam com privilégios do owner, mas precisam de permissão para
-- serem chamadas dentro de policies).

GRANT EXECUTE ON FUNCTION public.descendant_profile_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_profile(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_safe()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_manager_safe()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_enterprise_safe()         TO authenticated;

COMMIT;
