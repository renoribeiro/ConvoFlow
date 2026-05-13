-- =============================================================================
-- Hardening: RLS + policies nas 3 report_* (em uso pelo frontend)
-- =============================================================================
-- Antes: RLS DISABLED em report_data / report_executions / report_schedules.
-- Consumidas por src/hooks/useReports.ts via supabase.from(...) — qualquer
-- usuário autenticado lia relatórios de qualquer tenant.
--
-- Todas as três têm coluna tenant_id, então o padrão usado nas tabelas
-- críticas (tenant_id = get_current_user_tenant_id() + is_super_admin())
-- se aplica diretamente.
-- =============================================================================

BEGIN;

-- 1. report_data
ALTER TABLE public.report_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant report data"   ON public.report_data;
DROP POLICY IF EXISTS "Users can manage their tenant report data" ON public.report_data;
DROP POLICY IF EXISTS "report_data_tenant_select"                 ON public.report_data;
DROP POLICY IF EXISTS "report_data_tenant_all"                    ON public.report_data;
DROP POLICY IF EXISTS "report_data_superadmin_all"                ON public.report_data;

CREATE POLICY "report_data_tenant_all" ON public.report_data
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.get_current_user_tenant_id())
  WITH CHECK (public.is_super_admin() OR tenant_id = public.get_current_user_tenant_id());

-- 2. report_executions
ALTER TABLE public.report_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant report executions"   ON public.report_executions;
DROP POLICY IF EXISTS "Users can manage their tenant report executions" ON public.report_executions;
DROP POLICY IF EXISTS "report_executions_tenant_select"                 ON public.report_executions;
DROP POLICY IF EXISTS "report_executions_tenant_all"                    ON public.report_executions;
DROP POLICY IF EXISTS "report_executions_superadmin_all"                ON public.report_executions;

CREATE POLICY "report_executions_tenant_all" ON public.report_executions
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.get_current_user_tenant_id())
  WITH CHECK (public.is_super_admin() OR tenant_id = public.get_current_user_tenant_id());

-- 3. report_schedules
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant report schedules"   ON public.report_schedules;
DROP POLICY IF EXISTS "Users can manage their tenant report schedules" ON public.report_schedules;
DROP POLICY IF EXISTS "report_schedules_tenant_select"                 ON public.report_schedules;
DROP POLICY IF EXISTS "report_schedules_tenant_all"                    ON public.report_schedules;
DROP POLICY IF EXISTS "report_schedules_superadmin_all"                ON public.report_schedules;

CREATE POLICY "report_schedules_tenant_all" ON public.report_schedules
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.get_current_user_tenant_id())
  WITH CHECK (public.is_super_admin() OR tenant_id = public.get_current_user_tenant_id());

COMMIT;
