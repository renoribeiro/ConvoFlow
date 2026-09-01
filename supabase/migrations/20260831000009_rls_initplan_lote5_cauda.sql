-- =============================================================================
-- Lote 5/5 — initplan na cauda longa (55 policies)
--   system_*, stripe_*, affiliate_*, commission_*, subscriptions, coupons,
--   usage_limits, bug_reports, user_activity_log, tenant_access_events,
--   tenant_module_settings, service_status, alert_rules, performance_history,
--   instance_secrets, whatsapp_policy_*, rate_limits e o que mais sobrou.
--
-- Fecha o conjunto: 14 + 7 + 16 + 78 + 55 = 170 policies, que é o total de
-- policies do schema public com chamada avaliada por linha.
--
-- Mesmo motor dos lotes anteriores (pg_temp.wrap), mesma prova de reversão
-- (unwrap(wrap(x)) = x conferido nas 136 policies restantes antes de aplicar).
--
-- OBSERVAÇÃO honesta sobre duas policies desta cauda:
--   tenant_module_settings_* comparam `profiles.id = auth.uid()` — deveria ser
--   `profiles.user_id`. É bug PRÉ-EXISTENTE e fica preservado tal e qual: este
--   lote só troca onde a função é avaliada, não o que ela compara.
--   (tenant_module_settings é do sistema de módulos MORTO — o vivo é
--   module_settings. Ver CLAUDE.md.)
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.wrap(s text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $w$
DECLARE fn text; out text := s;
BEGIN
  IF out IS NULL THEN RETURN NULL; END IF;
  FOREACH fn IN ARRAY ARRAY['get_current_user_tenant_id','is_super_admin_safe','is_super_admin',
                            'is_account_manager_safe','is_enterprise_safe','is_gerente_safe',
                            'is_gestor_safe','current_profile_id'] LOOP
    out := regexp_replace(out, 'SELECT\s+'||fn||'\(\)', '@@P@@', 'g');
    out := regexp_replace(out, '(^|[^a-zA-Z0-9_.])'||fn||'\(\)', '\1( SELECT '||fn||'() )', 'g');
    out := replace(out, '@@P@@', 'SELECT '||fn||'()');
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['uid','role','jwt'] LOOP
    out := regexp_replace(out, 'SELECT\s+auth\.'||fn||'\(\)', '@@P@@', 'g');
    out := regexp_replace(out, 'auth\.'||fn||'\(\)', '( SELECT auth.'||fn||'() )', 'g');
    out := replace(out, '@@P@@', 'SELECT auth.'||fn||'()');
  END LOOP;
  out := regexp_replace(out, 'SELECT\s+has_capability\(', '@@P@@', 'g');
  out := regexp_replace(out, '(^|[^a-zA-Z0-9_.])has_capability\((''[^'']*''(::text)?)\)', '\1( SELECT has_capability(\2) )', 'g');
  out := replace(out, '@@P@@', 'SELECT has_capability(');
  RETURN out;
END
$w$;

CREATE OR REPLACE FUNCTION pg_temp.unwrap(s text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $u$
DECLARE fn text; out text := s;
BEGIN
  IF out IS NULL THEN RETURN NULL; END IF;
  FOREACH fn IN ARRAY ARRAY['get_current_user_tenant_id','is_super_admin_safe','is_super_admin',
                            'is_account_manager_safe','is_enterprise_safe','is_gerente_safe',
                            'is_gestor_safe','current_profile_id'] LOOP
    out := replace(out, '( SELECT '||fn||'() )', fn||'()');
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['uid','role','jwt'] LOOP
    out := replace(out, '( SELECT auth.'||fn||'() )', 'auth.'||fn||'()');
  END LOOP;
  out := regexp_replace(out, '\( SELECT has_capability\((''[^'']*''(::text)?)\) \)', 'has_capability(\1)', 'g');
  RETURN out;
END
$u$;

CREATE TEMP TABLE _lote5_alvo AS
SELECT tablename, policyname, qual, with_check,
       pg_temp.wrap(qual) AS nq, pg_temp.wrap(with_check) AS nwc
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (pg_temp.wrap(qual) IS DISTINCT FROM qual
     OR pg_temp.wrap(with_check) IS DISTINCT FROM with_check);

DO $lote5$
DECLARE
  r record; stmt text; n int := 0; n_cru int; n_roundtrip int;
BEGIN
  SELECT count(*) INTO n_roundtrip FROM _lote5_alvo
   WHERE pg_temp.unwrap(nq) IS DISTINCT FROM qual
      OR pg_temp.unwrap(nwc) IS DISTINCT FROM with_check;
  IF n_roundtrip > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % policy(ies) nao sobrevivem ao round-trip. Nada foi alterado.', n_roundtrip;
  END IF;

  SELECT count(*) INTO n FROM _lote5_alvo;
  IF n <> 55 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 55 policies no lote 5, encontrei %. Nada foi alterado.', n;
  END IF;

  n := 0;
  FOR r IN SELECT * FROM _lote5_alvo LOOP
    stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.nq  IS NOT NULL THEN stmt := stmt || format(' USING (%s)', r.nq); END IF;
    IF r.nwc IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', r.nwc); END IF;
    EXECUTE stmt;
    n := n + 1;
  END LOOP;

  -- conferência final do schema INTEIRO: zero policy com chamada crua
  SELECT count(*) INTO n_cru FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND (pg_temp.wrap(p.qual) IS DISTINCT FROM p.qual
       OR pg_temp.wrap(p.with_check) IS DISTINCT FROM p.with_check);
  IF n_cru > 0 THEN
    RAISE EXCEPTION 'ABORTADO: sobraram % policy(ies) com chamada crua no schema. Desfazendo.', n_cru;
  END IF;

  RAISE NOTICE 'lote 5: % policies reescritas; schema public com zero chamada crua', n;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260831000009', 'rls_initplan_lote5_cauda')
  ON CONFLICT (version) DO NOTHING;
END
$lote5$;
