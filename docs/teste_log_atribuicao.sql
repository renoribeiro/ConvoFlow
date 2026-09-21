-- =============================================================================
-- teste_log_atribuicao.sql — rede de segurança do log de eventos de
-- atribuição (migração 20260921000003, 2026-09-21).
--
-- O QUE PROVA
--   D1. assumir para si grava 'assume' (de NULL, para Ana, por Ana);
--   D2. transferir grava 'transfer' (de Ana, para Bruno, por Ana);
--   D3. devolver para "sem responsável" grava 'release' (de Bruno, por Bruno);
--   D4. a regra de tempo (auto_transfer_count subindo na mesma escrita, sem
--       assigned_by, sem pessoa logada) grava 'response_rule';
--   D5. o rodízio, DISPARADO PELO INSERT INBOUND real (zz_rotation_assign_on_
--       inbound → rotation_assign_conversation), grava 'rotation' — a marca de
--       transação existe e é lida;
--   D6. atribuição automática sem marca e sem contador (o nó transfer_agent
--       do chatbot: service role, assigned_by NULL) grava 'bot_node';
--   D7. SABOTAGEM: com o INSERT no log quebrado (CHECK false), a mensagem
--       inbound do cliente ENTRA e o rodízio ATRIBUI mesmo assim — o trigger
--       nunca derruba a escrita. Restaura e confere que voltou a gravar;
--   D8. leitura: gestor e gerente leem pela RPC; atendente e gente de outra
--       Conta recebem ZERO; SELECT direto na tabela como authenticated é
--       42501 (não há policy — leitura só por RPC);
--   D9. UPDATE que "muda" para o mesmo responsável não grava nada.
--
-- SEGURANÇA — BEGIN ... ROLLBACK incondicional. UUIDs com prefixo d1d1d1d1-.
--   Guarda de colisão. A sabotagem (D7) é uma CHECK na tabela do log, dentro
--   da transação, removida antes do fim — e o ROLLBACK a desfaz de qualquer
--   jeito.
--
-- COMO RODAR — papel `postgres` (SQL Editor ou o MCP de escrita).
-- =============================================================================

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'd1d1d1d1-%')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'd1d1d1d1-%')
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id::text LIKE 'd1d1d1d1-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com dado real. Nada foi feito.';
  END IF;
  IF to_regclass('public.conversation_assignment_events') IS NULL
     OR to_regprocedure('public.conversation_assignment_events_list(uuid, timestamptz, timestamptz, integer)') IS NULL
     OR to_regprocedure('public.rotation_assign_conversation(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: migrações 20260921000003 / 20260915000001 ausentes.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('d1d1d1d1-0000-4000-8000-00000000000a','authenticated','authenticated','fix-d-gerente@fixture.invalid', now(), now()),
  ('d1d1d1d1-0000-4000-8000-00000000000b','authenticated','authenticated','fix-d-gestor@fixture.invalid',  now(), now()),
  ('d1d1d1d1-0000-4000-8000-00000000000c','authenticated','authenticated','fix-d-ana@fixture.invalid',     now(), now()),
  ('d1d1d1d1-0000-4000-8000-00000000000d','authenticated','authenticated','fix-d-bruno@fixture.invalid',   now(), now()),
  ('d1d1d1d1-0000-4000-8000-00000000000e','authenticated','authenticated','fix-d-outra@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('d1d1d1d1-0000-4000-8000-000000000001','FIXTURE Conta D','fixture-conta-d','account', NULL,'active','active', '{}'),
  ('d1d1d1d1-0000-4000-8000-000000000002','FIXTURE Loja D', 'fixture-loja-d', 'store','d1d1d1d1-0000-4000-8000-000000000001','active',NULL, '{}'),
  ('d1d1d1d1-0000-4000-8000-000000000003','FIXTURE Outra D','fixture-outra-d','account', NULL,'active','active', '{}');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('d1d1d1d1-0000-4000-8000-0000000000fa','d1d1d1d1-0000-4000-8000-00000000000a','d1d1d1d1-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX','Gerente'),
  ('d1d1d1d1-0000-4000-8000-0000000000fb','d1d1d1d1-0000-4000-8000-00000000000b','d1d1d1d1-0000-4000-8000-000000000002','gestor',   'd1d1d1d1-0000-4000-8000-0000000000fa','active','FIX','Gestor'),
  ('d1d1d1d1-0000-4000-8000-0000000000fc','d1d1d1d1-0000-4000-8000-00000000000c','d1d1d1d1-0000-4000-8000-000000000002','atendente','d1d1d1d1-0000-4000-8000-0000000000fb','active','FIX','Ana'),
  ('d1d1d1d1-0000-4000-8000-0000000000fd','d1d1d1d1-0000-4000-8000-00000000000d','d1d1d1d1-0000-4000-8000-000000000002','atendente','d1d1d1d1-0000-4000-8000-0000000000fb','active','FIX','Bruno'),
  ('d1d1d1d1-0000-4000-8000-0000000000fe','d1d1d1d1-0000-4000-8000-00000000000e','d1d1d1d1-0000-4000-8000-000000000003','gestor',    NULL,'active','FIX','Outra');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('d1d1d1d1-aaaa-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000002','FIX instancia D','fix-key-d');

INSERT INTO public.contacts (id, tenant_id, phone, name) VALUES
  ('d1d1d1d1-cccc-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000002','5511970000001','FIX d1'),
  ('d1d1d1d1-cccc-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000002','5511970000002','FIX d2'),
  ('d1d1d1d1-cccc-4000-8000-000000000003','d1d1d1d1-0000-4000-8000-000000000002','5511970000003','FIX d3'),
  ('d1d1d1d1-cccc-4000-8000-000000000004','d1d1d1d1-0000-4000-8000-000000000002','5511970000004','FIX d4');

-- C1: para assumir/transferir/devolver. C2: para a regra. C3: nó do bot.
-- C4 NÃO existe ainda: nasce do INSERT inbound em D5 (o caminho real).
INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, unread_count, last_message_at) VALUES
  ('d1d1d1d1-dddd-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000002','d1d1d1d1-cccc-4000-8000-000000000001','d1d1d1d1-aaaa-4000-8000-000000000002',0,now()),
  ('d1d1d1d1-dddd-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000002','d1d1d1d1-cccc-4000-8000-000000000002','d1d1d1d1-aaaa-4000-8000-000000000002',0,now()),
  ('d1d1d1d1-dddd-4000-8000-000000000003','d1d1d1d1-0000-4000-8000-000000000002','d1d1d1d1-cccc-4000-8000-000000000003','d1d1d1d1-aaaa-4000-8000-000000000002',0,now());

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _d_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _d_results TO authenticated;
GRANT ALL ON SEQUENCE _d_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _d_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, p_actual, CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;
CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;
CREATE FUNCTION pg_temp.ninguem() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '', true);
$f$;
-- O último evento de uma conversa como "kind|from|to|by" (nomes em vez de ids).
CREATE FUNCTION pg_temp.ultimo(p_conv uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((
    SELECT e.kind || '|' || coalesce(f.last_name, '-') || '|' || coalesce(t.last_name, '-') || '|' || coalesce(b.last_name, '-')
      FROM public.conversation_assignment_events e
      LEFT JOIN public.profiles f ON f.id = e.from_profile_id
      LEFT JOIN public.profiles t ON t.id = e.to_profile_id
      LEFT JOIN public.profiles b ON b.id = e.by_profile_id
     WHERE e.conversation_id = p_conv
     ORDER BY e.id DESC LIMIT 1), '<nenhum>');
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA    constant uuid := 'd1d1d1d1-0000-4000-8000-000000000002';
  INST    constant uuid := 'd1d1d1d1-aaaa-4000-8000-000000000002';
  GER     constant uuid := 'd1d1d1d1-0000-4000-8000-00000000000a';
  GES     constant uuid := 'd1d1d1d1-0000-4000-8000-00000000000b';
  ANA     constant uuid := 'd1d1d1d1-0000-4000-8000-00000000000c';
  BRUNO   constant uuid := 'd1d1d1d1-0000-4000-8000-00000000000d';
  OUTRA   constant uuid := 'd1d1d1d1-0000-4000-8000-00000000000e';
  P_ANA   constant uuid := 'd1d1d1d1-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := 'd1d1d1d1-0000-4000-8000-0000000000fd';
  C1      constant uuid := 'd1d1d1d1-dddd-4000-8000-000000000001';
  C2      constant uuid := 'd1d1d1d1-dddd-4000-8000-000000000002';
  C3      constant uuid := 'd1d1d1d1-dddd-4000-8000-000000000003';
  CT4     constant uuid := 'd1d1d1d1-cccc-4000-8000-000000000004';
  c4 uuid; n int; n_msgs int; txt text; cargo record; erro text;
BEGIN
  -- ===== D1. Ana assume C1 (o UPDATE de buildAssignmentPatch, pela sessão dela) =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  UPDATE public.conversations SET assigned_profile_id = P_ANA, assigned_at = now(), assigned_by = P_ANA
   WHERE id = C1 AND assigned_profile_id IS NULL;
  RESET ROLE;
  PERFORM pg_temp.afirma('D1', 'assumir grava assume|-|Ana|Ana', 'assume|-|Ana|Ana', pg_temp.ultimo(C1));

  -- ===== D2. Ana transfere C1 ao Bruno =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_at = now(), assigned_by = P_ANA WHERE id = C1;
  RESET ROLE;
  PERFORM pg_temp.afirma('D2', 'transferir grava transfer|Ana|Bruno|Ana', 'transfer|Ana|Bruno|Ana', pg_temp.ultimo(C1));

  -- ===== D9. mesmo responsável de novo: nada =====
  SELECT count(*) INTO n FROM public.conversation_assignment_events WHERE conversation_id = C1;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(BRUNO);
  UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_at = now(), assigned_by = P_BRUNO WHERE id = C1;
  RESET ROLE;
  PERFORM pg_temp.afirma('D9', 'UPDATE para o mesmo responsável não grava', n::text,
                         (SELECT count(*) FROM public.conversation_assignment_events WHERE conversation_id = C1)::text);

  -- ===== D3. Bruno devolve C1 =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(BRUNO);
  UPDATE public.conversations SET assigned_profile_id = NULL, assigned_at = NULL, assigned_by = NULL WHERE id = C1;
  RESET ROLE;
  PERFORM pg_temp.afirma('D3', 'devolver grava release|Bruno|-|Bruno (ator = quem estava logado)', 'release|Bruno|-|Bruno', pg_temp.ultimo(C1));

  -- ===== D4. regra de tempo: a escrita de response_rule_transfer =====
  PERFORM pg_temp.ninguem();
  UPDATE public.conversations SET assigned_profile_id = P_ANA, assigned_at = now(), assigned_by = NULL WHERE id = C2; -- bot deu à Ana
  UPDATE public.conversations
     SET assigned_profile_id = P_BRUNO, assigned_at = now(), assigned_by = NULL,
         auto_transfer_count = auto_transfer_count + 1, auto_transfer_last_at = now()
   WHERE id = C2;
  PERFORM pg_temp.afirma('D4', 'regra de tempo grava response_rule|Ana|Bruno|-', 'response_rule|Ana|Bruno|-', pg_temp.ultimo(C2));

  -- ===== D6. nó do bot: service role, assigned_by NULL, sem marca, sem contador =====
  PERFORM pg_temp.ninguem();
  UPDATE public.conversations SET assigned_profile_id = P_ANA, assigned_at = now(), assigned_by = NULL
   WHERE id = C3 AND assigned_profile_id IS NULL;
  PERFORM pg_temp.afirma('D6', 'nó do bot grava bot_node|-|Ana|-', 'bot_node|-|Ana|-', pg_temp.ultimo(C3));

  -- ===== D5. rodízio ligado, INSERT inbound REAL (auth NULL) =====
  UPDATE public.tenants SET settings = '{"rotation_enabled": true, "rotation_timing": "immediate"}'::jsonb WHERE id = LOJA;
  PERFORM public.rotation_rebalance(LOJA);
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status)
  VALUES (LOJA, INST, CT4, 'inbound', 'text', 'FIX oi', 'received')
  RETURNING conversation_id INTO c4;
  SELECT assigned_profile_id::text INTO txt FROM public.conversations WHERE id = c4;
  PERFORM pg_temp.afirma('D5', 'o rodízio deu dono à conversa nova', 'sim', CASE WHEN txt IS NOT NULL THEN 'sim' ELSE 'não' END);
  PERFORM pg_temp.afirma('D5', 'o evento é rotation, sem "por quem"', 'rotation|-|-', split_part(pg_temp.ultimo(c4), '|', 1) || '|' || split_part(pg_temp.ultimo(c4), '|', 2) || '|' || split_part(pg_temp.ultimo(c4), '|', 4));
  PERFORM pg_temp.afirma('D5', 'a marca não vaza: current_setting vazio depois', '', coalesce(current_setting('convoflow.assignment_kind', true), ''));

  -- ===== D7. SABOTAGEM: o log recusa qualquer INSERT. A mensagem tem de entrar. =====
  UPDATE public.conversations SET assigned_profile_id = NULL, assigned_at = NULL, assigned_by = NULL WHERE id = c4; -- devolve (grava release)
  SELECT count(*) INTO n FROM public.conversation_assignment_events WHERE tenant_id = LOJA;
  ALTER TABLE public.conversation_assignment_events ADD CONSTRAINT _sabotagem_log CHECK (false) NOT VALID;
  SELECT count(*) INTO n_msgs FROM public.messages WHERE conversation_id = c4;
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status)
  VALUES (LOJA, INST, CT4, 'inbound', 'text', 'FIX oi de novo', 'received');
  PERFORM pg_temp.afirma('D7', 'com o log quebrado, a inbound ENTROU', (n_msgs + 1)::text,
                         (SELECT count(*) FROM public.messages WHERE conversation_id = c4)::text);
  SELECT assigned_profile_id::text INTO txt FROM public.conversations WHERE id = c4;
  PERFORM pg_temp.afirma('D7', 'e o rodízio atribuiu mesmo assim', 'sim', CASE WHEN txt IS NOT NULL THEN 'sim' ELSE 'não' END);
  PERFORM pg_temp.afirma('D7', 'nenhum evento novo (o INSERT falhou em silêncio, com WARNING)', n::text,
                         (SELECT count(*) FROM public.conversation_assignment_events WHERE tenant_id = LOJA)::text);
  ALTER TABLE public.conversation_assignment_events DROP CONSTRAINT _sabotagem_log;
  -- Restaurado: volta a gravar.
  UPDATE public.conversations SET assigned_profile_id = NULL, assigned_at = NULL, assigned_by = NULL WHERE id = c4;
  PERFORM pg_temp.afirma('D7', 'restaurado: voltou a gravar (release)', 'release', split_part(pg_temp.ultimo(c4), '|', 1));

  -- ===== D8. leitura =====
  SELECT count(*) INTO n FROM public.conversation_assignment_events WHERE tenant_id = LOJA;
  FOR cargo IN SELECT * FROM (VALUES ('gestor', GES, n), ('gerente', GER, n), ('atendente', ANA, 0), ('outra conta', OUTRA, 0)) AS v(nome, sub, esperado) LOOP
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.como(cargo.sub);
    PERFORM pg_temp.afirma('D8', cargo.nome || ' lê pela RPC', cargo.esperado::text,
                           (SELECT count(*) FROM public.conversation_assignment_events_list(LOJA))::text);
    BEGIN
      PERFORM count(*) FROM public.conversation_assignment_events WHERE tenant_id = LOJA;
      erro := 'leu';
    EXCEPTION WHEN insufficient_privilege THEN
      erro := '42501';
    END;
    PERFORM pg_temp.afirma('D8', cargo.nome || ' SELECT direto na tabela = 42501', '42501', erro);
    RESET ROLE;
  END LOOP;
  PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('D8', 'sem JWT, a RPC devolve nada', '0',
                         (SELECT count(*) FROM public.conversation_assignment_events_list(LOJA))::text);
END
$bateria$;

-- -----------------------------------------------------------------------------
-- 4. Placar
-- -----------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(grupo || ' / ' || check_kind
                           || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _d_results;

ROLLBACK;
