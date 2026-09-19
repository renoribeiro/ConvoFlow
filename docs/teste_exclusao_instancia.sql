-- =============================================================================
-- teste_exclusao_instancia.sql — rede de segurança da exclusão de instância
-- de WhatsApp (migração 20260919000001: whatsapp_instance_delete_preview e
-- delete_whatsapp_instance).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta C com gerente; Loja C com gestor e
--   atendente; Loja C2 com gestor; Conta D alheia com gestor; um superadmin;
--   um gerente SUSPENSO) e seis instâncias na Loja C / Conta D, e afirma:
--
--   E1  atendente: forbidden no preview e na exclusão, para instância COM e
--       SEM histórico — e NADA é tocado (contagens antes = depois). É o
--       caminho que hoje apagava 2.622 mensagens da EncaixaRH.
--   E2  gestor da própria Loja: preview com histórico devolve os números
--       exatos e has_history; a exclusão recusa e nada some.
--   E3  gestor da própria Loja: instância vazia é excluída — a linha, os
--       webhook_logs e as tentativas de webhook vão junto; NENHUMA outra
--       instância é tocada.
--   E4  follow-up sozinho já é histórico (era o que o laço antigo esquecia e
--       fazia o último passo falhar depois de apagar o resto).
--   E5  gerente da Conta-mãe numa Loja filha DIRETA: exclui (access =
--       gerente_child_store). Decisão de 2026-09-19 — a EncaixaRH não tem
--       gestor. Gerente SUSPENSO: forbidden. Loja de outra Conta: not_found.
--   E6  gestor de Loja irmã e gestor de Conta alheia: not_found (mesma
--       resposta de "não existe" — não revela a instância).
--   E7  superadmin: NÃO passa por cima do histórico (has_history); exclui a
--       vazia com access = superadmin.
--   E8  instância Meta vazia: some a linha, instance_secrets (cascata) e o
--       segredo em vault.secrets (que a cascata NÃO cobre). Era a origem dos
--       7 órfãos no Vault.
--   E9  sem sessão (auth.uid() NULL): unauthenticated. id inexistente:
--       not_found. Funções internas: 42501 para authenticated.
--   E10 falha parcial impossível: um trigger temporário faz o DELETE da linha
--       explodir DEPOIS de executado; afirma que linha, instance_secrets,
--       webhook_logs e o segredo do Vault continuam todos lá. Uma função =
--       uma transação.
--   E11 as instâncias REAIS (EncaixaRH e as duas de teste) têm as mesmas
--       contagens no fim que tinham no início.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo dddddddd-.
--   Guarda de colisão antes de semear. O segredo criado no Vault e o trigger
--   de E10 morrem no ROLLBACK. E10 cria o trigger em public.whatsapp_instances:
--   isso toma SHARE ROW EXCLUSIVE na tabela até o fim da transação (menos de
--   um segundo em 2026-09-19) — rode fora de horário de pico se quiser zero
--   espera para os webhooks.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita), o arquivo inteiro de
--   uma vez. O placar sai no fim.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM da seção 5: a contagem passa a devolver zero
--   para tudo. Esperado: E1 continua verde (a capability barra antes);
--   E2, E4, E5 e E7 ficam vermelhos — o preview diz "vazia" e a exclusão com
--   histórico vira 'ERR 23503' (o FK NO ACTION de messages /
--   individual_followups segura a linha, e a transação desfaz). Sem esse FK,
--   conversations e chatbot_sessions seriam SET NULL em silêncio: a suíte é a
--   única coisa que enxerga a diferença entre "recusou" e "o FK salvou".
--   Medido em 2026-09-19 contra produção: fase 1 = 61/61 verde; fase 2 =
--   12 vermelhos, exatamente E2 (6), E4 (2), E5 (2) e E7 (2); o resto verde,
--   inclusive "I2 intacta" — nada foi apagado nem com a contagem sabotada.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'dddddddd-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'dddddddd-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com usuário real do Auth. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_instances WHERE id::text LIKE 'dddddddd-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com instância real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.delete_whatsapp_instance(uuid)') IS NULL
     OR to_regprocedure('public.whatsapp_instance_delete_preview(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260919000001 ainda não foi aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('dddddddd-0000-4000-8000-00000000000a','authenticated','authenticated','fix-c-gerente@fixture.invalid',   now(), now()),
  ('dddddddd-0000-4000-8000-00000000000b','authenticated','authenticated','fix-c-gestor@fixture.invalid',    now(), now()),
  ('dddddddd-0000-4000-8000-00000000000c','authenticated','authenticated','fix-c-atendente@fixture.invalid', now(), now()),
  ('dddddddd-0000-4000-8000-00000000000d','authenticated','authenticated','fix-c2-gestor@fixture.invalid',   now(), now()),
  ('dddddddd-0000-4000-8000-00000000000e','authenticated','authenticated','fix-d-gestor@fixture.invalid',    now(), now()),
  ('dddddddd-0000-4000-8000-00000000000f','authenticated','authenticated','fix-super@fixture.invalid',       now(), now()),
  ('dddddddd-0000-4000-8000-000000000010','authenticated','authenticated','fix-c-gerente-susp@fixture.invalid', now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('dddddddd-0000-4000-8000-000000000001','FIXTURE Conta C','fixture-conta-c','account', NULL,'active','active'),
  ('dddddddd-0000-4000-8000-000000000002','FIXTURE Loja C', 'fixture-loja-c', 'store','dddddddd-0000-4000-8000-000000000001','active',NULL),
  ('dddddddd-0000-4000-8000-000000000003','FIXTURE Loja C2','fixture-loja-c2','store','dddddddd-0000-4000-8000-000000000001','active',NULL),
  ('dddddddd-0000-4000-8000-000000000004','FIXTURE Conta D','fixture-conta-d','account', NULL,'active','active');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('dddddddd-0000-4000-8000-0000000000fa','dddddddd-0000-4000-8000-00000000000a','dddddddd-0000-4000-8000-000000000001','gerente',   NULL,'active',   'FIX','Gerente C',  '2026-01-01 10:00+00'),
  ('dddddddd-0000-4000-8000-0000000000fb','dddddddd-0000-4000-8000-00000000000b','dddddddd-0000-4000-8000-000000000002','gestor',   'dddddddd-0000-4000-8000-0000000000fa','active','FIX','Gestor C','2026-01-01 10:01+00'),
  ('dddddddd-0000-4000-8000-0000000000fc','dddddddd-0000-4000-8000-00000000000c','dddddddd-0000-4000-8000-000000000002','atendente','dddddddd-0000-4000-8000-0000000000fb','active','FIX','Atendente C','2026-01-01 10:02+00'),
  ('dddddddd-0000-4000-8000-0000000000fd','dddddddd-0000-4000-8000-00000000000d','dddddddd-0000-4000-8000-000000000003','gestor',   'dddddddd-0000-4000-8000-0000000000fa','active','FIX','Gestor C2','2026-01-01 10:03+00'),
  ('dddddddd-0000-4000-8000-0000000000fe','dddddddd-0000-4000-8000-00000000000e','dddddddd-0000-4000-8000-000000000004','gestor',    NULL,'active',   'FIX','Gestor D',   '2026-01-01 10:04+00'),
  ('dddddddd-0000-4000-8000-0000000000ff','dddddddd-0000-4000-8000-00000000000f', NULL,                                 'superadmin',NULL,'active',   'FIX','Super',      '2026-01-01 10:05+00'),
  ('dddddddd-0000-4000-8000-0000000000f1','dddddddd-0000-4000-8000-000000000010','dddddddd-0000-4000-8000-000000000001','gerente',   NULL,'suspended','FIX','Gerente Susp','2026-01-01 10:06+00');

-- As instâncias e o que depende delas ficam em funções: a bateria apaga
-- instâncias, e a fase 2 (sabotagem) precisa do estado inicial de novo.
-- session_replication_role só pode ser trocado no nível de cima (dentro de
-- função dá 42501 para o papel postgres) — por isso o replica/origin fica
-- fora, e o Vault (que precisa dos triggers de criptografia) vai numa função
-- separada, chamada em modo origin.
CREATE FUNCTION pg_temp.semear() RETURNS void LANGUAGE plpgsql AS $seed$
BEGIN
  -- Instâncias:
  --   I1 Loja C, Evolution, VAZIA
  --   I2 Loja C, Evolution, COM histórico
  --   I3 Loja C, Meta,      vazia, com segredo no Vault
  --   I4 Loja C, Evolution, só 1 follow-up
  --   I5 Conta D, Evolution, vazia (alheia)
  --   I6 Loja C, Meta,      vazia, com segredo + webhook_logs (E10, falha parcial)
  INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, provider, status, connection_config) VALUES
  ('dddddddd-aaaa-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','FIX I1 vazia',     'fix-i1','evolution','disconnected','{"baseUrl":"https://evo.fixture.invalid","apiKey":"k1"}'),
  ('dddddddd-aaaa-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000002','FIX I2 historico', 'fix-i2','evolution','open',        NULL),
  ('dddddddd-aaaa-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000002','FIX I3 meta',      'fix-i3','official', 'open',        '{"phoneNumberId":"1","wabaId":"2"}'),
  ('dddddddd-aaaa-4000-8000-000000000004','dddddddd-0000-4000-8000-000000000002','FIX I4 followup',  'fix-i4','evolution','disconnected',NULL),
  ('dddddddd-aaaa-4000-8000-000000000005','dddddddd-0000-4000-8000-000000000004','FIX I5 alheia',    'fix-i5','evolution','disconnected',NULL),
  ('dddddddd-aaaa-4000-8000-000000000006','dddddddd-0000-4000-8000-000000000002','FIX I6 meta trig', 'fix-i6','official', 'open',        NULL);

  -- Histórico da I2: 3 contatos, 2 conversas, 5 mensagens, 1 chatbot, 2 sessões, 1 campanha.
  INSERT INTO public.contacts (id, tenant_id, whatsapp_instance_id, phone, name) VALUES
  ('dddddddd-cccc-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002','5553900000001','FIX c1'),
  ('dddddddd-cccc-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002','5553900000002','FIX c2'),
  ('dddddddd-cccc-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002','5553900000003','FIX c3'),
  -- contato da I4 (sem instância: o follow-up é que aponta para a I4)
  ('dddddddd-cccc-4000-8000-000000000004','dddddddd-0000-4000-8000-000000000002',NULL,'5553900000004','FIX c4');

  INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id) VALUES
  ('dddddddd-dddd-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','dddddddd-cccc-4000-8000-000000000001','dddddddd-aaaa-4000-8000-000000000002'),
  ('dddddddd-dddd-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000002','dddddddd-cccc-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002');

  INSERT INTO public.messages (id, tenant_id, whatsapp_instance_id, contact_id, conversation_id, direction, message_type, content, status)
  SELECT ('dddddddd-eeee-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       'dddddddd-0000-4000-8000-000000000002'::uuid, 'dddddddd-aaaa-4000-8000-000000000002'::uuid,
       (CASE WHEN n <= 3 THEN 'dddddddd-cccc-4000-8000-000000000001' ELSE 'dddddddd-cccc-4000-8000-000000000002' END)::uuid,
       (CASE WHEN n <= 3 THEN 'dddddddd-dddd-4000-8000-000000000001' ELSE 'dddddddd-dddd-4000-8000-000000000002' END)::uuid,
       CASE WHEN n % 2 = 0 THEN 'outbound' ELSE 'inbound' END, 'text', 'FIX msg ' || n, 'received'
  FROM generate_series(1, 5) n;

  INSERT INTO public.chatbots (id, tenant_id, whatsapp_instance_id, name, is_active, is_published, builder_version) VALUES
  ('dddddddd-bbbb-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002','FIX bot', true, true, 2);

  INSERT INTO public.chatbot_sessions (id, chatbot_id, contact_id, tenant_id, whatsapp_instance_id, status) VALUES
  ('dddddddd-ffff-4000-8000-000000000001','dddddddd-bbbb-4000-8000-000000000001','dddddddd-cccc-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002','completed'),
  ('dddddddd-ffff-4000-8000-000000000002','dddddddd-bbbb-4000-8000-000000000001','dddddddd-cccc-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002','active');

  INSERT INTO public.mass_message_campaigns (id, tenant_id, whatsapp_instance_id, name, message_template, status) VALUES
  ('dddddddd-1111-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','dddddddd-aaaa-4000-8000-000000000002','FIX camp','oi','draft');

  -- Só um follow-up na I4.
  INSERT INTO public.individual_followups (id, tenant_id, contact_id, whatsapp_instance_id, task, due_date, priority, type, status) VALUES
  ('dddddddd-2222-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','dddddddd-cccc-4000-8000-000000000004','dddddddd-aaaa-4000-8000-000000000004','FIX ligar', now() + interval '1 day','medium','whatsapp','pending');

  -- Coisas que cascateiam (não são histórico): logs e tentativas de webhook na I1 e na I6.
  INSERT INTO public.webhook_logs (instance_name, event_type, whatsapp_instance_id) VALUES
  ('fix-i1','CONNECTION_UPDATE','dddddddd-aaaa-4000-8000-000000000001'),
  ('fix-i1','QRCODE_UPDATED',   'dddddddd-aaaa-4000-8000-000000000001'),
  ('fix-i6','messages',         'dddddddd-aaaa-4000-8000-000000000006');
  INSERT INTO public.webhook_configuration_attempts (whatsapp_instance_id, attempt_number, webhook_url, events, success) VALUES
  ('dddddddd-aaaa-4000-8000-000000000001', 1, 'https://x.invalid/hook', ARRAY['MESSAGES_UPSERT'], true);

END;
$seed$;

-- Segredos no Vault para I3 e I6 (o mesmo gesto de set_instance_meta_token).
-- Chamar em modo origin: o Vault criptografa por trigger.
CREATE FUNCTION pg_temp.semear_vault() RETURNS void LANGUAGE plpgsql AS $seedv$
DECLARE v3 uuid; v6 uuid;
BEGIN
  v3 := vault.create_secret('FIX-token-3', 'meta_token_dddddddd-aaaa-4000-8000-000000000003', 'FIXTURE');
  v6 := vault.create_secret('FIX-token-6', 'meta_token_dddddddd-aaaa-4000-8000-000000000006', 'FIXTURE');
  INSERT INTO public.instance_secrets (instance_id, tenant_id, vault_secret_id) VALUES
    ('dddddddd-aaaa-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000002', v3),
    ('dddddddd-aaaa-4000-8000-000000000006','dddddddd-0000-4000-8000-000000000002', v6);
END;
$seedv$;

-- Desfaz tudo que as duas semeaduras criaram (sem tocar em tenants/perfis/usuários).
CREATE FUNCTION pg_temp.limpar() RETURNS void LANGUAGE plpgsql AS $clean$
BEGIN
  DELETE FROM public.messages                       WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM public.chatbot_sessions               WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM public.conversations                  WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM public.individual_followups           WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM public.mass_message_campaigns         WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM public.chatbots                       WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM public.contacts                       WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM public.webhook_logs                   WHERE whatsapp_instance_id::text LIKE 'dddddddd-%';
  DELETE FROM public.webhook_configuration_attempts WHERE whatsapp_instance_id::text LIKE 'dddddddd-%';
  DELETE FROM public.instance_secrets               WHERE instance_id::text LIKE 'dddddddd-%';
  DELETE FROM vault.secrets                         WHERE name LIKE 'meta_token_dddddddd-%';
  DELETE FROM public.whatsapp_instances             WHERE id::text LIKE 'dddddddd-%';
END;
$clean$;

SELECT pg_temp.semear();
SET LOCAL session_replication_role = origin;
SELECT pg_temp.semear_vault();

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _ex_results (
  seq serial, phase text, cenario text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_phase text, p_cenario text, p_check text, p_expected text, p_actual text) RETURNS void
LANGUAGE sql AS $f$
  INSERT INTO _ex_results(phase, cenario, check_kind, expected, actual, status)
  VALUES (p_phase, p_cenario, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;

-- Chama a RPC como a pessoa p_sub (NULL = sem sessão). Erro vira {ok:false, reason:'ERR <sqlstate>'}.
CREATE FUNCTION pg_temp.excluir(p_sub uuid, p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  IF p_sub IS NULL THEN PERFORM set_config('request.jwt.claims', '', true); ELSE PERFORM pg_temp.como(p_sub); END IF;
  r := public.delete_whatsapp_instance(p_id);
  RESET ROLE;
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE, 'message', SQLERRM);
END;
$f$;

CREATE FUNCTION pg_temp.preview(p_sub uuid, p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  IF p_sub IS NULL THEN PERFORM set_config('request.jwt.claims', '', true); ELSE PERFORM pg_temp.como(p_sub); END IF;
  r := public.whatsapp_instance_delete_preview(p_id);
  RESET ROLE;
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE, 'message', SQLERRM);
END;
$f$;

-- Retrato de uma instância: existe? + contagens de tudo que depende dela.
CREATE FUNCTION pg_temp.retrato(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT format('inst=%s conv=%s msg=%s cont=%s bots=%s sess=%s camp=%s fu=%s enr=%s logs=%s att=%s sec=%s vault=%s',
    (SELECT count(*) FROM public.whatsapp_instances WHERE id = p_id),
    (SELECT count(*) FROM public.conversations WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.messages WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.contacts WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.chatbots WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.chatbot_sessions WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.mass_message_campaigns WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.individual_followups WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.followup_sequence_enrollments WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.webhook_logs WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.webhook_configuration_attempts WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.instance_secrets WHERE instance_id = p_id),
    (SELECT count(*) FROM vault.secrets WHERE name = 'meta_token_' || p_id::text));
$f$;

-- Retrato das instâncias REAIS (tudo que não é fixture), para E11.
CREATE FUNCTION pg_temp.retrato_reais() RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(i.id::text || ':' || pg_temp.retrato(i.id), ' | ' ORDER BY i.id), '-')
    FROM public.whatsapp_instances i WHERE i.id::text NOT LIKE 'dddddddd-%';
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.bateria(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  GER   CONSTANT uuid := 'dddddddd-0000-4000-8000-00000000000a';
  GES   CONSTANT uuid := 'dddddddd-0000-4000-8000-00000000000b';
  ATE   CONSTANT uuid := 'dddddddd-0000-4000-8000-00000000000c';
  GES2  CONSTANT uuid := 'dddddddd-0000-4000-8000-00000000000d';
  GESD  CONSTANT uuid := 'dddddddd-0000-4000-8000-00000000000e';
  SUPER CONSTANT uuid := 'dddddddd-0000-4000-8000-00000000000f';
  GSUSP CONSTANT uuid := 'dddddddd-0000-4000-8000-000000000010';
  I1 CONSTANT uuid := 'dddddddd-aaaa-4000-8000-000000000001';
  I2 CONSTANT uuid := 'dddddddd-aaaa-4000-8000-000000000002';
  I3 CONSTANT uuid := 'dddddddd-aaaa-4000-8000-000000000003';
  I4 CONSTANT uuid := 'dddddddd-aaaa-4000-8000-000000000004';
  I5 CONSTANT uuid := 'dddddddd-aaaa-4000-8000-000000000005';
  I6 CONSTANT uuid := 'dddddddd-aaaa-4000-8000-000000000006';
  reais_antes text := pg_temp.retrato_reais();
  n_reais_antes bigint := (SELECT count(*) FROM public.whatsapp_instances WHERE id::text NOT LIKE 'dddddddd-%');
  antes text;
  r jsonb;
  v_txt text;
BEGIN
  -- ============================ E1: atendente ============================
  antes := pg_temp.retrato(I2);
  r := pg_temp.preview(ATE, I2);
  PERFORM pg_temp.afirma(p_phase, 'E1', 'preview I2 (histórico) como atendente → forbidden', 'forbidden', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E1', 'preview não expõe contagens ao atendente', 'false', (r ? 'counts')::text);
  r := pg_temp.excluir(ATE, I2);
  PERFORM pg_temp.afirma(p_phase, 'E1', 'excluir I2 (histórico) como atendente → forbidden', 'forbidden', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E1', 'I2 intacta depois do atendente (a prova: 5 mensagens, 2 conversas continuam)', antes, pg_temp.retrato(I2));
  PERFORM pg_temp.afirma(p_phase, 'E1', 'retrato I2 é o esperado', 'inst=1 conv=2 msg=5 cont=3 bots=1 sess=2 camp=1 fu=0 enr=0 logs=0 att=0 sec=0 vault=0', pg_temp.retrato(I2));
  antes := pg_temp.retrato(I1);
  r := pg_temp.excluir(ATE, I1);
  PERFORM pg_temp.afirma(p_phase, 'E1', 'excluir I1 (vazia) como atendente → forbidden (capability, não histórico)', 'forbidden', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E1', 'I1 intacta depois do atendente', antes, pg_temp.retrato(I1));

  -- ============================ E2: gestor, histórico ============================
  antes := pg_temp.retrato(I2);
  r := pg_temp.preview(GES, I2);
  PERFORM pg_temp.afirma(p_phase, 'E2', 'preview I2 como gestor → has_history', 'has_history', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E2', 'preview.ok = false', 'false', r->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'E2', 'counts exatos', '2/5/3/1/2/1/0/0/0',
    format('%s/%s/%s/%s/%s/%s/%s/%s/%s', r#>>'{counts,conversations}', r#>>'{counts,messages}', r#>>'{counts,contacts}',
           r#>>'{counts,chatbots}', r#>>'{counts,chatbot_sessions}', r#>>'{counts,campaigns}',
           r#>>'{counts,followups}', r#>>'{counts,followup_enrollments}', r#>>'{counts,followup_sequences}'));
  PERFORM pg_temp.afirma(p_phase, 'E2', 'total = 14', '14', r->>'total');
  PERFORM pg_temp.afirma(p_phase, 'E2', 'access = own_tenant', 'own_tenant', r->>'access');
  PERFORM pg_temp.afirma(p_phase, 'E2', 'instance.provider volta preenchido', 'evolution', r#>>'{instance,provider}');
  r := pg_temp.excluir(GES, I2);
  PERFORM pg_temp.afirma(p_phase, 'E2', 'excluir I2 como gestor → has_history', 'has_history', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E2', 'mensagem cita as contagens', 'true', (r->>'message' LIKE '%2 conversa(s), 5 mensagem(ns), 3 contato(s)%')::text);
  PERFORM pg_temp.afirma(p_phase, 'E2', 'I2 intacta depois da recusa', antes, pg_temp.retrato(I2));

  -- ============================ E3: gestor, vazia ============================
  PERFORM pg_temp.afirma(p_phase, 'E3', 'I1 antes: 2 logs + 1 tentativa', 'inst=1 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=2 att=1 sec=0 vault=0', pg_temp.retrato(I1));
  r := pg_temp.preview(GES, I1);
  PERFORM pg_temp.afirma(p_phase, 'E3', 'preview I1 → ok/empty', 'true/empty', (r->>'ok') || '/' || (r->>'reason'));
  PERFORM pg_temp.afirma(p_phase, 'E3', 'preview não apaga', 'inst=1 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=2 att=1 sec=0 vault=0', pg_temp.retrato(I1));
  r := pg_temp.excluir(GES, I1);
  PERFORM pg_temp.afirma(p_phase, 'E3', 'excluir I1 → ok/deleted', 'true/deleted', (r->>'ok') || '/' || (r->>'reason'));
  PERFORM pg_temp.afirma(p_phase, 'E3', 'removed.webhook_logs = 2', '2', r#>>'{removed,webhook_logs}');
  PERFORM pg_temp.afirma(p_phase, 'E3', 'removed.webhook_configuration_attempts = 1', '1', r#>>'{removed,webhook_configuration_attempts}');
  PERFORM pg_temp.afirma(p_phase, 'E3', 'removed.vault_secrets = 0 (Evolution não tem)', '0', r#>>'{removed,vault_secrets}');
  PERFORM pg_temp.afirma(p_phase, 'E3', 'connection_config volta para a edge function', 'https://evo.fixture.invalid', r#>>'{connection_config,baseUrl}');
  PERFORM pg_temp.afirma(p_phase, 'E3', 'I1 sumiu com logs e tentativas', 'inst=0 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=0 att=0 sec=0 vault=0', pg_temp.retrato(I1));
  PERFORM pg_temp.afirma(p_phase, 'E3', 'I2 (vizinha, com histórico) não foi tocada', antes, pg_temp.retrato(I2));
  r := pg_temp.excluir(GES, I1);
  PERFORM pg_temp.afirma(p_phase, 'E3', 'excluir de novo → not_found', 'not_found', r->>'reason');

  -- ============================ E4: só follow-up ============================
  r := pg_temp.excluir(GES, I4);
  PERFORM pg_temp.afirma(p_phase, 'E4', 'I4 (1 follow-up, resto zero) → has_history', 'has_history', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E4', 'counts.followups = 1', '1', r#>>'{counts,followups}');
  PERFORM pg_temp.afirma(p_phase, 'E4', 'I4 intacta', 'inst=1 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=1 enr=0 logs=0 att=0 sec=0 vault=0', pg_temp.retrato(I4));

  -- ============================ E5: gerente ============================
  r := pg_temp.excluir(GER, I2);
  PERFORM pg_temp.afirma(p_phase, 'E5', 'gerente na Loja filha, I2 com histórico → has_history (não passa por cima)', 'has_history', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E5', 'access do gerente = gerente_child_store', 'gerente_child_store', r->>'access');
  -- Reaproveita a I4 tirando o follow-up: vira vazia para o gerente excluir.
  DELETE FROM public.individual_followups WHERE id = 'dddddddd-2222-4000-8000-000000000001';
  r := pg_temp.excluir(GER, I4);
  PERFORM pg_temp.afirma(p_phase, 'E5', 'gerente exclui instância vazia da Loja filha', 'true/deleted/gerente_child_store', (r->>'ok') || '/' || (r->>'reason') || '/' || (r->>'access'));
  PERFORM pg_temp.afirma(p_phase, 'E5', 'I4 sumiu', '0', (SELECT count(*) FROM public.whatsapp_instances WHERE id = I4)::text);
  r := pg_temp.excluir(GER, I5);
  PERFORM pg_temp.afirma(p_phase, 'E5', 'gerente em Conta alheia → not_found', 'not_found', r->>'reason');
  r := pg_temp.excluir(GSUSP, I3);
  PERFORM pg_temp.afirma(p_phase, 'E5', 'gerente SUSPENSO → forbidden', 'forbidden', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E5', 'I3 intacta depois do suspenso', 'inst=1 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=0 att=0 sec=1 vault=1', pg_temp.retrato(I3));

  -- ============================ E6: irmã e alheia ============================
  r := pg_temp.excluir(GES2, I3);
  PERFORM pg_temp.afirma(p_phase, 'E6', 'gestor da Loja irmã → not_found', 'not_found', r->>'reason');
  r := pg_temp.excluir(GESD, I3);
  PERFORM pg_temp.afirma(p_phase, 'E6', 'gestor de Conta alheia → not_found', 'not_found', r->>'reason');
  r := pg_temp.preview(GESD, I3);
  PERFORM pg_temp.afirma(p_phase, 'E6', 'preview alheio → not_found, sem counts', 'not_found/false', (r->>'reason') || '/' || (r ? 'counts')::text);
  PERFORM pg_temp.afirma(p_phase, 'E6', 'I3 intacta', 'inst=1 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=0 att=0 sec=1 vault=1', pg_temp.retrato(I3));

  -- ============================ E7: superadmin ============================
  antes := pg_temp.retrato(I2);
  r := pg_temp.excluir(SUPER, I2);
  PERFORM pg_temp.afirma(p_phase, 'E7', 'superadmin em I2 → has_history (sem override para ninguém)', 'has_history', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E7', 'access = superadmin', 'superadmin', r->>'access');
  PERFORM pg_temp.afirma(p_phase, 'E7', 'I2 intacta', antes, pg_temp.retrato(I2));
  r := pg_temp.excluir(SUPER, I5);
  PERFORM pg_temp.afirma(p_phase, 'E7', 'superadmin exclui a vazia de qualquer Conta', 'true/superadmin', (r->>'ok') || '/' || (r->>'access'));

  -- ============================ E8: Meta + Vault ============================
  r := pg_temp.excluir(GES, I3);
  PERFORM pg_temp.afirma(p_phase, 'E8', 'I3 (Meta vazia) → deleted', 'deleted', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E8', 'removed.vault_secrets = 1', '1', r#>>'{removed,vault_secrets}');
  PERFORM pg_temp.afirma(p_phase, 'E8', 'linha, instance_secrets e vault.secrets sumiram', 'inst=0 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=0 att=0 sec=0 vault=0', pg_temp.retrato(I3));
  PERFORM pg_temp.afirma(p_phase, 'E8', 'o segredo da I6 (outra Meta) continua', '1', (SELECT count(*) FROM vault.secrets WHERE name = 'meta_token_' || I6::text)::text);

  -- ============================ E9: sem sessão / inexistente / internas ============================
  r := pg_temp.excluir(NULL, I6);
  PERFORM pg_temp.afirma(p_phase, 'E9', 'sem sessão → unauthenticated', 'unauthenticated', r->>'reason');
  r := pg_temp.excluir(GES, 'dddddddd-9999-4000-8000-000000000000');
  PERFORM pg_temp.afirma(p_phase, 'E9', 'id inexistente → not_found', 'not_found', r->>'reason');
  r := pg_temp.excluir(GES, NULL);
  PERFORM pg_temp.afirma(p_phase, 'E9', 'id NULL → not_found', 'not_found', r->>'reason');
  BEGIN
    SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
    PERFORM public.whatsapp_instance_delete_check(I6);
    v_txt := 'passou';
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_txt := SQLSTATE; RESET ROLE;
  END;
  PERFORM pg_temp.afirma(p_phase, 'E9', 'whatsapp_instance_delete_check direto como authenticated → 42501', '42501', v_txt);
  BEGIN
    SET LOCAL ROLE authenticated; PERFORM pg_temp.como(GES);
    PERFORM public.whatsapp_instance_history_counts(I6);
    v_txt := 'passou';
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_txt := SQLSTATE; RESET ROLE;
  END;
  PERFORM pg_temp.afirma(p_phase, 'E9', 'whatsapp_instance_history_counts direto como authenticated → 42501', '42501', v_txt);

  -- ============================ E10: falha parcial impossível ============================
  antes := pg_temp.retrato(I6);
  PERFORM pg_temp.afirma(p_phase, 'E10', 'I6 antes: 1 log, 1 secret, 1 vault', 'inst=1 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=1 att=0 sec=1 vault=1', antes);
  -- Trigger que explode DEPOIS de a linha ter sido apagada (AFTER DELETE).
  CREATE FUNCTION pg_temp.explode_i6() RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN
    IF OLD.id = 'dddddddd-aaaa-4000-8000-000000000006' THEN
      RAISE EXCEPTION 'FIXTURE: falha simulada depois do DELETE' USING ERRCODE = 'P0099';
    END IF;
    RETURN OLD;
  END;
  $t$;
  CREATE TRIGGER zz_fixture_explode_i6 AFTER DELETE ON public.whatsapp_instances
    FOR EACH ROW EXECUTE FUNCTION pg_temp.explode_i6();
  r := pg_temp.excluir(GES, I6);
  DROP TRIGGER zz_fixture_explode_i6 ON public.whatsapp_instances;
  DROP FUNCTION pg_temp.explode_i6();
  PERFORM pg_temp.afirma(p_phase, 'E10', 'a chamada falhou com o erro simulado', 'ERR P0099', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E10', 'NADA foi apagado: linha, log, secret e vault continuam', antes, pg_temp.retrato(I6));
  -- E sem o trigger, a mesma chamada conclui.
  r := pg_temp.excluir(GES, I6);
  PERFORM pg_temp.afirma(p_phase, 'E10', 'sem a falha, a exclusão conclui', 'deleted', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E10', 'e leva tudo junto', 'inst=0 conv=0 msg=0 cont=0 bots=0 sess=0 camp=0 fu=0 enr=0 logs=0 att=0 sec=0 vault=0', pg_temp.retrato(I6));

  -- ============================ E11: as reais ============================
  PERFORM pg_temp.afirma(p_phase, 'E11', 'instâncias reais: retrato igual ao do início', reais_antes, pg_temp.retrato_reais());
  PERFORM pg_temp.afirma(p_phase, 'E11', 'nenhuma instância real sumiu', n_reais_antes::text,
    (SELECT count(*) FROM public.whatsapp_instances WHERE id::text NOT LIKE 'dddddddd-%')::text);

  RESET ROLE;
END
$fn$;

-- -----------------------------------------------------------------------------
-- 4. Fase 1 — como está
-- -----------------------------------------------------------------------------
SELECT pg_temp.bateria('1-intacto');

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suíte sabe falhar)
--    A contagem passa a dizer que tudo está vazio. Esperado: E2, E4, E5 e E7
--    vermelhos (a exclusão com histórico deixa de recusar), E1 continua verde
--    (capability barra antes). Desfeito pelo ROLLBACK junto com todo o resto.
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.whatsapp_instance_history_counts(p_instance_id uuid)
-- RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $s$
--   SELECT '{"conversations":0,"messages":0,"contacts":0,"chatbots":0,"chatbot_sessions":0,"campaigns":0,"followups":0,"followup_enrollments":0,"followup_sequences":0}'::jsonb;
-- $s$;
-- SET LOCAL session_replication_role = replica;
-- SELECT pg_temp.limpar();
-- SELECT pg_temp.semear();
-- SET LOCAL session_replication_role = origin;
-- SELECT pg_temp.semear_vault();
-- SELECT pg_temp.bateria('2-sabotado');

-- -----------------------------------------------------------------------------
-- 6. Placar
-- -----------------------------------------------------------------------------
SELECT phase,
       count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(cenario || ' / ' || check_kind
                           || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _ex_results GROUP BY phase ORDER BY phase;

ROLLBACK;
