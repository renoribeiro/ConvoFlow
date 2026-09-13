-- =============================================================================
-- teste_visibilidade_conversas.sql — rede de segurança da migração
-- 20260914000001_conversation_visibility (passo 2 da atribuição).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta V + Loja V) com superadmin, gerente,
--   gestor e DOIS atendentes (Ana e Bruno), cinco conversas na Loja em cinco
--   estados — da Ana; sem responsável; do Bruno; do Bruno com a Ana já
--   participante; do Bruno passada adiante PELA Ana — e afirma, para cada
--   nível de visibilidade × cargo × estado:
--     - leitura da conversa                        (conversations / read)
--     - leitura das mensagens POR contact_id       (messages / read — o buraco
--                                                   do Chatwoot: busca global →
--                                                   id do contato → thread)
--     - escrita na conversa: marcar como lida      (conversations / write)
--     - escrita de mensagem                        (messages / write)
--   São 3 níveis × 4 cargos × 5 estados × 2 tabelas × 2 operações = 240 checks
--   de matriz, mais a narrativa das afirmações obrigatórias do passo 2.
--
--   O quinto estado ("handed_off") existe por uma regra do PostgreSQL medida em
--   2026-09-13: um UPDATE que deixaria a linha invisível para quem atualiza
--   estoura 42501. Sem o ramo `assigned_by = eu` na policy, assumir e
--   transferir sem ter respondido era impossível para o atendente restrito.
--
-- O QUE "CORRETO" SIGNIFICA (decisão de produto, 2026-09-13)
--   - Só a LEITURA é restringida, e só para atendente. Gestor, gerente e
--     superadmin veem o que sempre viram.
--   - Escrita continua por Conta. Mas há uma regra do PostgreSQL que a matriz
--     também afirma: UPDATE com WHERE numa linha que o SELECT esconde atualiza
--     ZERO linhas, sem erro. Por isso "conversations / write" espera o MESMO
--     número da leitura para o atendente — é a semântica do banco, não uma
--     policy nossa. Já INSERT em messages passa SEMPRE (os triggers de
--     escrituração são SECURITY DEFINER), e quem responde vira participante.
--   - Superadmin: 0 conversas (não tem policy em conversations, de propósito),
--     todas as mensagens (tem policy ALL em messages). Igual a antes.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional, como teste_isolamento_rls.sql. UUIDs de
--   fixture com prefixo 44444444- (não colidem com 11111111-/22222222- do
--   teste de isolamento nem com 33333333- do teste do responsável). Guarda de
--   colisão com dado real antes de semear.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita). O MCP read-only não
--   serve: não consegue SET ROLE authenticated.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM da seção 5: ele devolve a policy de SELECT de
--   `messages` ao texto de antes da migração (só por Conta). Esperado: fase 1
--   verde, fase 2 vermelha em 'messages / read' para a Ana em 'unassigned' e
--   'own'. Medido em 2026-09-13: ver o relatório do PR.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants
              WHERE id IN ('44444444-0000-4000-8000-000000000001',
                           '44444444-0000-4000-8000-000000000002')) THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '44444444-0000-4000-8000-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com usuário real do Auth. Nada foi feito.';
  END IF;
  IF to_regclass('public.conversation_participants') IS NULL
     OR to_regprocedure('public.conversation_visibility_level()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260914000001 ainda não foi aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

-- auth.users: o sino da transferência grava notifications.user_id com FK para
-- cá, e o trigger roda com as FKs LIGADAS.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('44444444-0000-4000-8000-00000000000a','authenticated','authenticated','fix-v-gerente@fixture.invalid', now(), now()),
  ('44444444-0000-4000-8000-00000000000b','authenticated','authenticated','fix-v-gestor@fixture.invalid',  now(), now()),
  ('44444444-0000-4000-8000-00000000000c','authenticated','authenticated','fix-v-ana@fixture.invalid',     now(), now()),
  ('44444444-0000-4000-8000-00000000000d','authenticated','authenticated','fix-v-bruno@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('44444444-0000-4000-8000-000000000001','FIXTURE Conta V','fixture-conta-v','account', NULL,'active','active'),
  ('44444444-0000-4000-8000-000000000002','FIXTURE Loja V', 'fixture-loja-v', 'store','44444444-0000-4000-8000-000000000001','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('44444444-0000-4000-8000-0000000000f0','44444444-0000-4000-8000-000000000000','44444444-0000-4000-8000-000000000001','superadmin', NULL,'active','FIX','Super'),
  ('44444444-0000-4000-8000-0000000000fa','44444444-0000-4000-8000-00000000000a','44444444-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX','Gerente'),
  ('44444444-0000-4000-8000-0000000000fb','44444444-0000-4000-8000-00000000000b','44444444-0000-4000-8000-000000000002','gestor',   '44444444-0000-4000-8000-0000000000fa','active','FIX','Gestor'),
  ('44444444-0000-4000-8000-0000000000fc','44444444-0000-4000-8000-00000000000c','44444444-0000-4000-8000-000000000002','atendente','44444444-0000-4000-8000-0000000000fb','active','FIX','Ana'),
  ('44444444-0000-4000-8000-0000000000fd','44444444-0000-4000-8000-00000000000d','44444444-0000-4000-8000-000000000002','atendente','44444444-0000-4000-8000-0000000000fb','active','FIX','Bruno');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('44444444-aaaa-4000-8000-000000000002','44444444-0000-4000-8000-000000000002','FIX instancia V','fix-key-v');

-- Cinco contatos = cinco estados de conversa.
INSERT INTO public.contacts (id, tenant_id, phone, name) VALUES
  ('44444444-cccc-4000-8000-000000000001','44444444-0000-4000-8000-000000000002','5511940000001','FIX owned'),
  ('44444444-cccc-4000-8000-000000000002','44444444-0000-4000-8000-000000000002','5511940000002','FIX unowned'),
  ('44444444-cccc-4000-8000-000000000003','44444444-0000-4000-8000-000000000002','5511940000003','FIX others'),
  ('44444444-cccc-4000-8000-000000000004','44444444-0000-4000-8000-000000000002','5511940000004','FIX participated'),
  ('44444444-cccc-4000-8000-000000000005','44444444-0000-4000-8000-000000000002','5511940000005','FIX handed_off');

INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, unread_count, last_message_at, assigned_profile_id, assigned_at, assigned_by) VALUES
  ('44444444-dddd-4000-8000-000000000001','44444444-0000-4000-8000-000000000002','44444444-cccc-4000-8000-000000000001','44444444-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fc','2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fc'),
  ('44444444-dddd-4000-8000-000000000002','44444444-0000-4000-8000-000000000002','44444444-cccc-4000-8000-000000000002','44444444-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00',NULL,NULL,NULL),
  ('44444444-dddd-4000-8000-000000000003','44444444-0000-4000-8000-000000000002','44444444-cccc-4000-8000-000000000003','44444444-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fd'),
  ('44444444-dddd-4000-8000-000000000004','44444444-0000-4000-8000-000000000002','44444444-cccc-4000-8000-000000000004','44444444-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fd'),
  -- 5: está com o Bruno, mas foi a ANA quem passou (assigned_by = Ana), sem ter respondido.
  ('44444444-dddd-4000-8000-000000000005','44444444-0000-4000-8000-000000000002','44444444-cccc-4000-8000-000000000005','44444444-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fd','2026-09-01 10:00+00','44444444-0000-4000-8000-0000000000fc');

-- Uma mensagem inbound por conversa (conversation_id explícito: o BEFORE INSERT
-- está desligado em replica).
INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, conversation_id, direction, message_type, content, status, created_at)
SELECT c.tenant_id, c.whatsapp_instance_id, c.contact_id, c.id, 'inbound', 'text', 'FIX seed inbound', 'received', '2026-09-01 10:00+00'
  FROM public.conversations c WHERE c.id::text LIKE '44444444-dddd-%';

-- A Ana JÁ participou da conversa 4 (que está com o Bruno). O Bruno já
-- participou da 3 (a dele) — existe para provar que a Ana não lê participação
-- alheia (N7b), não só que não há nenhuma.
INSERT INTO public.conversation_participants (conversation_id, profile_id, first_at) VALUES
  ('44444444-dddd-4000-8000-000000000004','44444444-0000-4000-8000-0000000000fc','2026-09-01 09:00+00'),
  ('44444444-dddd-4000-8000-000000000003','44444444-0000-4000-8000-0000000000fd','2026-09-01 09:00+00');

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _vis_results (
  seq serial, phase text, nivel text, cargo text, estado text, check_kind text,
  expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _vis_results TO authenticated;
GRANT ALL ON SEQUENCE _vis_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_phase text, p_nivel text, p_cargo text, p_estado text,
                               p_check text, p_expected text, p_actual text) RETURNS void
LANGUAGE sql AS $f$
  INSERT INTO _vis_results(phase, nivel, cargo, estado, check_kind, expected, actual, status)
  VALUES (p_phase, p_nivel, p_cargo, p_estado, p_check, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;

-- Volta as fixtures ao estado semeado (chamar com RESET ROLE em vigor).
CREATE FUNCTION pg_temp.reset_fixture() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  DELETE FROM public.messages WHERE content LIKE 'FIX write%' OR content LIKE 'FIX narr%';
  DELETE FROM public.conversation_participants
   WHERE conversation_id::text LIKE '44444444-dddd-%'
     AND NOT (conversation_id = '44444444-dddd-4000-8000-000000000004'
              AND profile_id = '44444444-0000-4000-8000-0000000000fc')
     AND NOT (conversation_id = '44444444-dddd-4000-8000-000000000003'
              AND profile_id = '44444444-0000-4000-8000-0000000000fd');
  UPDATE public.conversations SET
    unread_count = 1, is_archived = false, sla_muted_at = NULL, sla_muted_by = NULL,
    last_message_content = NULL, last_message_direction = NULL, last_message_status = NULL,
    last_message_type = NULL, last_message_at = '2026-09-01 10:00+00',
    assigned_profile_id = CASE id
      WHEN '44444444-dddd-4000-8000-000000000001' THEN '44444444-0000-4000-8000-0000000000fc'::uuid
      WHEN '44444444-dddd-4000-8000-000000000002' THEN NULL
      ELSE '44444444-0000-4000-8000-0000000000fd'::uuid END,
    assigned_by = CASE id
      WHEN '44444444-dddd-4000-8000-000000000001' THEN '44444444-0000-4000-8000-0000000000fc'::uuid
      WHEN '44444444-dddd-4000-8000-000000000002' THEN NULL
      WHEN '44444444-dddd-4000-8000-000000000005' THEN '44444444-0000-4000-8000-0000000000fc'::uuid
      ELSE '44444444-0000-4000-8000-0000000000fd'::uuid END,
    assigned_at = CASE id WHEN '44444444-dddd-4000-8000-000000000002' THEN NULL ELSE '2026-09-01 10:00+00'::timestamptz END
   WHERE id::text LIKE '44444444-dddd-%';
  -- Depois do UPDATE: o trigger do sino pode ter gravado aviso ao reatribuir.
  DELETE FROM public.notifications WHERE user_id::text LIKE '44444444-0000-4000-8000-%';
END;
$f$;

-- Grava as duas preferências na Loja V (chamar com RESET ROLE em vigor).
CREATE FUNCTION pg_temp.set_prefs(p_nivel text, p_transfer boolean) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.tenants
     SET settings = CASE WHEN p_nivel IS NULL AND p_transfer IS NULL THEN '{}'::jsonb
                         ELSE jsonb_strip_nulls(jsonb_build_object('atendente_visibility', p_nivel, 'atendente_can_transfer', p_transfer)) END
   WHERE id = '44444444-0000-4000-8000-000000000002';
END;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria (como função, para rodar a fase intacta e a sabotada)
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.bateria(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  LOJA  constant uuid := '44444444-0000-4000-8000-000000000002';
  INST  constant uuid := '44444444-aaaa-4000-8000-000000000002';
  SUPER constant uuid := '44444444-0000-4000-8000-000000000000';
  GER   constant uuid := '44444444-0000-4000-8000-00000000000a';
  GES   constant uuid := '44444444-0000-4000-8000-00000000000b';
  ANA   constant uuid := '44444444-0000-4000-8000-00000000000c';
  BRUNO constant uuid := '44444444-0000-4000-8000-00000000000d';
  P_ANA   constant uuid := '44444444-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := '44444444-0000-4000-8000-0000000000fd';
  C1 constant uuid := '44444444-dddd-4000-8000-000000000001'; -- owned (Ana)
  C2 constant uuid := '44444444-dddd-4000-8000-000000000002'; -- unowned
  C3 constant uuid := '44444444-dddd-4000-8000-000000000003'; -- other's (Bruno)
  C4 constant uuid := '44444444-dddd-4000-8000-000000000004'; -- participated (Bruno + Ana participante)
  C5 constant uuid := '44444444-dddd-4000-8000-000000000005'; -- handed_off (Bruno, passada pela Ana)
  K1 constant uuid := '44444444-cccc-4000-8000-000000000001';
  K2 constant uuid := '44444444-cccc-4000-8000-000000000002';
  K3 constant uuid := '44444444-cccc-4000-8000-000000000003';
  K4 constant uuid := '44444444-cccc-4000-8000-000000000004';
  K5 constant uuid := '44444444-cccc-4000-8000-000000000005';
  nivel text; cargo record; estado record;
  n int; v_txt text; exp int; v_holder uuid;
BEGIN
  -- =========================== MATRIZ ===========================
  FOREACH nivel IN ARRAY ARRAY['all','unassigned','own'] LOOP
    FOR cargo IN SELECT * FROM (VALUES ('superadmin', SUPER), ('gerente', GER), ('gestor', GES), ('atendente', ANA)) AS v(nome, sub) LOOP
      RESET ROLE;
      PERFORM pg_temp.reset_fixture();
      PERFORM pg_temp.set_prefs(nivel, true);
      SET LOCAL ROLE authenticated;
      PERFORM pg_temp.como(cargo.sub);

      FOR estado IN SELECT * FROM (VALUES ('owned', C1, K1), ('unowned', C2, K2), ('others', C3, K3), ('participated', C4, K4), ('handed_off', C5, K5)) AS v(nome, conv, contato) LOOP
        -- Gabarito de leitura
        exp := CASE
          WHEN cargo.nome = 'superadmin' THEN 0
          WHEN cargo.nome IN ('gerente','gestor') THEN 1
          WHEN nivel = 'all' THEN 1
          WHEN nivel = 'unassigned' THEN CASE estado.nome WHEN 'others' THEN 0 ELSE 1 END
          ELSE CASE estado.nome WHEN 'owned' THEN 1 WHEN 'participated' THEN 1 WHEN 'handed_off' THEN 1 ELSE 0 END
        END;

        SELECT count(*) INTO n FROM public.conversations WHERE id = estado.conv;
        PERFORM pg_temp.afirma(p_phase, nivel, cargo.nome, estado.nome, 'conversations / read', exp::text, n::text);

        -- messages POR contact_id (o caminho A5 do inbox e o buraco do Chatwoot).
        -- Superadmin lê todas (policy ALL própria).
        SELECT count(*) INTO n FROM public.messages WHERE contact_id = estado.contato;
        PERFORM pg_temp.afirma(p_phase, nivel, cargo.nome, estado.nome, 'messages / read (by contact_id)',
                               CASE WHEN cargo.nome = 'superadmin' THEN '1' ELSE exp::text END, n::text);

        -- conversations / write: marcar como lida. UPDATE com WHERE segue o
        -- SELECT (regra do PostgreSQL): linha escondida = 0 linhas, sem erro.
        BEGIN
          UPDATE public.conversations SET unread_count = 0 WHERE id = estado.conv AND tenant_id = LOJA;
          GET DIAGNOSTICS n = ROW_COUNT;
          v_txt := n::text;
        EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
        END;
        PERFORM pg_temp.afirma(p_phase, nivel, cargo.nome, estado.nome, 'conversations / write (mark read)', exp::text, v_txt);

        -- messages / write: enviar. Passa para TODO cargo em TODO estado — os
        -- triggers de escrituração são SECURITY DEFINER e a escrita é por Conta.
        BEGIN
          INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot)
          VALUES (LOJA, INST, estado.contato, 'outbound', 'text', 'FIX write ' || nivel || ' ' || cargo.nome || ' ' || estado.nome, 'sent', false);
          GET DIAGNOSTICS n = ROW_COUNT;
          v_txt := n::text;
        EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
        END;
        PERFORM pg_temp.afirma(p_phase, nivel, cargo.nome, estado.nome, 'messages / write (send)', '1', v_txt);
      END LOOP;
    END LOOP;
  END LOOP;

  -- ========================= NARRATIVA =========================
  -- N0. Padrão: sem NADA gravado ({}), e com settings NULL, a Ana vê tudo.
  RESET ROLE; PERFORM pg_temp.reset_fixture(); PERFORM pg_temp.set_prefs(NULL, NULL);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(ANA);
  SELECT count(*) INTO n FROM public.conversations WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'default {}', 'atendente', '-', 'N0a. sem preferência gravada, atendente lê TODAS as conversas (= antes da migração)', '5', n::text);
  SELECT count(*) INTO n FROM public.messages WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'default {}', 'atendente', '-', 'N0b. sem preferência gravada, atendente lê TODAS as mensagens (= antes da migração)', '5', n::text);
  SELECT public.conversation_visibility_level() INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'default {}', 'atendente', '-', 'N0c. helper devolve all', 'all', v_txt);
  RESET ROLE;
  UPDATE public.tenants SET settings = NULL WHERE id = LOJA;
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(ANA);
  SELECT count(*) INTO n FROM public.conversations WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'default NULL', 'atendente', '-', 'N0d. settings NULL, atendente lê TODAS as conversas', '5', n::text);
  PERFORM pg_temp.como(GES);
  SELECT public.conversation_visibility_level() INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'default NULL', 'gestor', '-', 'N0e. helper devolve all para gestor', 'all', v_txt);
  RESET ROLE;
  SELECT public.conversation_visibility_level() INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, '-', 'postgres/sem JWT', '-', 'N0f. sem JWT (service role) o helper devolve all', 'all', v_txt);

  -- N1..N5 em cada nível restrito
  FOREACH nivel IN ARRAY ARRAY['unassigned','own'] LOOP
    RESET ROLE; PERFORM pg_temp.reset_fixture(); PERFORM pg_temp.set_prefs(nivel, true);
    SET LOCAL ROLE authenticated; PERFORM pg_temp.como(ANA);

    -- N1. envia na conversa que é dela
    INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot)
    VALUES (LOJA, INST, K1, 'outbound', 'text', 'FIX narr N1 ' || nivel, 'sent', false);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'owned', 'N1. restrito envia mensagem na conversa que é dele: sucesso', '1', n::text);

    -- N2. envia na SEM responsável (em own ela está escondida — e mesmo assim passa)
    INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot)
    VALUES (LOJA, INST, K2, 'outbound', 'text', 'FIX narr N2 ' || nivel, 'sent', false);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'unowned', 'N2a. restrito envia mensagem em conversa SEM responsável: sucesso', '1', n::text);
    SELECT count(*) INTO n FROM public.conversations WHERE id = C2;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'unowned', 'N2b. ...e depois de responder ele a lê (virou participante)', '1', n::text);
    SELECT last_message_content INTO v_txt FROM public.conversations WHERE id = C2;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'unowned', 'N2c. ...e a prévia foi atualizada pelo trigger', 'FIX narr N2 ' || nivel, coalesce(v_txt, '<null>'));

    -- N3. não lê a do Bruno, nem as mensagens dela por contact_id
    SELECT count(*) INTO n FROM public.conversations WHERE id = C3;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'others', 'N3a. restrito NÃO lê a conversa de outra pessoa', '0', n::text);
    SELECT count(*) INTO n FROM public.messages WHERE contact_id = K3;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'others', 'N3b. restrito NÃO lê as mensagens dela direto por contact_id', '0', n::text);
    SELECT count(*) INTO n FROM public.messages WHERE conversation_id = C3;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'others', 'N3c. ...nem por conversation_id', '0', n::text);
    SELECT count(*) INTO n FROM public.messages WHERE tenant_id = LOJA AND content ILIKE '%seed%';
    -- (em unassigned: owned+unowned+participated+handed_off = 4; em own: owned+participated+handed_off+unowned-que-virou-participada = 4)
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', '-', 'N3d. busca por conteúdo na Loja só devolve o que ele pode ver', '4', n::text);

    -- N4. participante continua lendo (e escrevendo) depois da transferência
    --     Ana respondeu em C1 (N1) e é dona. Gestor transfere C1 para o Bruno.
    PERFORM pg_temp.como(GES);
    UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_by = '44444444-0000-4000-8000-0000000000fb', assigned_at = now()
     WHERE id = C1 AND tenant_id = LOJA;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'gestor', 'owned', 'N4a. gestor transfere a conversa da Ana para o Bruno', '1', n::text);
    PERFORM pg_temp.como(ANA);
    SELECT count(*) INTO n FROM public.conversations WHERE id = C1;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'owned→others', 'N4b. participante continua LENDO a conversa depois de transferida', '1', n::text);
    SELECT count(*) INTO n FROM public.messages WHERE contact_id = K1;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'owned→others', 'N4c. ...e as mensagens dela', '2', n::text);
    INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot)
    VALUES (LOJA, INST, K1, 'outbound', 'text', 'FIX narr N4 ' || nivel, 'sent', false);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'owned→others', 'N4d. ...e ainda ESCREVE nela', '1', n::text);
    SELECT assigned_profile_id INTO v_holder FROM public.conversations WHERE id = C1;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'owned→others', 'N4e. responder não muda o responsável (continua Bruno)', P_BRUNO::text, coalesce(v_holder::text, '<null>'));
    -- Bruno (dono) lê a conversa e a mensagem que a Ana acabou de mandar
    PERFORM pg_temp.como(BRUNO);
    SELECT count(*) INTO n FROM public.messages WHERE contact_id = K1 AND content = 'FIX narr N4 ' || nivel;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente(Bruno)', 'owned', 'N4f. o novo dono lê a mensagem que a participante mandou', '1', n::text);

    -- N5. marcar como lida, arquivar e silenciar SLA funcionam na conversa dele
    PERFORM pg_temp.como(ANA);
    -- (C4: Ana participante; C1 foi transferida. Usa a C2, que ela acabou de assumir por participação? Não: usa C4 e assume a C2.)
    UPDATE public.conversations SET unread_count = 0 WHERE id = C4 AND tenant_id = LOJA;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'participated', 'N5a. marcar como lida funciona para o restrito', '1', n::text);
    UPDATE public.conversations SET is_archived = true WHERE id = C4 AND tenant_id = LOJA;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'participated', 'N5b. arquivar funciona para o restrito', '1', n::text);
    UPDATE public.conversations SET sla_muted_at = now(), sla_muted_by = ANA WHERE id = C4 AND tenant_id = LOJA;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'participated', 'N5c. silenciar SLA funciona para o restrito', '1', n::text);
    -- ...e NÃO funcionam (0 linhas, sem erro) na conversa que ele não vê
    UPDATE public.conversations SET unread_count = 0 WHERE id = C3 AND tenant_id = LOJA;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'others', 'N5d. marcar como lida em conversa escondida: 0 linhas, sem erro', '0', n::text);

    -- N6. gestor e gerente: tudo, sempre (a matriz já cobre; aqui é o total)
    PERFORM pg_temp.como(GES);
    SELECT count(*) INTO n FROM public.conversations WHERE tenant_id = LOJA;
    PERFORM pg_temp.afirma(p_phase, nivel, 'gestor', '-', 'N6a. gestor lê as 5 conversas', '5', n::text);
    SELECT count(*) INTO n FROM public.messages WHERE tenant_id = LOJA;
    PERFORM pg_temp.afirma(p_phase, nivel, 'gestor', '-', 'N6b. gestor lê todas as mensagens', '8', n::text);
    PERFORM pg_temp.como(GER);
    SELECT count(*) INTO n FROM public.conversations WHERE tenant_id = LOJA;
    PERFORM pg_temp.afirma(p_phase, nivel, 'gerente', '-', 'N6c. gerente lê as 5 conversas da Loja filha', '5', n::text);
    SELECT count(*) INTO n FROM public.messages WHERE tenant_id = LOJA;
    PERFORM pg_temp.afirma(p_phase, nivel, 'gerente', '-', 'N6d. gerente lê todas as mensagens da Loja filha', '8', n::text);
    PERFORM pg_temp.como(SUPER);
    SELECT count(*) INTO n FROM public.messages WHERE tenant_id = LOJA;
    PERFORM pg_temp.afirma(p_phase, nivel, 'superadmin', '-', 'N6e. superadmin lê todas as mensagens (policy ALL própria, como antes)', '8', n::text);
    SELECT count(*) INTO n FROM public.conversations WHERE tenant_id = LOJA;
    PERFORM pg_temp.afirma(p_phase, nivel, 'superadmin', '-', 'N6f. superadmin lê 0 conversas (sem policy, como antes)', '0', n::text);

    -- N7. participação não pode ser forjada nem lida de outros
    PERFORM pg_temp.como(ANA);
    BEGIN
      INSERT INTO public.conversation_participants (conversation_id, profile_id) VALUES (C3, P_ANA);
      v_txt := 'inseriu';
    EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
    END;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', 'others', 'N7a. atendente NÃO consegue forjar participação (42501)', '42501', v_txt);
    SELECT count(*) INTO n FROM public.conversation_participants WHERE profile_id <> P_ANA;
    PERFORM pg_temp.afirma(p_phase, nivel, 'atendente', '-', 'N7b. atendente não lê participação de outras pessoas', '0', n::text);
  END LOOP;

  -- N8. Transferência desativada para atendentes (em 'unassigned', onde a Ana vê a sem-dono)
  RESET ROLE; PERFORM pg_temp.reset_fixture(); PERFORM pg_temp.set_prefs('unassigned', false);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(ANA);
  SELECT public.conversation_transfer_allowed() INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente', '-', 'N8a. helper diz que atendente não pode transferir', 'false', v_txt);
  UPDATE public.conversations SET assigned_profile_id = P_ANA, assigned_by = P_ANA, assigned_at = now()
   WHERE id = C2 AND tenant_id = LOJA AND assigned_profile_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente', 'unowned', 'N8b. com transferência desativada, "Assumir" continua funcionando', '1', n::text);
  BEGIN
    UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_by = P_ANA, assigned_at = now() WHERE id = C1 AND tenant_id = LOJA;
    v_txt := 'passou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE || ' ' || SQLERRM;
  END;
  -- A mensagem vai junto: prova que foi o TRIGGER de transferência que recusou, não o RLS.
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente', 'owned', 'N8c. ...mas transferir a própria conversa para o Bruno é RECUSADO no servidor (42501, pelo trigger)',
                         '42501 Transferência de conversas está desativada para atendentes nesta Loja.', v_txt);
  BEGIN
    UPDATE public.conversations SET assigned_profile_id = NULL, assigned_by = NULL, assigned_at = NULL WHERE id = C1 AND tenant_id = LOJA;
    v_txt := 'passou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente', 'owned', 'N8d. ...e devolver para a fila também é recusado (42501, pelo trigger)',
                         '42501 Transferência de conversas está desativada para atendentes nesta Loja.', v_txt);
  SELECT assigned_profile_id INTO v_holder FROM public.conversations WHERE id = C1;
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente', 'owned', 'N8e. a conversa continua com a Ana', P_ANA::text, coalesce(v_holder::text, '<null>'));
  PERFORM pg_temp.como(GES);
  UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_by = '44444444-0000-4000-8000-0000000000fb', assigned_at = now() WHERE id = C1 AND tenant_id = LOJA;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'gestor', 'owned', 'N8f. gestor transfere mesmo com a chave desligada (a chave é só para atendente)', '1', n::text);
  PERFORM pg_temp.como(BRUNO);
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = BRUNO AND title = 'Conversa transferida';
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente(Bruno)', 'owned', 'N8g. o sino do Bruno recebeu o aviso (trigger do passo 1 intacto)', '1', n::text);
  RESET ROLE; PERFORM pg_temp.set_prefs('unassigned', true);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(ANA);
  UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_by = P_ANA, assigned_at = now() WHERE id = C2 AND tenant_id = LOJA;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente', 'unowned', 'N8h. com a chave ligada de novo, a Ana transfere (sem ter respondido)', '1', n::text);
  SELECT count(*) INTO n FROM public.conversations WHERE id = C2;
  PERFORM pg_temp.afirma(p_phase, 'unassigned', 'atendente', 'unowned→handed_off', 'N8i. ...e continua vendo a conversa que ela mesma passou adiante', '1', n::text);
  -- ...em 'own' também: assumir sem responder e passar adiante tem de funcionar.
  RESET ROLE; PERFORM pg_temp.reset_fixture(); PERFORM pg_temp.set_prefs('own', true);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(ANA);
  BEGIN
    UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_by = P_ANA, assigned_at = now() WHERE id = C1 AND tenant_id = LOJA;
    GET DIAGNOSTICS n = ROW_COUNT;
    v_txt := n::text;
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM pg_temp.afirma(p_phase, 'own', 'atendente', 'owned', 'N8j. em own, transferir a própria conversa sem ter respondido funciona', '1', v_txt);
  SELECT count(*) INTO n FROM public.conversations WHERE id = C1;
  PERFORM pg_temp.afirma(p_phase, 'own', 'atendente', 'owned→handed_off', 'N8k. ...e ela continua vendo a conversa que passou adiante', '1', n::text);
  -- quando OUTRA pessoa reatribui, a Ana perde de vista (como a especificação pede)
  PERFORM pg_temp.como(GES);
  UPDATE public.conversations SET assigned_profile_id = P_BRUNO, assigned_by = '44444444-0000-4000-8000-0000000000fb', assigned_at = now() WHERE id = C1 AND tenant_id = LOJA;
  PERFORM pg_temp.como(ANA);
  SELECT count(*) INTO n FROM public.conversations WHERE id = C1;
  PERFORM pg_temp.afirma(p_phase, 'own', 'atendente', 'handed_off→others', 'N8l. ...até o gestor reatribuir: aí ela perde de vista', '0', n::text);

  -- N9. A CHECK de tenants recusa valor inválido (o RPC set_tenant_settings não valida)
  RESET ROLE;
  BEGIN
    UPDATE public.tenants SET settings = '{"atendente_visibility":"bogus"}'::jsonb WHERE id = LOJA;
    v_txt := 'aceitou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
  END;
  PERFORM pg_temp.afirma(p_phase, '-', 'postgres', '-', 'N9a. atendente_visibility inválido é recusado pela CHECK (23514)', '23514', v_txt);
  BEGIN
    UPDATE public.tenants SET settings = '{"atendente_can_transfer":"sim"}'::jsonb WHERE id = LOJA;
    v_txt := 'aceitou';
  EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
  END;
  PERFORM pg_temp.afirma(p_phase, '-', 'postgres', '-', 'N9b. atendente_can_transfer não-booleano é recusado pela CHECK (23514)', '23514', v_txt);

  RESET ROLE;
  PERFORM pg_temp.reset_fixture();
  PERFORM pg_temp.set_prefs(NULL, NULL);
END
$fn$;

-- -----------------------------------------------------------------------------
-- 4. Fase 1 — as policies como estão hoje
-- -----------------------------------------------------------------------------
SELECT pg_temp.bateria('1-intacto');

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suíte sabe falhar)
--    Devolve a policy de SELECT de messages ao texto de ANTES da migração (só
--    por Conta). Esperado: 'messages / read (by contact_id)' vermelho para a
--    Ana em others@unassigned, unowned@own e others@own, e N3b/N3d.
--    (Medido em 2026-09-13: ver o placar da fase 2 no relatório do PR.)
--    Desfeito pelo ROLLBACK junto com todo o resto.
-- -----------------------------------------------------------------------------
-- ALTER POLICY "Users can view own tenant messages" ON public.messages
--   USING (tenant_id = (SELECT public.get_current_user_tenant_id()));
-- SELECT pg_temp.bateria('2-sabotado');

-- -----------------------------------------------------------------------------
-- 6. Placar
-- -----------------------------------------------------------------------------
SELECT phase,
       count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(DISTINCT nivel || ' / ' || cargo || ' / ' || estado || ' / ' || check_kind
                           || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ')
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _vis_results GROUP BY phase ORDER BY phase;

ROLLBACK;
