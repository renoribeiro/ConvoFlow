-- #############################################################################
-- ##  ARQUIVADA — NUNCA FOI APLICADA E NÃO PODE SER APLICADA.               ##
-- #############################################################################
--
-- Auditoria do ledger em 2026-08-24. Este arquivo NUNCA rodou em produção.
-- Prova: as policies que ele CRIA não existem no banco
--   (profiles_self_access, profiles_super_admin_access,
--    tenants_member_read, tenants_super_admin_all)
-- e as policies que ele APAGA existem e estão em uso hoje.
--
-- SE VOCÊ RODAR ISTO, VOCÊ PERDE O ACESSO — INCLUSIVE O SEU. Ele derruba:
--   • profiles: "users_own_profile" e "service_role_full_access"
--       → quebra o login de todo mundo e o handle_new_user
--   • tenants: "Users can view own tenant", "Super admins can view all tenants",
--              "Super admins can manage all tenants"
--       → quebra o TenantProvider e o superadmin
-- E o que ele cria no lugar é de um modelo anterior à hierarquia Conta/Loja:
-- não conhece kind, parent_tenant_id, nem os cargos gerente/gestor/atendente.
--
-- A RLS REAL DE HOJE VEM DE:
--   20260513000002_user_hierarchy_rls.sql       (policies profiles_* base)
--   20260513000003_user_hierarchy_rls_fix.sql   (helpers is_my_descendant etc.)
--   20260716000002_hierarchy_v2_foundation.sql  (cargos v2 + kind/store_slots)
--   20260817000006_rls_gerente_reads_own_stores.sql (Gerente lê Loja filha)
--
-- Carimbado como aplicado no ledger (docs/reconciliar_ledger_migracoes.sql,
-- LOTE 3) de propósito: é a única forma de garantir que nenhuma ferramenta
-- tente rodá-lo. O carimbo é uma trava, não um registro de que rodou.
--
-- Mantido só como história. Não edite, não mova de volta, não rode.
-- #############################################################################

-- Security Hardening Migration: 2026-01-13
-- Objective: Fix infinite recursion risks and optimize RLS for profiles and tenants

BEGIN;

-- 1. PROFILES SECURITY
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Drop all known policies to ensure clean slate
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_full_access" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "service_role_full_access" ON public.profiles;

-- Create Optimized Policies

-- Policy 1: Users can read/update their own profile (Direct UUID match - FAST)
CREATE POLICY "profiles_self_access" ON public.profiles
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Policy 2: Super Admins Full Access (Using JWT claim if available, or direct check avoiding self-recursion)
-- We assume 'is_super_admin()' function is safe. Let's redefine it to be sure it's non-recursive.
CREATE OR REPLACE FUNCTION public.is_super_admin_safe()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    -- Check if the user has the 'super_admin' role in the profiles table.
    -- We use a direct query that bypasses RLS because this is a SECURITY DEFINER function.
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
    );
$$;

CREATE POLICY "profiles_super_admin_access" ON public.profiles
    FOR ALL
    TO authenticated
    USING (is_super_admin_safe());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- 2. TENANTS SECURITY
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can view all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can manage all tenants" ON public.tenants;

-- Optimized Tenant Policies
-- Users can see the tenant they belong to (via profile)
CREATE POLICY "tenants_member_read" ON public.tenants
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT tenant_id FROM profiles
            WHERE user_id = auth.uid()
        )
    );

-- Super Admins can do anything
CREATE POLICY "tenants_super_admin_all" ON public.tenants
    FOR ALL
    TO authenticated
    USING (is_super_admin_safe());

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

COMMIT;
