-- =============================================================================
-- Fase 1 — Isolar tenants de Yuri (vira Loja) e Reno (tenant NULL = superadmin)
-- =============================================================================
-- Estado anterior (problema reportado):
--   - reno@re9.online    (superadmin) | tenant_id = 55741cc1-... ("Super Admin Tenant")
--   - yuri17raulino@...  (user)       | tenant_id = 55741cc1-...  (MESMO tenant!)
--   - 200 contatos, 4 conversas, 8 mensagens, 1 instância vivem nesse tenant.
--
-- Pelo design (Loja/Agência/Superadmin), os dois NÃO podiam compartilhar tenant.
-- Reno (superadmin) deve ter tenant_id = NULL; Yuri vira Loja em tenant próprio.
--
-- Per decisão do usuário (2026-05-13), os dados em "Super Admin Tenant" são do Yuri
-- e devem ser preservados — movemos eles pro novo tenant da Loja do Yuri.
--
-- IMPORTANTE — listagem de tabelas: a lista vem de
-- `information_schema.columns WHERE column_name = 'tenant_id' AND table_schema='public'`.
-- Excluímos VIEWs (report_statistics, tenant_active_modules) porque view com GROUP BY
-- não é auto-updatable. Excluímos `tenants` (target) e `profiles` (tratado acima).
--
-- Rollback (manual, ordem reversa):
--   1. SELECT id FROM tenants WHERE slug = 'loja-yuri-saldanha';  -- :uuid
--   2. INSERT INTO tenants (id, name, slug, status, plan_type)
--      VALUES ('55741cc1-...', 'Super Admin Tenant', 'super-admin', 'active', 'basic');
--   3. UPDATE profiles SET tenant_id = '55741cc1-...' , role='user'
--        WHERE user_id = (SELECT id FROM auth.users WHERE email='yuri17raulino@gmail.com');
--   4. UPDATE profiles SET tenant_id = '55741cc1-...'
--        WHERE user_id = (SELECT id FROM auth.users WHERE email='reno@re9.online');
--   5. UPDATE <todas as 33 tabelas> SET tenant_id='55741cc1-...' WHERE tenant_id=:uuid;
--   6. DELETE FROM tenants WHERE id = :uuid;
-- =============================================================================

DO $$
DECLARE
  v_new_yuri_tenant_id  uuid;
  v_old_super_tenant_id constant uuid := '55741cc1-8b57-4755-81d6-ebb90b81a2ca';
  v_yuri_user_id        uuid;
  v_reno_user_id        uuid;
BEGIN
  SELECT id INTO v_yuri_user_id FROM auth.users WHERE email = 'yuri17raulino@gmail.com' LIMIT 1;
  SELECT id INTO v_reno_user_id FROM auth.users WHERE email = 'reno@re9.online' LIMIT 1;

  IF v_yuri_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário yuri17raulino@gmail.com não encontrado em auth.users';
  END IF;
  IF v_reno_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário reno@re9.online não encontrado em auth.users';
  END IF;

  -- Criar tenant pra Loja do Yuri (independente, sem agência pai)
  INSERT INTO public.tenants (name, slug, status, plan_type, parent_tenant_id)
  VALUES ('Loja - Yuri Saldanha', 'loja-yuri-saldanha', 'active'::tenant_status, 'basic', NULL)
  RETURNING id INTO v_new_yuri_tenant_id;

  RAISE NOTICE 'Novo tenant criado para Yuri: %', v_new_yuri_tenant_id;

  -- Yuri (já é role=loja após Migration B) move pro tenant próprio
  UPDATE public.profiles
  SET tenant_id = v_new_yuri_tenant_id
  WHERE user_id = v_yuri_user_id;

  -- Reno (superadmin) fica com tenant_id NULL
  UPDATE public.profiles
  SET tenant_id = NULL
  WHERE user_id = v_reno_user_id
    AND role = 'superadmin'::public.user_role;

  -- Mover dados das 33 tabelas tenant-scoped (excluindo views)
  UPDATE public.affiliate_referrals     SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.automation_executions   SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.automation_flows        SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.automation_step_logs    SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.campaign_executions     SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.chatbots                SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.contacts                SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.conversations           SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.follow_up_sequences     SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.funnel_stages           SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.individual_followups    SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.instance_secrets        SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.job_queue               SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.lead_sources            SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.lead_tracking           SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.mass_message_campaigns  SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.message_templates       SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.messages                SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.metrics_cache           SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.notifications           SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.report_data             SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.report_executions       SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.report_schedules        SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.report_templates        SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.scheduled_reports       SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.stripe_config           SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.stripe_transactions     SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.subscriptions           SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.tags                    SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.tenant_module_settings  SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.tracking_events         SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.traffic_sources         SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;
  UPDATE public.whatsapp_instances      SET tenant_id = v_new_yuri_tenant_id WHERE tenant_id = v_old_super_tenant_id;

  -- Apagar Super Admin Tenant se ficou vazio
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = v_old_super_tenant_id) THEN
    DELETE FROM public.tenants WHERE id = v_old_super_tenant_id;
    RAISE NOTICE 'Tenant antigo % removido.', v_old_super_tenant_id;
  ELSE
    RAISE NOTICE 'Tenant antigo % NÃO foi removido — ainda há profiles apontando pra ele.', v_old_super_tenant_id;
  END IF;
END
$$;
