-- =============================================================================
-- Lote 4/5 — initplan nas policies operacionais (78 policies, 36 tabelas)
--   automation_*, chatbot_*, campaign_*, follow_up_*, followup_*, report_*,
--   tracking_*, webhook_*, webhooks, job_queue, tags, funnel_stages,
--   lead_sources, traffic_sources, metrics_cache, individual_followups,
--   mass_message_campaigns
--
-- POR QUE GERADO EM VEZ DE ESCRITO À MÃO
--   São 78 policies. Escrever 78 ALTER na mão convida a erro de digitação num
--   lugar onde erro de digitação vaza dado. A transformação é puramente
--   mecânica, então é a máquina que a aplica, a partir do texto que já está no
--   catálogo: pg_temp.wrap() envolve cada chamada SEM argumento em (SELECT ...),
--   e nada mais. Nenhuma policy é criada, removida, fundida, nem muda de
--   roles/cmd.
--
-- REVERT — a transformação é uma bijeção, e isso foi PROVADO antes de aplicar:
--   para as 136 policies restantes, unwrap(wrap(x)) = x nas 136, zero exceções.
--   Para desfazer este lote, rode o mesmo laço trocando wrap() por unwrap()
--   (as duas funções estão definidas abaixo).
--
-- FUNÇÕES IÇADAS (todas STABLE, conferido no catálogo):
--   get_current_user_tenant_id, is_super_admin, is_super_admin_safe,
--   is_account_manager_safe, is_enterprise_safe, is_gerente_safe,
--   is_gestor_safe, current_profile_id, auth.uid, auth.role, auth.jwt,
--   e has_capability('literal') — argumento constante, portanto içável.
--
-- NÃO IÇADAS: is_my_descendant(id), is_user_in_my_tenant(id),
--   is_tenant_in_my_descendants(id) — recebem COLUNA, o valor muda por linha.
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

-- inversa, para o revert
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

CREATE TEMP TABLE _lote4_alvo AS
SELECT tablename, policyname, qual, with_check,
       pg_temp.wrap(qual) AS nq, pg_temp.wrap(with_check) AS nwc
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (tablename ~ '^(automation_|chatbot_|campaign_|followup_|follow_up_|webhook_|tracking_|report_)'
        OR tablename IN ('individual_followups','mass_message_campaigns','job_queue','webhooks','tags',
                         'funnel_stages','lead_sources','traffic_sources','metrics_cache'))
   AND (pg_temp.wrap(qual) IS DISTINCT FROM qual
     OR pg_temp.wrap(with_check) IS DISTINCT FROM with_check);

DO $lote4$
DECLARE
  r record; stmt text; n int := 0; n_cru int; n_roundtrip int;
BEGIN
  -- guarda 1: a bijeção tem de valer para TODAS as linhas que vou tocar
  SELECT count(*) INTO n_roundtrip FROM _lote4_alvo
   WHERE pg_temp.unwrap(nq) IS DISTINCT FROM qual
      OR pg_temp.unwrap(nwc) IS DISTINCT FROM with_check;
  IF n_roundtrip > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % policy(ies) nao sobrevivem ao round-trip. Nada foi alterado.', n_roundtrip;
  END IF;

  -- guarda 2: volume esperado
  SELECT count(*) INTO n FROM _lote4_alvo;
  IF n <> 78 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 78 policies no lote 4, encontrei %. Nada foi alterado.', n;
  END IF;

  n := 0;
  FOR r IN SELECT * FROM _lote4_alvo LOOP
    stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.nq  IS NOT NULL THEN stmt := stmt || format(' USING (%s)', r.nq); END IF;
    IF r.nwc IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', r.nwc); END IF;
    EXECUTE stmt;
    n := n + 1;
  END LOOP;

  -- conferência: nenhuma chamada crua sobrou nas tabelas do lote
  SELECT count(*) INTO n_cru FROM pg_policies p
   JOIN (SELECT DISTINCT tablename FROM _lote4_alvo) a USING (tablename)
   WHERE p.schemaname = 'public'
     AND pg_temp.wrap(coalesce(p.qual,'') || ' ' || coalesce(p.with_check,''))
         IS DISTINCT FROM (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,''));
  IF n_cru > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % policy(ies) do lote 4 continuam com chamada crua. Desfazendo.', n_cru;
  END IF;

  RAISE NOTICE 'lote 4: % policies reescritas', n;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260831000008', 'rls_initplan_lote4_operacional')
  ON CONFLICT (version) DO NOTHING;
END
$lote4$;
