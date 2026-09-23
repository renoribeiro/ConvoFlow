-- =============================================================================
-- teste_metricas_atendimento.sql — rede de segurança das métricas de
-- atendimento (2026-09-21): loja_conversation_metrics (Loja inteira) e
-- loja_attendant_metrics (por pessoa, só gestor/gerente).
--
-- O QUE PROVA
--   A. loja_conversation_metrics (migração 20260921000001)
--     A1. os números batem com uma geometria conhecida de 5 conversas:
--         bot e pessoa são medidos SEPARADOS e em MEDIANA; campanha (source
--         não nulo) não é resposta humana; arquivada não "espera";
--     A2. a janela é por conversa CRIADA; os "agora" ignoram a janela;
--     A3. alcance: gerente da Conta pai, gestor e atendente da Loja recebem
--         a linha; superadmin recebe NADA (conversations não tem policy de
--         superadmin); service_role recebe (é o relatório por e-mail);
--         sem JWT nenhum, nada; gente de outra Conta, nada.
--   C. loja_attendant_metrics (migração 20260921000002)
--     C1. uma linha por pessoa com posse + a linha "sem responsável"
--         (profile_id NULL) com o que ninguém pegou;
--     C2. como cada conversa chegou (assumiu / recebeu de colega / automático)
--         e quem espera resposta / não teve resposta humana, por dono;
--     C3. quem saiu do time continua listado com o motivo (suspended);
--         o gerente da Conta pai aparece marcado como da Conta;
--     C4. transferências da regra de tempo sofridas/recebidas, lidas de
--         notifications (metadata.reason = 'response_rule');
--     C5. GATE: atendente recebe ZERO linhas; superadmin, gestor e gerente
--         recebem; gente de outra Conta, nada.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo a1a1a1a1-
--   (os outros testes usam 11111111- a 99999999-). Guarda de colisão antes de
--   semear. Semeadura com triggers e FKs suspensos (replica).
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita). O MCP read-only não
--   serve: não consegue SET ROLE authenticated.
-- =============================================================================

BEGIN;

-- Fatia 1 do Instagram (20260922000002): contacts.external_id virou NOT NULL e
-- quem preenche é a trigger trg_contacts_set_external_id. Sob
-- session_replication_role = replica ela NÃO dispara, e a semeadura morria com
-- 23502. ENABLE ALWAYS liga SÓ essa trigger, SÓ dentro desta transação (o
-- ROLLBACK desfaz) — a semeadura passa a obedecer a mesma regra da produção.
ALTER TABLE public.contacts ENABLE ALWAYS TRIGGER trg_contacts_set_external_id;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'a1a1a1a1-%')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'a1a1a1a1-%')
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id::text LIKE 'a1a1a1a1-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com dado real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.loja_conversation_metrics(uuid, timestamptz, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: migração 20260921000001 ausente.';
  END IF;
  IF to_regprocedure('public.loja_attendant_metrics(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: migração 20260921000002 ausente.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000000','authenticated','authenticated','fix-m-super@fixture.invalid',   now(), now()),
  ('a1a1a1a1-0000-4000-8000-00000000000a','authenticated','authenticated','fix-m-gerente@fixture.invalid', now(), now()),
  ('a1a1a1a1-0000-4000-8000-00000000000b','authenticated','authenticated','fix-m-gestor@fixture.invalid',  now(), now()),
  ('a1a1a1a1-0000-4000-8000-00000000000c','authenticated','authenticated','fix-m-ana@fixture.invalid',     now(), now()),
  ('a1a1a1a1-0000-4000-8000-00000000000d','authenticated','authenticated','fix-m-bruno@fixture.invalid',   now(), now()),
  ('a1a1a1a1-0000-4000-8000-00000000000e','authenticated','authenticated','fix-m-outra@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001','FIXTURE Conta M','fixture-conta-m','account', NULL,'active','active'),
  ('a1a1a1a1-0000-4000-8000-000000000002','FIXTURE Loja M', 'fixture-loja-m', 'store','a1a1a1a1-0000-4000-8000-000000000001','active',NULL),
  ('a1a1a1a1-0000-4000-8000-000000000003','FIXTURE Outra M','fixture-outra-m','account', NULL,'active','active');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('a1a1a1a1-0000-4000-8000-0000000000f0','a1a1a1a1-0000-4000-8000-000000000000','a1a1a1a1-0000-4000-8000-000000000001','superadmin', NULL,'active','FIX','Super'),
  ('a1a1a1a1-0000-4000-8000-0000000000fa','a1a1a1a1-0000-4000-8000-00000000000a','a1a1a1a1-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX','Gerente'),
  ('a1a1a1a1-0000-4000-8000-0000000000fb','a1a1a1a1-0000-4000-8000-00000000000b','a1a1a1a1-0000-4000-8000-000000000002','gestor',   'a1a1a1a1-0000-4000-8000-0000000000fa','active','FIX','Gestor'),
  ('a1a1a1a1-0000-4000-8000-0000000000fc','a1a1a1a1-0000-4000-8000-00000000000c','a1a1a1a1-0000-4000-8000-000000000002','atendente','a1a1a1a1-0000-4000-8000-0000000000fb','active','FIX','Ana'),
  ('a1a1a1a1-0000-4000-8000-0000000000fd','a1a1a1a1-0000-4000-8000-00000000000d','a1a1a1a1-0000-4000-8000-000000000002','atendente','a1a1a1a1-0000-4000-8000-0000000000fb','active','FIX','Bruno'),
  ('a1a1a1a1-0000-4000-8000-0000000000fe','a1a1a1a1-0000-4000-8000-00000000000e','a1a1a1a1-0000-4000-8000-000000000003','gestor',    NULL,'active','FIX','Outra');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('a1a1a1a1-aaaa-4000-8000-000000000002','a1a1a1a1-0000-4000-8000-000000000002','FIX instancia M','fix-key-m');

