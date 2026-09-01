-- =============================================================================
-- teste_isolamento_rls.sql - rede de seguranca para mexer em RLS.
--
-- O QUE FAZ
--   Semeia DUAS organizacoes falsas (Conta + Loja em cada uma) e 7 perfis
--   cobrindo os quatro cargos, com dados nas tabelas que carregam tenant_id.
--   Depois vira o papel para `authenticated`, troca a identidade pelo
--   request.jwt.claims e afirma, para cada identidade e cada tabela:
--     - ve exatamente as linhas da propria Conta/Loja        (SELECT proprio)
--     - ve ZERO linhas da outra organizacao                  (SELECT alheio)
--     - nao consegue alterar nem apagar linha alheia         (UPDATE/DELETE alheio)
--     - nao consegue inserir linha com tenant_id alheio      (INSERT alheio recusado)
--   Cobre tambem a dimensao de cargo na tabela `tenants`:
--     - Gerente le a propria Conta E a Loja filha
--     - membro de Loja NAO le a Conta pai
--     - superadmin le tudo
--
-- SEGURANCA - por que da para rodar isto contra producao
--   O script inteiro vive dentro de BEGIN ... ROLLBACK, e o ROLLBACK e
--   incondicional: passando ou falhando, o banco volta exatamente ao que era.
--   Medido em 2026-08-31: nenhum residuo de fixture, e a policy sabotada pelo
--   modo de auto-teste volta sozinha ao texto original.
--
--   A semeadura roda com session_replication_role = replica, para nao disparar
--   os triggers de webhook / automacao / refresh de materialized view. As
--   AFIRMACOES rodam com session_replication_role = origin, entao RLS e FK
--   valem normalmente - senao o teste nao testaria nada.
--
-- COMO RODAR
--   Precisa de uma conexao com papel `postgres`. O MCP read-only nao serve:
--   `supabase_read_only_user` nao consegue SET ROLE authenticated.
--
-- MODO AUTO-TESTE (prova que a suite sabe falhar)
--   Descomente o bloco SABOTAGEM da secao 5. Ele troca a policy de tenant de
--   `contacts` por `USING (true)` DENTRO da transacao e roda a bateria de novo.
--   Esperado: fase 1 verde, fase 2 vermelha com falhas so em `contacts`.
--   Medido em 2026-08-31: 150 ok / 0 falhas  ->  124 ok / 26 falhas.
--   (medido na versao de 5 tabelas; a suite atual cobre 6 e faz 194 checks)
--
-- COMO LER O RESULTADO
--   A coluna `placar` resume cada fase. Em caso de falha, `expected` vs `actual`
--   diz se foi vazamento (viu demais) ou bloqueio indevido (viu menos).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guarda: os UUIDs da fixture nao podem colidir com dado real.
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants
     WHERE id IN ('11111111-0000-4000-8000-000000000001',
                  '11111111-0000-4000-8000-000000000002',
                  '22222222-0000-4000-8000-000000000001',
                  '22222222-0000-4000-8000-000000000002')
  ) THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('11111111-0000-4000-8000-000000000001','FIXTURE Conta A','fixture-conta-a','account', NULL,'active','active'),
  ('11111111-0000-4000-8000-000000000002','FIXTURE Loja A','fixture-loja-a','store','11111111-0000-4000-8000-000000000001','active',NULL),
  ('22222222-0000-4000-8000-000000000001','FIXTURE Conta B','fixture-conta-b','account', NULL,'active','active'),
  ('22222222-0000-4000-8000-000000000002','FIXTURE Loja B','fixture-loja-b','store','22222222-0000-4000-8000-000000000001','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name) VALUES
  ('99999999-0000-4000-8000-0000000000f0','99999999-0000-4000-8000-000000000000','11111111-0000-4000-8000-000000000001','superadmin', NULL,'active','FIX super'),
  ('11111111-0000-4000-8000-0000000000fa','11111111-0000-4000-8000-00000000000a','11111111-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX A ger'),
  ('11111111-0000-4000-8000-0000000000fb','11111111-0000-4000-8000-00000000000b','11111111-0000-4000-8000-000000000002','gestor','11111111-0000-4000-8000-0000000000fa','active','FIX A ges'),
  ('11111111-0000-4000-8000-0000000000fc','11111111-0000-4000-8000-00000000000c','11111111-0000-4000-8000-000000000002','atendente','11111111-0000-4000-8000-0000000000fb','active','FIX A atd'),
  ('22222222-0000-4000-8000-0000000000fa','22222222-0000-4000-8000-00000000000a','22222222-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX B ger'),
  ('22222222-0000-4000-8000-0000000000fb','22222222-0000-4000-8000-00000000000b','22222222-0000-4000-8000-000000000002','gestor','22222222-0000-4000-8000-0000000000fa','active','FIX B ges'),
  ('22222222-0000-4000-8000-0000000000fc','22222222-0000-4000-8000-00000000000c','22222222-0000-4000-8000-000000000002','atendente','22222222-0000-4000-8000-0000000000fb','active','FIX B atd');

-- Dois registros por tabela em CADA um dos quatro tenants.
INSERT INTO public.contacts (tenant_id, phone, name)
SELECT t.id, '55119' || lpad((row_number() over ())::text, 8, '0'), 'FIX contato'
FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

INSERT INTO public.conversations (tenant_id, contact_id)
SELECT c.tenant_id, c.id FROM public.contacts c WHERE c.name = 'FIX contato';

INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content)
SELECT c.tenant_id, 'aaaaaaaa-0000-4000-8000-0000000000de', c.id, 'inbound', 'text', 'FIX msg'
FROM public.contacts c WHERE c.name = 'FIX contato';

