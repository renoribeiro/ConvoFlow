-- =============================================================================
-- Hardening URGENTE: webhook_logs / webhook_errors
-- =============================================================================
-- Antes: policies "webhook_logs_select_policy" e "webhook_errors_select_policy"
-- com USING (true) para role public. Qualquer cliente com a anon key conseguia
-- ler payloads completos de webhook (mensagens, numeros, instance_id) de
-- todos os tenants.
--
-- Depois:
--   webhook_logs   -> isolamento via JOIN em whatsapp_instances.tenant_id
--   webhook_errors -> apenas superadmin (sem FK para tenant; nao consumida
--                     diretamente pelo cliente).
-- INSERT/UPDATE seguem via service_role nas Edge Functions (bypassa RLS).
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "webhook_logs_select_policy"      ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_tenant_isolation"   ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_superadmin_all"     ON public.webhook_logs;

CREATE POLICY "webhook_logs_tenant_isolation" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      whatsapp_instance_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.whatsapp_instances wi
        WHERE wi.id = webhook_logs.whatsapp_instance_id
          AND wi.tenant_id = public.get_current_user_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS "webhook_errors_select_policy"    ON public.webhook_errors;
DROP POLICY IF EXISTS "webhook_errors_tenant_isolation" ON public.webhook_errors;
DROP POLICY IF EXISTS "webhook_errors_superadmin_all"   ON public.webhook_errors;

CREATE POLICY "webhook_errors_superadmin_all" ON public.webhook_errors
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;
