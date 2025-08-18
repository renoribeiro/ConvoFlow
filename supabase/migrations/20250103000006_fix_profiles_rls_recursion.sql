-- Fix infinite recursion in profiles RLS policies
-- This migration removes problematic policies and creates simple, direct policies for super admins

-- Drop all existing policies on profiles table to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Tenant admins can view tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Tenant admins can manage tenant profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;

-- Create simple, non-recursive policies

-- 1. Super admins can do everything (using direct role column check)
CREATE POLICY "super_admin_full_access" ON profiles
  FOR ALL
  TO authenticated
  USING (role = 'super_admin')
  WITH CHECK (role = 'super_admin');

-- 2. Users can view and update their own profile (using auth.uid() directly)
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Allow service role full access (for admin operations)
CREATE POLICY "service_role_full_access" ON profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant necessary permissions to roles
GRANT ALL PRIVILEGES ON profiles TO authenticated;
GRANT ALL PRIVILEGES ON profiles TO anon;
GRANT ALL PRIVILEGES ON profiles TO service_role;

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create a function to check if current user is super admin (without recursion)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  );
$$;

-- Alternative policy using the function (commented out to avoid conflicts)
-- DROP POLICY IF EXISTS "super_admin_access_via_function" ON profiles;
-- CREATE POLICY "super_admin_access_via_function" ON profiles
--   FOR ALL
--   TO authenticated
--   USING (is_super_admin())
--   WITH CHECK (is_super_admin());

COMMIT;