INSERT INTO public.quick_replies (tenant_id, name, content)   -- unique (tenant_id, name)
SELECT t.id, 'FIX qr ' || g, 'x'
FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

INSERT INTO public.lead_tracking (tenant_id)
SELECT t.id FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

INSERT INTO public.tags (tenant_id, name)
SELECT t.id, 'FIX tag ' || g
FROM (SELECT id FROM public.tenants WHERE slug LIKE 'fixture-%') t, generate_series(1,2) g;

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Matriz de casos
--     own_tenants     = tenants cujas linhas a identidade DEVE ver
--     foreign_tenants = tenants cujas linhas ela NAO PODE ver (sempre 0)
--   Excecao: superadmin ve tudo em contacts/messages/quick_replies, porque essas
--   tres tem policy is_super_admin*. `conversations` e `lead_tracking` NAO tem -
--   isso e deliberado (privacidade de atendimento), nao um buraco a tapar.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _rls_cases (
  scenario text, jwt_sub uuid, tbl text, own_tenants uuid[], foreign_tenants uuid[]
) ON COMMIT DROP;

CREATE TEMP TABLE _rls_results (
  seq serial, phase text, scenario text, tbl text, check_kind text,
  expected int, actual int, status text
) ON COMMIT DROP;

GRANT ALL ON _rls_cases, _rls_results TO authenticated;
GRANT ALL ON SEQUENCE _rls_results_seq_seq TO authenticated;

INSERT INTO _rls_cases
SELECT i.scenario, i.jwt_sub, t.tbl,
       CASE WHEN i.scenario='superadmin' AND t.tbl IN ('contacts','messages','quick_replies','tags')
            THEN ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002',
                       '22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]
            ELSE ARRAY[i.own_tenant] END,
       CASE WHEN i.scenario='superadmin' AND t.tbl IN ('contacts','messages','quick_replies','tags')
            THEN ARRAY[]::uuid[] ELSE i.other_org END