INSERT INTO public.contacts (id, tenant_id, phone, name) VALUES
  ('a1a1a1a1-cccc-4000-8000-000000000001','a1a1a1a1-0000-4000-8000-000000000002','5511980000001','FIX c1'),
  ('a1a1a1a1-cccc-4000-8000-000000000002','a1a1a1a1-0000-4000-8000-000000000002','5511980000002','FIX c2'),
  ('a1a1a1a1-cccc-4000-8000-000000000003','a1a1a1a1-0000-4000-8000-000000000002','5511980000003','FIX c3'),
  ('a1a1a1a1-cccc-4000-8000-000000000004','a1a1a1a1-0000-4000-8000-000000000002','5511980000004','FIX c4'),
  ('a1a1a1a1-cccc-4000-8000-000000000005','a1a1a1a1-0000-4000-8000-000000000002','5511980000005','FIX c5'),
  ('a1a1a1a1-cccc-4000-8000-000000000006','a1a1a1a1-0000-4000-8000-000000000002','5511980000006','FIX c6');

-- Geometria (todas as horas em UTC, dia 2026-09-01 salvo indicação):
--   C1 Ana (assumiu):   in 10:00 · bot 10:00:05 · pessoa 11:00       → 1ª pessoa 60 min, 1ª bot 5 s; não espera
--   C2 sem dono:        in 10:00 · bot 10:00:10                       → sem pessoa; espera; bot tocou
--   C3 Bruno (recebeu de Ana): in 10:00 · pessoa 10:30 · in 12:00    → 1ª pessoa 30 min; espera (cliente falou depois)
--   C4 sem dono:        in 10:00 · campanha 10:01 (source='campaign') → campanha NÃO é pessoa; sem pessoa; espera
--   C5 Bruno (automático), ARQUIVADA: in 10:00                        → sem pessoa; arquivada não espera
--   C6 Gerente (assumiu), criada 2026-09-02: in 10:00 · pessoa 10:10 → 1ª pessoa 10 min (só entra na janela do dia 2)
INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, unread_count, created_at, last_message_at, is_archived, assigned_profile_id, assigned_at, assigned_by) VALUES
  ('a1a1a1a1-dddd-4000-8000-000000000001','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000001','a1a1a1a1-aaaa-4000-8000-000000000002',0,'2026-09-01 10:00+00','2026-09-01 11:00+00',false,'a1a1a1a1-0000-4000-8000-0000000000fc','2026-09-01 10:30+00','a1a1a1a1-0000-4000-8000-0000000000fc'),
  ('a1a1a1a1-dddd-4000-8000-000000000002','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000002','a1a1a1a1-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','2026-09-01 10:00:10+00',false,NULL,NULL,NULL),
  ('a1a1a1a1-dddd-4000-8000-000000000003','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000003','a1a1a1a1-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','2026-09-01 12:00+00',false,'a1a1a1a1-0000-4000-8000-0000000000fd','2026-09-01 10:20+00','a1a1a1a1-0000-4000-8000-0000000000fc'),
  ('a1a1a1a1-dddd-4000-8000-000000000004','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000004','a1a1a1a1-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','2026-09-01 10:01+00',false,NULL,NULL,NULL),
  ('a1a1a1a1-dddd-4000-8000-000000000005','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000005','a1a1a1a1-aaaa-4000-8000-000000000002',1,'2026-09-01 10:00+00','2026-09-01 10:00+00',true,'a1a1a1a1-0000-4000-8000-0000000000fd','2026-09-01 10:05+00',NULL),
  ('a1a1a1a1-dddd-4000-8000-000000000006','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000006','a1a1a1a1-aaaa-4000-8000-000000000002',0,'2026-09-02 10:00+00','2026-09-02 10:10+00',false,'a1a1a1a1-0000-4000-8000-0000000000fa','2026-09-02 10:05+00','a1a1a1a1-0000-4000-8000-0000000000fa');

