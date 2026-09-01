-- =============================================================================
-- Lote 3/5 — initplan nas policies de acesso e layout
--   tenants, whatsapp_instances, module_settings, notifications  (16 policies)
--
-- O QUE MUDA: só o envelopamento em (SELECT ...).
--
-- Duas novidades em relação aos lotes 1 e 2:
--   * auth.role() aparece em module_settings — mesmo tratamento de auth.uid().
--   * has_capability('whatsapp.configure') recebe argumento, mas o argumento é
--     uma CONSTANTE literal, igual em toda linha. Por isso pode ser içada. É
--     STABLE SECURITY DEFINER, confirmado no catálogo. (Diferente de
--     is_my_descendant(id), que recebe coluna e por isso ficou de fora no lote 2.)
--
-- NÃO MUDA:
--   * "System can insert notifications" (WITH CHECK true) — não tem chamada.
--   * is_tenant_in_my_descendants(id) em tenants_account_manager_read — recebe
--     coluna. Só a guarda is_account_manager_safe() é içada, e ela faz
--     curto-circuito para quem não é gerente.
--
-- REVERT — texto exato antes deste lote:
--   module_settings / authenticated_read_module_settings  SELECT
--     USING (auth.role() = 'authenticated'::text)
--   module_settings / superadmin_full_access_module_settings  ALL
--     USING (EXISTS ( SELECT 1 FROM profiles
--            WHERE ((profiles.user_id = auth.uid())
--              AND (profiles.role = 'superadmin'::user_role)
--              AND (profiles.is_active = true))))
--   notifications / "Users can update their own notifications"  UPDATE
--     USING ((tenant_id = get_current_user_tenant_id())
--            AND ((user_id IS NULL) OR (user_id = auth.uid())))
--   notifications / "Users can view their own notifications"  SELECT
--     USING (mesmo texto acima)
--   notifications / notifications_select_own  SELECT authenticated
--     USING (user_id = auth.uid())
--   notifications / notifications_update_own  UPDATE authenticated
--     USING (user_id = auth.uid())  WITH CHECK (user_id = auth.uid())
--   tenants / "Super admins can manage all tenants"  ALL   USING is_super_admin()
--   tenants / "Super admins can view all tenants"    SELECT USING is_super_admin()
--   tenants / "Users can view own tenant"            SELECT
--     USING (id = get_current_user_tenant_id())
--   tenants / tenants_account_manager_read  SELECT authenticated
--     USING (is_account_manager_safe() AND is_tenant_in_my_descendants(id))
--   tenants / tenants_parent_reads_child_stores  SELECT authenticated
--     USING ((kind = 'store'::text) AND (parent_tenant_id IS NOT NULL)
--            AND (parent_tenant_id = get_current_user_tenant_id()))
--   whatsapp_instances / "Super admins can access all whatsapp instances"  ALL
--     USING is_super_admin()
--   whatsapp_instances / whatsapp_instances_tenant_delete  DELETE
--     USING ((tenant_id = get_current_user_tenant_id())
--            AND has_capability('whatsapp.configure'::text))
--   whatsapp_instances / whatsapp_instances_tenant_insert  INSERT
--     WITH CHECK (mesmo texto acima)
--   whatsapp_instances / whatsapp_instances_tenant_select  SELECT
--     USING (tenant_id = get_current_user_tenant_id())
--   whatsapp_instances / whatsapp_instances_tenant_update  UPDATE
--     USING (mesmo texto do delete)  WITH CHECK (mesmo texto do delete)
-- =============================================================================

DO $lote3$
DECLARE
  n_antes int;
  n_cru   int;
BEGIN
  SELECT count(*) INTO n_antes FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('tenants','whatsapp_instances','module_settings','notifications');
  IF n_antes <> 17 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 17 policies no lote 3, encontrei %. Nada foi alterado.', n_antes;
  END IF;

  -- ---- module_settings ----
  ALTER POLICY authenticated_read_module_settings ON public.module_settings
    USING ((SELECT auth.role()) = 'authenticated'::text);
  ALTER POLICY superadmin_full_access_module_settings ON public.module_settings
    USING (EXISTS (SELECT 1 FROM public.profiles
                    WHERE profiles.user_id = (SELECT auth.uid())
                      AND profiles.role = 'superadmin'::public.user_role
                      AND profiles.is_active = true));

  -- ---- notifications ----
  ALTER POLICY "Users can update their own notifications" ON public.notifications
    USING ((tenant_id = (SELECT public.get_current_user_tenant_id()))
           AND ((user_id IS NULL) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY "Users can view their own notifications" ON public.notifications
    USING ((tenant_id = (SELECT public.get_current_user_tenant_id()))
           AND ((user_id IS NULL) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY notifications_select_own ON public.notifications
    USING (user_id = (SELECT auth.uid()));
  ALTER POLICY notifications_update_own ON public.notifications
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

  -- ---- tenants ----
  ALTER POLICY "Super admins can manage all tenants" ON public.tenants
    USING ((SELECT public.is_super_admin()));
  ALTER POLICY "Super admins can view all tenants" ON public.tenants
    USING ((SELECT public.is_super_admin()));
  ALTER POLICY "Users can view own tenant" ON public.tenants
    USING (id = (SELECT public.get_current_user_tenant_id()));
  ALTER POLICY tenants_account_manager_read ON public.tenants
    USING ((SELECT public.is_account_manager_safe()) AND public.is_tenant_in_my_descendants(id));
  ALTER POLICY tenants_parent_reads_child_stores ON public.tenants
    USING ((kind = 'store'::text) AND (parent_tenant_id IS NOT NULL)
           AND (parent_tenant_id = (SELECT public.get_current_user_tenant_id())));

  -- ---- whatsapp_instances ----
  ALTER POLICY "Super admins can access all whatsapp instances" ON public.whatsapp_instances
    USING ((SELECT public.is_super_admin()));
  ALTER POLICY whatsapp_instances_tenant_delete ON public.whatsapp_instances
    USING ((tenant_id = (SELECT public.get_current_user_tenant_id()))
           AND (SELECT public.has_capability('whatsapp.configure'::text)));
  ALTER POLICY whatsapp_instances_tenant_insert ON public.whatsapp_instances
    WITH CHECK ((tenant_id = (SELECT public.get_current_user_tenant_id()))
                AND (SELECT public.has_capability('whatsapp.configure'::text)));
  ALTER POLICY whatsapp_instances_tenant_select ON public.whatsapp_instances
    USING (tenant_id = (SELECT public.get_current_user_tenant_id()));
  ALTER POLICY whatsapp_instances_tenant_update ON public.whatsapp_instances
    USING ((tenant_id = (SELECT public.get_current_user_tenant_id()))
           AND (SELECT public.has_capability('whatsapp.configure'::text)))
    WITH CHECK ((tenant_id = (SELECT public.get_current_user_tenant_id()))
                AND (SELECT public.has_capability('whatsapp.configure'::text)));

  SELECT count(*) INTO n_cru FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('tenants','whatsapp_instances','module_settings','notifications')
     AND regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
           'SELECT\s+(public\.)?(auth\.uid|auth\.role|is_super_admin|is_account_manager_safe|get_current_user_tenant_id|has_capability)\([^)]*\)', '', 'g')
         ~ '(auth\.uid|auth\.role|is_super_admin|is_account_manager_safe|get_current_user_tenant_id|has_capability)\(';
  IF n_cru > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % policy(ies) do lote 3 com chamada crua. Desfazendo.', n_cru;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260831000007', 'rls_initplan_lote3_acesso')
  ON CONFLICT (version) DO NOTHING;
END
$lote3$;
