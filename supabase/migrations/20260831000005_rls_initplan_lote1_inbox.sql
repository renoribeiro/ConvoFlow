-- =============================================================================
-- Lote 1/5 — initplan nas policies do caminho do inbox
--
-- O QUE MUDA: nada de significado. Cada chamada de função sem argumento passa a
-- ser envolvida em (SELECT ...), o que a transforma num InitPlan avaliado UMA
-- vez por comando em vez de uma vez por linha. Todos os helpers envolvidos são
-- STABLE, e STABLE quer dizer exatamente "não muda dentro do mesmo comando" —
-- então o resultado é idêntico por definição.
--
-- Nenhuma policy é criada, removida, fundida ou tem roles/cmd alterados.
--
-- REVERT — texto exato das 14 policies antes deste lote:
--   contact_tags / "Super admins can access all contact tags"  ALL
--     USING is_super_admin()
--   contact_tags / "Users can access own tenant contact tags"  ALL
--     USING (EXISTS ( SELECT 1 FROM contacts c
--                      WHERE ((c.id = contact_tags.contact_id)
--                        AND (c.tenant_id = get_current_user_tenant_id()))))
--   contacts / "Super admins can access all contacts"          ALL
--     USING is_super_admin()
--   contacts / "Users can access own tenant contacts"          ALL
--     USING (tenant_id = get_current_user_tenant_id())
--   conversations / "Users can delete conversations from their tenant"  DELETE
--     USING (tenant_id IN ( SELECT profiles.tenant_id FROM profiles
--                            WHERE (profiles.user_id = auth.uid())))
--   conversations / "Users can insert conversations for their tenant"   INSERT
--     WITH CHECK (mesmo texto acima)
--   conversations / "Users can update conversations from their tenant"  UPDATE
--     USING (mesmo texto acima)
--   conversations / "Users can view conversations from their tenant"    SELECT
--     USING (mesmo texto acima)
--   lead_tracking / "Users can manage their tenant lead tracking"  ALL
--     USING (tenant_id = get_current_user_tenant_id())
--   lead_tracking / "Users can view their tenant lead tracking"    SELECT
--     USING (tenant_id = get_current_user_tenant_id())
--   messages / "Super admins can access all messages"           ALL
--     USING is_super_admin()
--   messages / "Users can access own tenant messages"           ALL
--     USING (tenant_id = get_current_user_tenant_id())
--   quick_replies / quick_replies_superadmin_all                ALL
--     USING is_super_admin_safe()  WITH CHECK is_super_admin_safe()
--   quick_replies / quick_replies_tenant_all                    ALL
--     USING (tenant_id = get_current_user_tenant_id())
--     WITH CHECK (tenant_id = get_current_user_tenant_id())
--
-- Guarda + escrita + conferência vivem no MESMO bloco DO: no SQL Editor do
-- Supabase, BEGIN/COMMIT não garante atomicidade, mas um bloco DO é um comando
-- só (ver CLAUDE.md, armadilha 4).
-- =============================================================================

DO $lote1$
DECLARE
  n_antes int;
  n_cru   int;