INSERT INTO public.messages (id, tenant_id, contact_id, conversation_id, whatsapp_instance_id, direction, message_type, content, status, is_from_bot, source, created_at) VALUES
  -- C1
  ('a1a1a1a1-eeee-4000-8000-000000000011','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000001','a1a1a1a1-dddd-4000-8000-000000000001','a1a1a1a1-aaaa-4000-8000-000000000002','inbound', 'text','oi','received',false,NULL,'2026-09-01 10:00:00+00'),
  ('a1a1a1a1-eeee-4000-8000-000000000012','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000001','a1a1a1a1-dddd-4000-8000-000000000001','a1a1a1a1-aaaa-4000-8000-000000000002','outbound','text','bot','sent',true,'chatbot','2026-09-01 10:00:05+00'),
  ('a1a1a1a1-eeee-4000-8000-000000000013','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000001','a1a1a1a1-dddd-4000-8000-000000000001','a1a1a1a1-aaaa-4000-8000-000000000002','outbound','text','pessoa','sent',false,NULL,'2026-09-01 11:00:00+00'),
  -- C2
  ('a1a1a1a1-eeee-4000-8000-000000000021','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000002','a1a1a1a1-dddd-4000-8000-000000000002','a1a1a1a1-aaaa-4000-8000-000000000002','inbound', 'text','oi','received',false,NULL,'2026-09-01 10:00:00+00'),
  ('a1a1a1a1-eeee-4000-8000-000000000022','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000002','a1a1a1a1-dddd-4000-8000-000000000002','a1a1a1a1-aaaa-4000-8000-000000000002','outbound','text','bot','sent',true,'chatbot','2026-09-01 10:00:10+00'),
  -- C3
  ('a1a1a1a1-eeee-4000-8000-000000000031','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000003','a1a1a1a1-dddd-4000-8000-000000000003','a1a1a1a1-aaaa-4000-8000-000000000002','inbound', 'text','oi','received',false,NULL,'2026-09-01 10:00:00+00'),
  ('a1a1a1a1-eeee-4000-8000-000000000032','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000003','a1a1a1a1-dddd-4000-8000-000000000003','a1a1a1a1-aaaa-4000-8000-000000000002','outbound','text','pessoa','sent',false,NULL,'2026-09-01 10:30:00+00'),
  ('a1a1a1a1-eeee-4000-8000-000000000033','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000003','a1a1a1a1-dddd-4000-8000-000000000003','a1a1a1a1-aaaa-4000-8000-000000000002','inbound', 'text','e ai?','received',false,NULL,'2026-09-01 12:00:00+00'),
  -- C4
  ('a1a1a1a1-eeee-4000-8000-000000000041','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000004','a1a1a1a1-dddd-4000-8000-000000000004','a1a1a1a1-aaaa-4000-8000-000000000002','inbound', 'text','oi','received',false,NULL,'2026-09-01 10:00:00+00'),
  ('a1a1a1a1-eeee-4000-8000-000000000042','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000004','a1a1a1a1-dddd-4000-8000-000000000004','a1a1a1a1-aaaa-4000-8000-000000000002','outbound','text','campanha','sent',false,'campaign','2026-09-01 10:01:00+00'),
  -- C5
  ('a1a1a1a1-eeee-4000-8000-000000000051','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000005','a1a1a1a1-dddd-4000-8000-000000000005','a1a1a1a1-aaaa-4000-8000-000000000002','inbound', 'text','oi','received',false,NULL,'2026-09-01 10:00:00+00'),
  -- C6
  ('a1a1a1a1-eeee-4000-8000-000000000061','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000006','a1a1a1a1-dddd-4000-8000-000000000006','a1a1a1a1-aaaa-4000-8000-000000000002','inbound', 'text','oi','received',false,NULL,'2026-09-02 10:00:00+00'),
  ('a1a1a1a1-eeee-4000-8000-000000000062','a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-cccc-4000-8000-000000000006','a1a1a1a1-dddd-4000-8000-000000000006','a1a1a1a1-aaaa-4000-8000-000000000002','outbound','text','pessoa','sent',false,NULL,'2026-09-02 10:10:00+00');

