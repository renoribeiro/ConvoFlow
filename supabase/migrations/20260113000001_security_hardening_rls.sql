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