BEGIN
  -- ---- guarda: as 14 policies têm de existir, exatamente estas ----
  SELECT count(*) INTO n_antes
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (tablename, policyname) IN (
       ('contact_tags','Super admins can access all contact tags'),
       ('contact_tags','Users can access own tenant contact tags'),
       ('contacts','Super admins can access all contacts'),
       ('contacts','Users can access own tenant contacts'),
       ('conversations','Users can delete conversations from their tenant'),
       ('conversations','Users can insert conversations for their tenant'),
       ('conversations','Users can update conversations from their tenant'),
       ('conversations','Users can view conversations from their tenant'),
       ('lead_tracking','Users can manage their tenant lead tracking'),
       ('lead_tracking','Users can view their tenant lead tracking'),
       ('messages','Super admins can access all messages'),
       ('messages','Users can access own tenant messages'),
       ('quick_replies','quick_replies_superadmin_all'),
       ('quick_replies','quick_replies_tenant_all'));

  IF n_antes <> 14 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 14 policies do lote 1, encontrei %. Nada foi alterado.', n_antes;
  END IF;

  -- ---- contact_tags ----
  ALTER POLICY "Super admins can access all contact tags" ON public.contact_tags
    USING ((SELECT public.is_super_admin()));
  ALTER POLICY "Users can access own tenant contact tags" ON public.contact_tags
    USING (EXISTS (SELECT 1 FROM public.contacts c
                    WHERE c.id = contact_tags.contact_id
                      AND c.tenant_id = (SELECT public.get_current_user_tenant_id())));

  -- ---- contacts ----
  ALTER POLICY "Super admins can access all contacts" ON public.contacts
    USING ((SELECT public.is_super_admin()));
  ALTER POLICY "Users can access own tenant contacts" ON public.contacts
    USING (tenant_id = (SELECT public.get_current_user_tenant_id()));

  -- ---- conversations ----
  ALTER POLICY "Users can delete conversations from their tenant" ON public.conversations
    USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p
                          WHERE p.user_id = (SELECT auth.uid())));
  ALTER POLICY "Users can insert conversations for their tenant" ON public.conversations
    WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p
                               WHERE p.user_id = (SELECT auth.uid())));
  ALTER POLICY "Users can update conversations from their tenant" ON public.conversations
    USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p
                          WHERE p.user_id = (SELECT auth.uid())));
  ALTER POLICY "Users can view conversations from their tenant" ON public.conversations
    USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p
                          WHERE p.user_id = (SELECT auth.uid())));

  -- ---- lead_tracking ----
  ALTER POLICY "Users can manage their tenant lead tracking" ON public.lead_tracking
    USING (tenant_id = (SELECT public.get_current_user_tenant_id()));
  ALTER POLICY "Users can view their tenant lead tracking" ON public.lead_tracking
    USING (tenant_id = (SELECT public.get_current_user_tenant_id()));

  -- ---- messages ----
  ALTER POLICY "Super admins can access all messages" ON public.messages
    USING ((SELECT public.is_super_admin()));
  ALTER POLICY "Users can access own tenant messages" ON public.messages
    USING (tenant_id = (SELECT public.get_current_user_tenant_id()));

  -- ---- quick_replies ----
  ALTER POLICY quick_replies_superadmin_all ON public.quick_replies
    USING ((SELECT public.is_super_admin_safe()))
    WITH CHECK ((SELECT public.is_super_admin_safe()));
  ALTER POLICY quick_replies_tenant_all ON public.quick_replies
    USING (tenant_id = (SELECT public.get_current_user_tenant_id()))
    WITH CHECK (tenant_id = (SELECT public.get_current_user_tenant_id()));

  -- ---- conferência: nenhuma das 14 pode ter sobrado com chamada crua ----
  SELECT count(*) INTO n_cru
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('contact_tags','contacts','conversations','lead_tracking','messages','quick_replies')
     -- tira o que JA esta envolvido em (SELECT ...) e ve se sobrou chamada crua
     AND regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
           'SELECT\s+(public\.)?(auth\.uid|is_super_admin|is_super_admin_safe|is_account_manager_safe|is_enterprise_safe|is_gerente_safe|is_gestor_safe|current_profile_id|get_current_user_tenant_id)\(\)', '', 'g')
         ~ '(auth\.uid|is_super_admin|is_super_admin_safe|is_account_manager_safe|is_enterprise_safe|is_gerente_safe|is_gestor_safe|current_profile_id|get_current_user_tenant_id)\(\)';

  IF n_cru > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % policy(ies) do lote 1 continuam com chamada crua. Desfazendo.', n_cru;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260831000005', 'rls_initplan_lote1_inbox')
  ON CONFLICT (version) DO NOTHING;
END
$lote1$;