-- Regra de tempo: Bruno perdeu C3 para a Ana uma vez (aviso a quem recebeu),
-- e a Ana perdeu C1 para o Bruno uma vez. Mesma forma que response_rule_transfer grava.
INSERT INTO public.notifications (tenant_id, user_id, title, message, type, action_url, action_label, metadata) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-0000-4000-8000-00000000000c','Conversa transferida para você','fix','warning','/x','Ver',
   jsonb_build_object('reason','response_rule','conversation_id','a1a1a1a1-dddd-4000-8000-000000000003','previous_profile_id','a1a1a1a1-0000-4000-8000-0000000000fd','transfer_number',1)),
  ('a1a1a1a1-0000-4000-8000-000000000002','a1a1a1a1-0000-4000-8000-00000000000d','Conversa transferida para você','fix','warning','/x','Ver',
   jsonb_build_object('reason','response_rule','conversation_id','a1a1a1a1-dddd-4000-8000-000000000001','previous_profile_id','a1a1a1a1-0000-4000-8000-0000000000fc','transfer_number',1));

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _m_results (
  seq serial, grupo text, cargo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _m_results TO authenticated;
GRANT ALL ON SEQUENCE _m_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_cargo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _m_results(grupo, cargo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_cargo, p_check, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA    constant uuid := 'a1a1a1a1-0000-4000-8000-000000000002';
  SUPER   constant uuid := 'a1a1a1a1-0000-4000-8000-000000000000';
  GER     constant uuid := 'a1a1a1a1-0000-4000-8000-00000000000a';
  GES     constant uuid := 'a1a1a1a1-0000-4000-8000-00000000000b';
  ANA     constant uuid := 'a1a1a1a1-0000-4000-8000-00000000000c';
  OUTRA   constant uuid := 'a1a1a1a1-0000-4000-8000-00000000000e';
  P_ANA   constant uuid := 'a1a1a1a1-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := 'a1a1a1a1-0000-4000-8000-0000000000fd';
  P_GER   constant uuid := 'a1a1a1a1-0000-4000-8000-0000000000fa';
  cargo record; r record; n int; a record;
BEGIN
  -- ===== A1. os números, vistos pelo gestor =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(GES);
  SELECT * INTO r FROM public.loja_conversation_metrics(LOJA);
  PERFORM pg_temp.afirma('A1', 'gestor', 'conversas na janela (todas)', '6', r.n_conversations::text);
  PERFORM pg_temp.afirma('A1', 'gestor', 'bot tocou (C1, C2)', '2', r.n_bot_touched::text);
  PERFORM pg_temp.afirma('A1', 'gestor', 'sem resposta humana (C2, C4 campanha, C5)', '3', r.n_no_human_reply::text);
  PERFORM pg_temp.afirma('A1', 'gestor', 'esperando pessoa agora (C2, C3, C4; C5 arquivada não)', '3', r.n_waiting_human::text);
  PERFORM pg_temp.afirma('A1', 'gestor', '...sem responsável (C2, C4)', '2', r.n_waiting_human_unowned::text);
  PERFORM pg_temp.afirma('A1', 'gestor', '1ª pessoa medida em 3 (C1 60, C3 30, C6 10)', '3', r.n_first_human::text);
  PERFORM pg_temp.afirma('A1', 'gestor', 'MEDIANA 1ª pessoa = 30 min (a média seria 33,3)', '30.0', round(r.median_first_human_minutes, 1)::text);
  PERFORM pg_temp.afirma('A1', 'gestor', '1ª bot medida em 2 (5 s, 10 s)', '2', r.n_first_bot::text);
  PERFORM pg_temp.afirma('A1', 'gestor', 'MEDIANA 1ª bot = 7,5 s = 0,125 min', '0.125', round(r.median_first_bot_minutes, 3)::text);
  PERFORM pg_temp.afirma('A1', 'gestor', 'mediana de mensagens (3,2,3,2,1,2) = 2', '2', round(r.median_messages)::text);
  PERFORM pg_temp.afirma('A1', 'gestor', 'mediana de duração (60, 0.17, 120, 1, 10; C5 fora) = 10 min', '10.0', round(r.median_duration_minutes, 1)::text);
  RESET ROLE;

  -- ===== A2. janela por conversa criada; "agora" ignora a janela =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(GES);
  SELECT * INTO r FROM public.loja_conversation_metrics(LOJA, '2026-09-02 00:00+00', '2026-09-02 23:59+00');
  PERFORM pg_temp.afirma('A2', 'gestor', 'só C6 na janela do dia 2', '1', r.n_conversations::text);
  PERFORM pg_temp.afirma('A2', 'gestor', '1ª pessoa de C6 = 10 min', '10.0', round(r.median_first_human_minutes, 1)::text);
  PERFORM pg_temp.afirma('A2', 'gestor', 'esperando agora continua 3 (retrato de hoje)', '3', r.n_waiting_human::text);
  RESET ROLE;

  -- ===== A3. alcance =====
  FOR cargo IN SELECT * FROM (VALUES ('gerente', GER, 1), ('gestor', GES, 1), ('atendente', ANA, 1), ('superadmin', SUPER, 0), ('outra conta', OUTRA, 0)) AS v(nome, sub, esperado) LOOP
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.como(cargo.sub);
    SELECT count(*) INTO n FROM public.loja_conversation_metrics(LOJA);
    PERFORM pg_temp.afirma('A3', cargo.nome, 'linhas de loja_conversation_metrics', cargo.esperado::text, n::text);
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO n FROM public.loja_conversation_metrics(LOJA);
  PERFORM pg_temp.afirma('A3', 'service_role', 'o relatório (service role) recebe a linha', '1', n::text);
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO n FROM public.loja_conversation_metrics(LOJA);
  PERFORM pg_temp.afirma('A3', 'sem jwt', 'sem claims, nada', '0', n::text);

  -- ===== C. por pessoa =====
  FOR cargo IN SELECT * FROM (VALUES ('gestor', GES), ('gerente', GER), ('superadmin', SUPER)) AS v(nome, sub) LOOP
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.como(cargo.sub);

    -- C1. linhas: Ana, Bruno, Gerente e a linha "sem responsável"
    SELECT count(*) INTO n FROM public.loja_attendant_metrics(LOJA);
    PERFORM pg_temp.afirma('C1', cargo.nome, '4 linhas: Ana, Bruno, Gerente, sem responsável', '4', n::text);
    SELECT * INTO a FROM public.loja_attendant_metrics(LOJA) x WHERE x.profile_id IS NULL;
    PERFORM pg_temp.afirma('C1', cargo.nome, 'sem responsável: 2 em posse de ninguém (C2, C4)', '2', a.n_held::text);
    PERFORM pg_temp.afirma('C1', cargo.nome, 'sem responsável: 2 esperando pessoa', '2', a.n_waiting::text);
    PERFORM pg_temp.afirma('C1', cargo.nome, 'sem responsável: 2 sem resposta humana', '2', a.n_no_human_reply::text);

    -- C2. Ana: C1 assumida; nada esperando; regra: perdeu 1, recebeu 1
    SELECT * INTO a FROM public.loja_attendant_metrics(LOJA) x WHERE x.profile_id = P_ANA;
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Ana em posse', '1', a.n_held::text);
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Ana assumiu / recebeu / automático', '1/0/0', a.n_assumed || '/' || a.n_transferred || '/' || a.n_automatic);
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Ana esperando resposta', '0', a.n_waiting::text);
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Ana regra sofrida / recebida', '1/1', a.n_rule_transfers_suffered || '/' || a.n_rule_transfers_received);
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Ana é do time, sem motivo', 'ok', CASE WHEN a.reason IS NULL AND NOT a.is_parent_account THEN 'ok' ELSE 'FAIL' END);

    -- Bruno: C3 recebida da Ana (espera; tem resposta humana); C5 arquivada NÃO conta
    SELECT * INTO a FROM public.loja_attendant_metrics(LOJA) x WHERE x.profile_id = P_BRUNO;
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Bruno em posse (C3; C5 arquivada fora)', '1', a.n_held::text);
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Bruno assumiu / recebeu / automático', '0/1/0', a.n_assumed || '/' || a.n_transferred || '/' || a.n_automatic);
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Bruno esperando resposta (C3)', '1', a.n_waiting::text);
    PERFORM pg_temp.afirma('C2', cargo.nome, 'Bruno sem resposta humana', '0', a.n_no_human_reply::text);

    -- C3. Gerente da Conta pai aparece, marcado como da Conta
    SELECT * INTO a FROM public.loja_attendant_metrics(LOJA) x WHERE x.profile_id = P_GER;
    PERFORM pg_temp.afirma('C3', cargo.nome, 'gerente em posse (C6), marcado como da Conta', '1/true', a.n_held || '/' || a.is_parent_account);
    RESET ROLE;
  END LOOP;

  -- C3b. Bruno suspenso continua listado, com o motivo
  UPDATE public.profiles SET status = 'suspended' WHERE id = P_BRUNO;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(GES);
  SELECT * INTO a FROM public.loja_attendant_metrics(LOJA) x WHERE x.profile_id = P_BRUNO;
  PERFORM pg_temp.afirma('C3', 'gestor', 'Bruno suspenso segue na lista com motivo', 'suspended/1', coalesce(a.reason, 'NULL') || '/' || a.n_held);
  RESET ROLE;
  UPDATE public.profiles SET status = 'active' WHERE id = P_BRUNO;

  -- C5. GATE
  FOR cargo IN SELECT * FROM (VALUES ('atendente', ANA), ('outra conta', OUTRA)) AS v(nome, sub) LOOP
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.como(cargo.sub);
    SELECT count(*) INTO n FROM public.loja_attendant_metrics(LOJA);
    PERFORM pg_temp.afirma('C5', cargo.nome, 'ZERO linhas por pessoa', '0', n::text);
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO n FROM public.loja_attendant_metrics(LOJA);
  PERFORM pg_temp.afirma('C5', 'sem jwt', 'sem claims, nada', '0', n::text);
END
$bateria$;

-- -----------------------------------------------------------------------------
-- 4. Placar
-- -----------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(grupo || ' / ' || cargo || ' / ' || check_kind
                           || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _m_results;

ROLLBACK;