FROM (VALUES
  ('superadmin', '99999999-0000-4000-8000-000000000000'::uuid,'11111111-0000-4000-8000-000000000001'::uuid, ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  ('A gerente',  '11111111-0000-4000-8000-00000000000a'::uuid,'11111111-0000-4000-8000-000000000001'::uuid, ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  ('A gestor',   '11111111-0000-4000-8000-00000000000b'::uuid,'11111111-0000-4000-8000-000000000002'::uuid, ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  ('A atendente','11111111-0000-4000-8000-00000000000c'::uuid,'11111111-0000-4000-8000-000000000002'::uuid, ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]),
  ('B gerente',  '22222222-0000-4000-8000-00000000000a'::uuid,'22222222-0000-4000-8000-000000000001'::uuid, ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[]),
  ('B gestor',   '22222222-0000-4000-8000-00000000000b'::uuid,'22222222-0000-4000-8000-000000000002'::uuid, ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[]),
  ('B atendente','22222222-0000-4000-8000-00000000000c'::uuid,'22222222-0000-4000-8000-000000000002'::uuid, ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[])
) AS i(scenario, jwt_sub, own_tenant, other_org)
CROSS JOIN (VALUES ('contacts'),('conversations'),('messages'),('quick_replies'),('lead_tracking'),('tags')) AS t(tbl);

-- -----------------------------------------------------------------------------
-- 3. A bateria, como funcao, para poder rodar mais de uma vez (fase intacta e
--    fase sabotada). SECURITY INVOKER: chamada por `authenticated`, roda sob RLS.
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.chk(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE c record; n_own int; n_foreign int; n_written int; ins_ok boolean;
BEGIN
  FOR c IN SELECT * FROM _rls_cases ORDER BY scenario, tbl LOOP
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', c.jwt_sub, 'role','authenticated')::text, true);

    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = ANY($1)', c.tbl)
      INTO n_own USING c.own_tenants;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,c.scenario,c.tbl,'SELECT proprio',2*array_length(c.own_tenants,1),n_own,
            CASE WHEN n_own = 2*array_length(c.own_tenants,1) THEN 'ok' ELSE 'FAIL' END);

    IF coalesce(array_length(c.foreign_tenants,1),0) > 0 THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = ANY($1)', c.tbl)
        INTO n_foreign USING c.foreign_tenants;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'SELECT alheio',0,n_foreign,
              CASE WHEN n_foreign = 0 THEN 'ok' ELSE 'FAIL' END);

      -- Um erro aqui (FK, por ex.) so acontece se a linha alheia foi ALCANCADA:
      -- ou seja, ja e falha de isolamento. Por isso vira 999, nao excecao.
      BEGIN
        EXECUTE format('WITH u AS (UPDATE public.%I SET tenant_id=tenant_id WHERE tenant_id = ANY($1) RETURNING 1) SELECT count(*) FROM u', c.tbl)
          INTO n_written USING c.foreign_tenants;
      EXCEPTION WHEN others THEN n_written := 999;
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'UPDATE alheio',0,n_written,
              CASE WHEN n_written = 0 THEN 'ok' ELSE 'FAIL' END);

      BEGIN
        EXECUTE format('WITH d AS (DELETE FROM public.%I WHERE tenant_id = ANY($1) RETURNING 1) SELECT count(*) FROM d', c.tbl)
          INTO n_written USING c.foreign_tenants;
      EXCEPTION WHEN others THEN n_written := 999;
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'DELETE alheio',0,n_written,
              CASE WHEN n_written = 0 THEN 'ok' ELSE 'FAIL' END);
    END IF;

    -- INSERT so nas tabelas sem FK obrigatoria complicada.
    IF c.tbl IN ('contacts','quick_replies','lead_tracking','tags')
       AND coalesce(array_length(c.foreign_tenants,1),0) > 0 THEN
      ins_ok := false;
      BEGIN
        CASE c.tbl
          WHEN 'contacts'      THEN INSERT INTO public.contacts (tenant_id,phone,name) VALUES (c.foreign_tenants[1],'5511'||floor(random()*1e9)::text,'FIX invasor');
          WHEN 'quick_replies' THEN INSERT INTO public.quick_replies (tenant_id,name,content) VALUES (c.foreign_tenants[1],'FIX inv '||p_phase||' '||c.scenario,'x');
          WHEN 'lead_tracking' THEN INSERT INTO public.lead_tracking (tenant_id) VALUES (c.foreign_tenants[1]);
          WHEN 'tags'          THEN INSERT INTO public.tags (tenant_id,name) VALUES (c.foreign_tenants[1],'FIX inv '||p_phase||' '||c.scenario);
        END CASE;
        ins_ok := true;   -- entrou = vazamento de escrita
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        ins_ok := false;  -- recusado = correto
      END;
      INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
      VALUES (p_phase,c.scenario,c.tbl,'INSERT alheio recusado',0,CASE WHEN ins_ok THEN 1 ELSE 0 END,
              CASE WHEN ins_ok THEN 'FAIL' ELSE 'ok' END);
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Dimensao de cargo, na tabela `tenants`
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-00000000000a","role":"authenticated"}', true);
  SELECT count(*) INTO n_own FROM public.tenants
   WHERE id = ANY(ARRAY['11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002']::uuid[]);
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gerente','tenants','le a Conta + a Loja filha',2,n_own, CASE WHEN n_own=2 THEN 'ok' ELSE 'FAIL' END);

  SELECT count(*) INTO n_foreign FROM public.tenants
   WHERE id = ANY(ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]);
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gerente','tenants','nao le Conta/Loja de B',0,n_foreign, CASE WHEN n_foreign=0 THEN 'ok' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-00000000000b","role":"authenticated"}', true);
  SELECT count(*) INTO n_foreign FROM public.tenants WHERE id = '11111111-0000-4000-8000-000000000001';
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gestor','tenants','NAO le a Conta pai',0,n_foreign, CASE WHEN n_foreign=0 THEN 'ok' ELSE 'FAIL' END);

  SELECT count(*) INTO n_own FROM public.tenants WHERE id = '11111111-0000-4000-8000-000000000002';
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gestor','tenants','le a propria Loja',1,n_own, CASE WHEN n_own=1 THEN 'ok' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claims', '{"sub":"99999999-0000-4000-8000-000000000000","role":"authenticated"}', true);
  SELECT count(*) INTO n_own FROM public.tenants WHERE slug LIKE 'fixture-%';
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'superadmin','tenants','le todos os tenants',4,n_own, CASE WHEN n_own=4 THEN 'ok' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-00000000000b","role":"authenticated"}', true);
  SELECT count(*) INTO n_foreign FROM public.profiles
   WHERE tenant_id = ANY(ARRAY['22222222-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002']::uuid[]);
  INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
  VALUES (p_phase,'A gestor','profiles','nao le perfis de B',0,n_foreign, CASE WHEN n_foreign=0 THEN 'ok' ELSE 'FAIL' END);

  -- Trava anti-lockout: mexer em users_own_profile tranca todo mundo para fora,
  -- inclusive quem aplicou. Cada identidade TEM de continuar lendo o proprio perfil.
  FOR c IN SELECT DISTINCT scenario, jwt_sub FROM _rls_cases LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',c.jwt_sub,'role','authenticated')::text, true);
    SELECT count(*) INTO n_own FROM public.profiles WHERE user_id = c.jwt_sub;
    INSERT INTO _rls_results(phase,scenario,tbl,check_kind,expected,actual,status)
    VALUES (p_phase,c.scenario,'profiles','le o PROPRIO perfil',1,n_own, CASE WHEN n_own=1 THEN 'ok' ELSE 'FAIL' END);
  END LOOP;
END
$fn$;
GRANT EXECUTE ON FUNCTION pg_temp.chk(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Fase 1 - as policies como estao hoje
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('1-intacto');
RESET ROLE;
DELETE FROM public.contacts WHERE name = 'FIX invasor';

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suite sabe falhar)
--    Desfeita pelo ROLLBACK junto com todo o resto.
-- -----------------------------------------------------------------------------
-- ALTER POLICY "Users can access own tenant contacts" ON public.contacts USING (true);
-- SET LOCAL ROLE authenticated;
-- SELECT pg_temp.chk('2-sabotado');
-- RESET ROLE;

-- -----------------------------------------------------------------------------
-- 6. Placar
-- -----------------------------------------------------------------------------
SELECT phase,
       count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(DISTINCT tbl || ' / ' || check_kind, '; ')
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _rls_results GROUP BY phase ORDER BY phase;

ROLLBACK;
