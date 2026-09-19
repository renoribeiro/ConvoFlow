-- =============================================================================
-- teste_reconexao_meta.sql — rede de segurança da reconexão pelo Embedded
-- Signup (migração 20260919000002: meta_signup_check e meta_signup_commit).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta C com gerente; Loja C com gestor e
--   atendente; Loja C2 com gestor; Conta D alheia com gestor; um superadmin;
--   um gerente SUSPENSO), três instâncias Meta e uma Evolution, e afirma:
--
--   R1  reconexão pelo gestor da própria Loja: MESMO id, e cada campo da lista
--       de preservação continua igual — tenant_id, instance_key, registered_at,
--       created_at, is_active, assigned_profile_id, quality_rating,
--       messaging_limit_tier, account_review_status, is_restricted,
--       restriction_info, health_updated_at, name (sem nome digitado) e
--       connection_config.registerPin. O que muda: status 'open',
--       last_connected_at, wabaId, graphApiVersion, onboarding, phone_number e
--       profile_name (só porque a Meta devolveu). O segredo do Vault é
--       atualizado NO LUGAR (mesmo vault_secret_id, valor novo). Todo o
--       histórico (conversas, mensagens, contatos, bot, sessões) continua
--       apontando para o id.
--   R2  reconexão com nome digitado troca só o nome; reconexão sem retorno da
--       Meta (phone_number/profile_name nulos) mantém os antigos; chave extra
--       da config sobrevive ao merge.
--   R3  reconexão por quem NÃO alcança a linha: gestor de Loja irmã, gestor de
--       Conta alheia, gerente SUSPENSO → foreign_instance, mensagem sem o nome
--       nem o id da Conta dona, e a linha + o Vault byte a byte iguais.
--       Atendente → forbidden antes de qualquer lookup.
--   R4  primeira conexão continua funcionando: gestor na própria Loja, gerente
--       na Loja filha (a Conta é a do SELETOR, não a do perfil do gerente),
--       superadmin em qualquer Conta. Linha nova com instance_key =
--       phoneNumberId, provider official, onboarding embedded_signup, segredo
--       criado no Vault. Sem Conta de destino → tenant_required; Conta alheia
--       ou inexistente → forbidden_tenant (mesma resposta).
--   R5  gerente da Conta-mãe reconecta a Loja filha (o caso da EncaixaRH);
--       a Conta mandada no seletor é IGNORADA na reconexão.
--   R6  as duas colunas discordando: uma linha casando só por instance_key é
--       reconectada (config.phoneNumberId regravado, instance_key intacta);
--       duas linhas diferentes → ambiguous e nada muda. Identificador de
--       instância Evolution → provider_mismatch.
--   R7  falha no meio NÃO apaga a linha do cliente: um trigger temporário faz
--       o UPDATE da reconexão explodir; a linha, o histórico e o segredo do
--       Vault continuam exatamente como antes (uma função = uma transação).
--       O mesmo trigger no INSERT da primeira conexão deixa ZERO linha nova e
--       ZERO segredo novo.
--   R8  sem sessão: unauthenticated. wabaId ou token vazios: invalid, sem
--       tocar em nada. meta_signup_check direto: 42501 para authenticated.
--   R9  as instâncias REAIS (EncaixaRH e a de teste) têm o mesmo retrato no
--       fim que tinham no início — e a EncaixaRH, o mesmo md5 da linha.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo eeeeeeee-,
--   phoneNumberIds de fixture começando com 9009. Guarda de colisão antes de
--   semear. Os segredos criados no Vault e os triggers de R7 morrem no
--   ROLLBACK. R7 cria trigger em public.whatsapp_instances: isso toma SHARE
--   ROW EXCLUSIVE na tabela até o fim da transação (menos de um segundo) —
--   rode fora de horário de pico se quiser zero espera para os webhooks.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita), o arquivo inteiro de
--   uma vez. O placar sai no fim.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM da seção 5: a reconexão passa a REESCREVER
--   connection_config do zero (perde o registerPin) e a zerar registered_at —
--   exatamente o que o código antigo faria. Esperado: R1, R2 e R5 ficam
--   vermelhos nos checks de registerPin / registered_at; o resto continua
--   verde. Medido em 2026-09-19 contra produção: ver o relatório da entrega.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'eeeeeeee-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'eeeeeeee-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com usuário real do Auth. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_instances WHERE id::text LIKE 'eeeeeeee-%' OR instance_key LIKE '9009%') THEN
    RAISE EXCEPTION 'ABORTADO: fixture colide com instância real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.meta_signup_commit(text, uuid, text, text, text, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260919000002 ainda não foi aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('eeeeeeee-0000-4000-8000-00000000000a','authenticated','authenticated','fixr-c-gerente@fixture.invalid',   now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000b','authenticated','authenticated','fixr-c-gestor@fixture.invalid',    now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000c','authenticated','authenticated','fixr-c-atendente@fixture.invalid', now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000d','authenticated','authenticated','fixr-c2-gestor@fixture.invalid',   now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000e','authenticated','authenticated','fixr-d-gestor@fixture.invalid',    now(), now()),
  ('eeeeeeee-0000-4000-8000-00000000000f','authenticated','authenticated','fixr-super@fixture.invalid',       now(), now()),
  ('eeeeeeee-0000-4000-8000-000000000010','authenticated','authenticated','fixr-c-gerente-susp@fixture.invalid', now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','FIXTURE Conta C','fixture-r-conta-c','account', NULL,'active','active'),
  ('eeeeeeee-0000-4000-8000-000000000002','FIXTURE Loja C', 'fixture-r-loja-c', 'store','eeeeeeee-0000-4000-8000-000000000001','active',NULL),
  ('eeeeeeee-0000-4000-8000-000000000003','FIXTURE Loja C2','fixture-r-loja-c2','store','eeeeeeee-0000-4000-8000-000000000001','active',NULL),
  ('eeeeeeee-0000-4000-8000-000000000004','FIXTURE Conta D','fixture-r-conta-d','account', NULL,'active','active');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('eeeeeeee-0000-4000-8000-0000000000fa','eeeeeeee-0000-4000-8000-00000000000a','eeeeeeee-0000-4000-8000-000000000001','gerente',   NULL,'active',   'FIX','Gerente C',  '2026-01-01 10:00+00'),
  ('eeeeeeee-0000-4000-8000-0000000000fb','eeeeeeee-0000-4000-8000-00000000000b','eeeeeeee-0000-4000-8000-000000000002','gestor',   'eeeeeeee-0000-4000-8000-0000000000fa','active','FIX','Gestor C','2026-01-01 10:01+00'),
  ('eeeeeeee-0000-4000-8000-0000000000fc','eeeeeeee-0000-4000-8000-00000000000c','eeeeeeee-0000-4000-8000-000000000002','atendente','eeeeeeee-0000-4000-8000-0000000000fb','active','FIX','Atendente C','2026-01-01 10:02+00'),
  ('eeeeeeee-0000-4000-8000-0000000000fd','eeeeeeee-0000-4000-8000-00000000000d','eeeeeeee-0000-4000-8000-000000000003','gestor',   'eeeeeeee-0000-4000-8000-0000000000fa','active','FIX','Gestor C2','2026-01-01 10:03+00'),
  ('eeeeeeee-0000-4000-8000-0000000000fe','eeeeeeee-0000-4000-8000-00000000000e','eeeeeeee-0000-4000-8000-000000000004','gestor',    NULL,'active',   'FIX','Gestor D',   '2026-01-01 10:04+00'),
  ('eeeeeeee-0000-4000-8000-0000000000ff','eeeeeeee-0000-4000-8000-00000000000f', NULL,                                 'superadmin',NULL,'active',   'FIX','Super',      '2026-01-01 10:05+00'),
  ('eeeeeeee-0000-4000-8000-0000000000f1','eeeeeeee-0000-4000-8000-000000000010','eeeeeeee-0000-4000-8000-000000000001','gerente',   NULL,'suspended','FIX','Gerente Susp','2026-01-01 10:06+00');

-- As instâncias e o que depende delas ficam em funções, para a fase 2
-- (sabotagem) recomeçar do estado inicial. session_replication_role só pode
-- ser trocado no nível de cima (dentro de função dá 42501 para postgres); o
-- Vault precisa dos triggers de criptografia, então vai numa função separada
-- chamada em modo origin.
CREATE FUNCTION pg_temp.semear() RETURNS void LANGUAGE plpgsql AS $seed$
BEGIN
  -- Instâncias:
  --   M1 Loja C, Meta, COM histórico, registrada (registerPin), saúde e
  --      atribuição preenchidas — o retrato da EncaixaRH.
  --   M2 Loja C, Meta, sem registered_at, config só com o básico.
  --   M3 Conta D, Meta, alheia.
  --   E1 Loja C, Evolution — instance_key numérica para o provider_mismatch.
  INSERT INTO public.whatsapp_instances
    (id, tenant_id, name, instance_key, provider, status, phone_number, profile_name,
     is_active, assigned_profile_id, created_at, updated_at, last_connected_at,
     registered_at, quality_rating, messaging_limit_tier, account_review_status,
     is_restricted, restriction_info, health_updated_at, connection_config)
  VALUES
  ('eeeeeeee-aaaa-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','FIX M1 encaixa','900900000000001','official','disconnected','+55 53 9000-0001','FIX Verified Old',
   false,'eeeeeeee-0000-4000-8000-0000000000fb','2026-06-11 22:42:51+00','2026-06-11 22:42:51+00','2026-06-11 22:42:51+00',
   '2026-06-11 22:42:51+00','GREEN','TIER_1K','APPROVED',
   true,'{"reason":"fixture"}','2026-06-22 20:28:47+00',
   '{"phoneNumberId":"900900000000001","wabaId":"WABA-OLD","graphApiVersion":"v19.0","onboarding":"manual","registerPin":"424242","extra":"keep-me"}'),
  ('eeeeeeee-aaaa-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000002','FIX M2 semreg','900900000000002','official','open',NULL,NULL,
   true,NULL,'2026-09-12 14:55:31+00','2026-09-12 14:55:31+00','2026-09-12 14:55:31+00',
   NULL,NULL,NULL,NULL,
   false,NULL,NULL,
   '{"phoneNumberId":"900900000000002","wabaId":"WABA-T","graphApiVersion":"v20.0"}'),
  ('eeeeeeee-aaaa-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000004','FIX M3 alheia','900900000000003','official','open','+55 53 9000-0003','FIX D',
   true,NULL,'2026-07-01 10:00:00+00','2026-07-01 10:00:00+00','2026-07-01 10:00:00+00',
   '2026-07-01 10:00:00+00',NULL,NULL,NULL,
   false,NULL,NULL,
   '{"phoneNumberId":"900900000000003","wabaId":"WABA-D","graphApiVersion":"v20.0","registerPin":"111111"}'),
  ('eeeeeeee-aaaa-4000-8000-000000000004','eeeeeeee-0000-4000-8000-000000000002','FIX E1 evo','900900000000004','evolution','disconnected',NULL,NULL,
   true,NULL,now(),now(),NULL, NULL,NULL,NULL,NULL,false,NULL,NULL, '{"baseUrl":"https://evo.fixture.invalid"}');

  -- Histórico da M1: 2 contatos, 2 conversas, 4 mensagens, 1 chatbot, 2 sessões.
  INSERT INTO public.contacts (id, tenant_id, whatsapp_instance_id, phone, name) VALUES
  ('eeeeeeee-cccc-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-aaaa-4000-8000-000000000001','5553900000001','FIX c1'),
  ('eeeeeeee-cccc-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-aaaa-4000-8000-000000000001','5553900000002','FIX c2');

  INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id) VALUES
  ('eeeeeeee-dddd-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-cccc-4000-8000-000000000001','eeeeeeee-aaaa-4000-8000-000000000001'),
  ('eeeeeeee-dddd-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-cccc-4000-8000-000000000002','eeeeeeee-aaaa-4000-8000-000000000001');

  INSERT INTO public.messages (id, tenant_id, whatsapp_instance_id, contact_id, conversation_id, direction, message_type, content, status)
  SELECT ('eeeeeeee-eeee-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       'eeeeeeee-0000-4000-8000-000000000002'::uuid, 'eeeeeeee-aaaa-4000-8000-000000000001'::uuid,
       (CASE WHEN n <= 2 THEN 'eeeeeeee-cccc-4000-8000-000000000001' ELSE 'eeeeeeee-cccc-4000-8000-000000000002' END)::uuid,
       (CASE WHEN n <= 2 THEN 'eeeeeeee-dddd-4000-8000-000000000001' ELSE 'eeeeeeee-dddd-4000-8000-000000000002' END)::uuid,
       CASE WHEN n % 2 = 0 THEN 'outbound' ELSE 'inbound' END, 'text', 'FIX msg ' || n, 'received'
  FROM generate_series(1, 4) n;

  INSERT INTO public.chatbots (id, tenant_id, whatsapp_instance_id, name, is_active, is_published, builder_version) VALUES
  ('eeeeeeee-bbbb-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-aaaa-4000-8000-000000000001','FIX bot', true, true, 2);

  INSERT INTO public.chatbot_sessions (id, chatbot_id, contact_id, tenant_id, whatsapp_instance_id, status) VALUES
  ('eeeeeeee-ffff-4000-8000-000000000001','eeeeeeee-bbbb-4000-8000-000000000001','eeeeeeee-cccc-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-aaaa-4000-8000-000000000001','completed'),
  ('eeeeeeee-ffff-4000-8000-000000000002','eeeeeeee-bbbb-4000-8000-000000000001','eeeeeeee-cccc-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-aaaa-4000-8000-000000000001','active');
END;
$seed$;

-- Segredos no Vault para M1, M2 e M3 (o mesmo gesto de set_instance_meta_token).
CREATE FUNCTION pg_temp.semear_vault() RETURNS void LANGUAGE plpgsql AS $seedv$
DECLARE v1 uuid; v2 uuid; v3 uuid;
BEGIN
  v1 := vault.create_secret('FIX-old-token-1', 'meta_token_eeeeeeee-aaaa-4000-8000-000000000001', 'FIXTURE');
  v2 := vault.create_secret('FIX-old-token-2', 'meta_token_eeeeeeee-aaaa-4000-8000-000000000002', 'FIXTURE');
  v3 := vault.create_secret('FIX-old-token-3', 'meta_token_eeeeeeee-aaaa-4000-8000-000000000003', 'FIXTURE');
  INSERT INTO public.instance_secrets (instance_id, tenant_id, vault_secret_id) VALUES
    ('eeeeeeee-aaaa-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002', v1),
    ('eeeeeeee-aaaa-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000002', v2),
    ('eeeeeeee-aaaa-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000004', v3);
END;
$seedv$;

-- Desfaz tudo que as duas semeaduras (e a bateria) criaram.
CREATE FUNCTION pg_temp.limpar() RETURNS void LANGUAGE plpgsql AS $clean$
BEGIN
  DELETE FROM public.messages           WHERE id::text LIKE 'eeeeeeee-%';
  DELETE FROM public.chatbot_sessions   WHERE id::text LIKE 'eeeeeeee-%';
  DELETE FROM public.conversations      WHERE id::text LIKE 'eeeeeeee-%';
  DELETE FROM public.chatbots           WHERE id::text LIKE 'eeeeeeee-%';
  DELETE FROM public.contacts           WHERE id::text LIKE 'eeeeeeee-%';
  DELETE FROM public.instance_secrets   WHERE instance_id IN (SELECT id FROM public.whatsapp_instances WHERE id::text LIKE 'eeeeeeee-%' OR instance_key LIKE '9009%');
  DELETE FROM vault.secrets             WHERE name IN (SELECT 'meta_token_' || id::text FROM public.whatsapp_instances WHERE id::text LIKE 'eeeeeeee-%' OR instance_key LIKE '9009%');
  DELETE FROM public.whatsapp_instances WHERE id::text LIKE 'eeeeeeee-%' OR instance_key LIKE '9009%';
END;
$clean$;

SELECT pg_temp.semear();
SET LOCAL session_replication_role = origin;
SELECT pg_temp.semear_vault();

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _rc_results (
  seq serial, phase text, cenario text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_phase text, p_cenario text, p_check text, p_expected text, p_actual text) RETURNS void
LANGUAGE sql AS $f$
  INSERT INTO _rc_results(phase, cenario, check_kind, expected, actual, status)
  VALUES (p_phase, p_cenario, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;

-- Chama meta_signup_commit como a pessoa p_sub (NULL = sem sessão).
-- Erro vira {ok:false, reason:'ERR <sqlstate>'} — e, como a função é uma
-- transação, um erro dela não deixa nada gravado.
CREATE FUNCTION pg_temp.conectar(
  p_sub uuid, p_pnid text, p_tenant uuid, p_waba text DEFAULT 'WABA-NEW',
  p_name text DEFAULT NULL, p_phone text DEFAULT '+55 53 9000-NEW', p_profile text DEFAULT 'FIX Verified New',
  p_token text DEFAULT 'FIX-new-token', p_graph text DEFAULT 'v20.0'
) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  IF p_sub IS NULL THEN PERFORM set_config('request.jwt.claims', '', true); ELSE PERFORM pg_temp.como(p_sub); END IF;
  r := public.meta_signup_commit(p_pnid, p_tenant, p_waba, p_graph, p_name, p_phone, p_profile, p_token);
  RESET ROLE;
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE, 'message', SQLERRM);
END;
$f$;

-- Chama meta_signup_check direto como authenticated (deve dar 42501).
CREATE FUNCTION pg_temp.check_direto(p_sub uuid, p_pnid text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(p_sub);
  r := public.meta_signup_check(p_pnid, NULL);
  RESET ROLE;
  RETURN 'chamou: ' || coalesce(r->>'reason', r->>'mode');
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'ERR ' || SQLSTATE;
END;
$f$;

-- A LISTA DE PRESERVAÇÃO, como texto: se qualquer um destes mudar, a
-- comparação antes/depois falha e diz qual.
CREATE FUNCTION pg_temp.preservados(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT format('id=%s tenant=%s key=%s registered_at=%s created_at=%s is_active=%s assigned=%s quality=%s tier=%s review=%s restricted=%s restriction=%s health=%s provider=%s pin=%s',
    i.id, i.tenant_id, i.instance_key, i.registered_at, i.created_at, i.is_active, i.assigned_profile_id,
    i.quality_rating, i.messaging_limit_tier, i.account_review_status, i.is_restricted, i.restriction_info,
    i.health_updated_at, i.provider, i.connection_config->>'registerPin')
  FROM public.whatsapp_instances i WHERE i.id = p_id;
$f$;

-- Retrato do histórico + Vault de uma instância.
CREATE FUNCTION pg_temp.retrato(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT format('inst=%s conv=%s msg=%s cont=%s bots=%s sess=%s sec=%s vault=%s',
    (SELECT count(*) FROM public.whatsapp_instances WHERE id = p_id),
    (SELECT count(*) FROM public.conversations WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.messages WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.contacts WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.chatbots WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.chatbot_sessions WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.instance_secrets WHERE instance_id = p_id),
    (SELECT count(*) FROM vault.secrets WHERE name = 'meta_token_' || p_id::text));
$f$;

-- md5 da linha inteira + do segredo (para "byte a byte igual").
CREATE FUNCTION pg_temp.md5_linha(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT md5(row_to_json(i)::text) || '/' ||
         coalesce((SELECT md5(concat(v.id, v.secret, v.nonce::text)) FROM vault.secrets v WHERE v.name = 'meta_token_' || p_id::text), '-')
  FROM public.whatsapp_instances i WHERE i.id = p_id;
$f$;

CREATE FUNCTION pg_temp.token_de(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT ds.decrypted_secret FROM public.instance_secrets s JOIN vault.decrypted_secrets ds ON ds.id = s.vault_secret_id WHERE s.instance_id = p_id;
$f$;

CREATE FUNCTION pg_temp.vault_id_de(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT vault_secret_id::text FROM public.instance_secrets WHERE instance_id = p_id;
$f$;

-- Retrato das instâncias REAIS (tudo que não é fixture), para R9.
CREATE FUNCTION pg_temp.retrato_reais() RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(i.id::text || ':' || pg_temp.retrato(i.id) || ':' || pg_temp.md5_linha(i.id), ' | ' ORDER BY i.id), '-')
    FROM public.whatsapp_instances i WHERE i.id::text NOT LIKE 'eeeeeeee-%' AND i.instance_key NOT LIKE '9009%';
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.bateria(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  GER   CONSTANT uuid := 'eeeeeeee-0000-4000-8000-00000000000a';
  GES   CONSTANT uuid := 'eeeeeeee-0000-4000-8000-00000000000b';
  ATE   CONSTANT uuid := 'eeeeeeee-0000-4000-8000-00000000000c';
  GES2  CONSTANT uuid := 'eeeeeeee-0000-4000-8000-00000000000d';
  GESD  CONSTANT uuid := 'eeeeeeee-0000-4000-8000-00000000000e';
  SUPER CONSTANT uuid := 'eeeeeeee-0000-4000-8000-00000000000f';
  GSUSP CONSTANT uuid := 'eeeeeeee-0000-4000-8000-000000000010';
  CONTA_C CONSTANT uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  LOJA_C  CONSTANT uuid := 'eeeeeeee-0000-4000-8000-000000000002';
  LOJA_C2 CONSTANT uuid := 'eeeeeeee-0000-4000-8000-000000000003';
  CONTA_D CONSTANT uuid := 'eeeeeeee-0000-4000-8000-000000000004';
  M1 CONSTANT uuid := 'eeeeeeee-aaaa-4000-8000-000000000001';
  M2 CONSTANT uuid := 'eeeeeeee-aaaa-4000-8000-000000000002';
  M3 CONSTANT uuid := 'eeeeeeee-aaaa-4000-8000-000000000003';
  E1 CONSTANT uuid := 'eeeeeeee-aaaa-4000-8000-000000000004';
  P1 CONSTANT text := '900900000000001';
  P2 CONSTANT text := '900900000000002';
  P3 CONSTANT text := '900900000000003';
  P4 CONSTANT text := '900900000000004';
  PNEW CONSTANT text := '900900000000099';
  reais_antes text := pg_temp.retrato_reais();
  n_reais_antes bigint := (SELECT count(*) FROM public.whatsapp_instances WHERE id::text NOT LIKE 'eeeeeeee-%' AND instance_key NOT LIKE '9009%');
  antes text; antes_md5 text; antes_pres text; antes_vault text; antes_updated timestamptz;
  r jsonb; row_ record; n bigint; n_vault bigint; new_id uuid;
BEGIN
  -- ============================ R1: reconexão preserva ============================
  antes := pg_temp.retrato(M1);
  antes_pres := pg_temp.preservados(M1);
  antes_vault := pg_temp.vault_id_de(M1);
  r := pg_temp.conectar(GES, P1, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'gestor reconecta M1 → ok', 'true', r->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'mode = reconnect', 'reconnect', r->>'mode');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'access = own_tenant', 'own_tenant', r->>'access');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'MESMO id', M1::text, r->'instance'->>'id');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'lista de preservação igual (id, tenant, key, registered_at, created_at, is_active, assigned, saúde, restrição, provider, registerPin)', antes_pres, pg_temp.preservados(M1));
  SELECT * INTO row_ FROM public.whatsapp_instances WHERE id = M1;
  PERFORM pg_temp.afirma(p_phase, 'R1', 'registerPin ainda 424242', '424242', row_.connection_config->>'registerPin');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'registered_at ainda 2026-06-11', '2026-06-11 22:42:51+00', row_.registered_at::text);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'name sem digitar: mantém', 'FIX M1 encaixa', row_.name);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'status → open', 'open', row_.status);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'last_connected_at → agora', 'true', (row_.last_connected_at > now() - interval '1 minute')::text);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'wabaId → novo', 'WABA-NEW', row_.connection_config->>'wabaId');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'graphApiVersion → v20.0', 'v20.0', row_.connection_config->>'graphApiVersion');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'onboarding → embedded_signup', 'embedded_signup', row_.connection_config->>'onboarding');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'phone_number → o que a Meta devolveu', '+55 53 9000-NEW', row_.phone_number);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'profile_name → o que a Meta devolveu', 'FIX Verified New', row_.profile_name);
  PERFORM pg_temp.afirma(p_phase, 'R1', 'chave extra da config sobrevive ao merge', 'keep-me', row_.connection_config->>'extra');
  PERFORM pg_temp.afirma(p_phase, 'R1', 'token novo no Vault', 'FIX-new-token', pg_temp.token_de(M1));
  PERFORM pg_temp.afirma(p_phase, 'R1', 'MESMO vault_secret_id (atualizado no lugar, sem órfão)', antes_vault, pg_temp.vault_id_de(M1));
  PERFORM pg_temp.afirma(p_phase, 'R1', 'histórico inteiro continua apontando para o id', antes, pg_temp.retrato(M1));
  PERFORM pg_temp.afirma(p_phase, 'R1', 'retrato M1 é o esperado', 'inst=1 conv=2 msg=4 cont=2 bots=1 sess=2 sec=1 vault=1', pg_temp.retrato(M1));
  PERFORM pg_temp.afirma(p_phase, 'R1', 'nenhuma linha nova apareceu', '4',
    (SELECT count(*) FROM public.whatsapp_instances WHERE instance_key LIKE '9009%')::text);

  -- ============================ R2: nome digitado / Meta muda ============================
  r := pg_temp.conectar(GES, P1, LOJA_C, p_name => '  Novo Nome  ', p_phone => NULL, p_profile => NULL, p_token => 'FIX-token-3');
  SELECT * INTO row_ FROM public.whatsapp_instances WHERE id = M1;
  PERFORM pg_temp.afirma(p_phase, 'R2', 'nome digitado → troca (trim)', 'Novo Nome', row_.name);
  PERFORM pg_temp.afirma(p_phase, 'R2', 'Meta sem retorno: phone_number mantém o anterior', '+55 53 9000-NEW', row_.phone_number);
  PERFORM pg_temp.afirma(p_phase, 'R2', 'Meta sem retorno: profile_name mantém o anterior', 'FIX Verified New', row_.profile_name);
  PERFORM pg_temp.afirma(p_phase, 'R2', 'registerPin continua', '424242', row_.connection_config->>'registerPin');
  PERFORM pg_temp.afirma(p_phase, 'R2', 'token trocado de novo', 'FIX-token-3', pg_temp.token_de(M1));
  r := pg_temp.conectar(GES, P1, LOJA_C, p_name => '   ');
  SELECT * INTO row_ FROM public.whatsapp_instances WHERE id = M1;
  PERFORM pg_temp.afirma(p_phase, 'R2', 'nome só com espaços = não digitado', 'Novo Nome', row_.name);

  -- ============================ R3: quem não alcança ============================
  antes_md5 := pg_temp.md5_linha(M1);
  antes := pg_temp.retrato(M1);
  r := pg_temp.conectar(GES2, P1, LOJA_C2);
  PERFORM pg_temp.afirma(p_phase, 'R3', 'gestor da Loja irmã → foreign_instance', 'foreign_instance', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R3', 'mensagem não cita a Loja dona (id)', 'false', (r->>'message' LIKE '%' || LOJA_C::text || '%')::text);
  PERFORM pg_temp.afirma(p_phase, 'R3', 'mensagem não cita a Loja dona (nome)', 'false', (r->>'message' ILIKE '%Loja C%')::text);
  PERFORM pg_temp.afirma(p_phase, 'R3', 'resposta não carrega instance', 'false', (r ? 'instance')::text);
  r := pg_temp.conectar(GESD, P1, CONTA_D);
  PERFORM pg_temp.afirma(p_phase, 'R3', 'gestor de Conta alheia → foreign_instance', 'foreign_instance', r->>'reason');
  r := pg_temp.conectar(GSUSP, P1, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R3', 'gerente SUSPENSO → recusado', 'true', (r->>'ok' = 'false')::text);
  r := pg_temp.conectar(ATE, P1, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R3', 'atendente → forbidden (capability, antes do lookup)', 'forbidden', r->>'reason');
  r := pg_temp.conectar(ATE, PNEW, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R3', 'atendente com número inexistente → a MESMA resposta', 'forbidden', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R3', 'M1 byte a byte igual depois das recusas (linha + Vault)', antes_md5, pg_temp.md5_linha(M1));
  PERFORM pg_temp.afirma(p_phase, 'R3', 'M1 histórico intacto', antes, pg_temp.retrato(M1));

  -- ============================ R4: primeira conexão ============================
  n := (SELECT count(*) FROM public.whatsapp_instances);
  r := pg_temp.conectar(GES, PNEW, LOJA_C, p_name => 'FIX nova');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'gestor conecta número novo na própria Loja → ok', 'true', r->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'mode = connect', 'connect', r->>'mode');
  new_id := (r->'instance'->>'id')::uuid;
  SELECT * INTO row_ FROM public.whatsapp_instances WHERE id = new_id;
  PERFORM pg_temp.afirma(p_phase, 'R4', 'uma linha a mais', (n + 1)::text, (SELECT count(*) FROM public.whatsapp_instances)::text);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'tenant = Loja C', LOJA_C::text, row_.tenant_id::text);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'instance_key = phoneNumberId', PNEW, row_.instance_key);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'provider official, status open', 'official/open', row_.provider || '/' || row_.status);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'config completa', PNEW || '/WABA-NEW/v20.0/embedded_signup',
    (row_.connection_config->>'phoneNumberId') || '/' || (row_.connection_config->>'wabaId') || '/' || (row_.connection_config->>'graphApiVersion') || '/' || (row_.connection_config->>'onboarding'));
  PERFORM pg_temp.afirma(p_phase, 'R4', 'registered_at nasce nulo (o registro é passo da edge function)', '<null>', row_.registered_at::text);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'segredo criado no Vault', 'FIX-new-token', pg_temp.token_de(new_id));
  PERFORM pg_temp.afirma(p_phase, 'R4', 'retrato da nova', 'inst=1 conv=0 msg=0 cont=0 bots=0 sess=0 sec=1 vault=1', pg_temp.retrato(new_id));
  -- nome default = profile_name da Meta; sem Meta, 'Meta <id>'
  r := pg_temp.conectar(GES, '900900000000098', LOJA_C, p_profile => NULL, p_phone => NULL);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'sem nome e sem Meta: "Meta <id>"', 'Meta 900900000000098', r->'instance'->>'name');
  r := pg_temp.conectar(GES, '900900000000097', LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'sem nome, com Meta: nome verificado', 'FIX Verified New', r->'instance'->>'name');
  -- gerente na Loja filha do SELETOR (não na Conta do perfil dele)
  r := pg_temp.conectar(GER, '900900000000096', LOJA_C2);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'gerente conecta na Loja filha escolhida → ok', 'true', r->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'access = gerente_child_store', 'gerente_child_store', r->>'access');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'a linha nasce na Loja C2, não na Conta C', LOJA_C2::text, r->'instance'->>'tenant_id');
  r := pg_temp.conectar(GER, '900900000000095', CONTA_C);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'gerente conecta na própria Conta → own_tenant', 'own_tenant', r->>'access');
  -- recusas da primeira conexão
  n := (SELECT count(*) FROM public.whatsapp_instances);
  r := pg_temp.conectar(GER, '900900000000094', NULL);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'sem Conta de destino → tenant_required', 'tenant_required', r->>'reason');
  r := pg_temp.conectar(GER, '900900000000094', CONTA_D);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'gerente em Conta alheia → forbidden_tenant', 'forbidden_tenant', r->>'reason');
  r := pg_temp.conectar(GES, '900900000000094', LOJA_C2);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'gestor na Loja irmã → forbidden_tenant', 'forbidden_tenant', r->>'reason');
  r := pg_temp.conectar(GES, '900900000000094', 'eeeeeeee-0000-4000-8000-0000000000dd');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'Conta inexistente → a MESMA resposta', 'forbidden_tenant', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R4', 'recusas não criaram linha', n::text, (SELECT count(*) FROM public.whatsapp_instances)::text);
  -- superadmin
  r := pg_temp.conectar(SUPER, '900900000000093', CONTA_D);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'superadmin conecta em qualquer Conta → superadmin', 'superadmin', r->>'access');
  r := pg_temp.conectar(SUPER, '900900000000092', NULL);
  PERFORM pg_temp.afirma(p_phase, 'R4', 'superadmin sem seletor → tenant_required', 'tenant_required', r->>'reason');

  -- ============================ R5: gerente reconecta a Loja filha ============================
  antes_pres := pg_temp.preservados(M1);
  antes := pg_temp.retrato(M1);
  r := pg_temp.conectar(GER, P1, CONTA_C, p_token => 'FIX-token-5');  -- seletor na Conta C, de propósito
  PERFORM pg_temp.afirma(p_phase, 'R5', 'gerente reconecta M1 (Loja filha) → ok', 'true', r->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'R5', 'access = gerente_child_store', 'gerente_child_store', r->>'access');
  PERFORM pg_temp.afirma(p_phase, 'R5', 'a Conta do seletor é ignorada: linha continua na Loja C', LOJA_C::text, r->'instance'->>'tenant_id');
  PERFORM pg_temp.afirma(p_phase, 'R5', 'lista de preservação igual', antes_pres, pg_temp.preservados(M1));
  PERFORM pg_temp.afirma(p_phase, 'R5', 'registerPin ainda 424242', '424242', (SELECT connection_config->>'registerPin' FROM public.whatsapp_instances WHERE id = M1));
  PERFORM pg_temp.afirma(p_phase, 'R5', 'registered_at não zerou', '2026-06-11 22:42:51+00', (SELECT registered_at::text FROM public.whatsapp_instances WHERE id = M1));
  PERFORM pg_temp.afirma(p_phase, 'R5', 'histórico intacto', antes, pg_temp.retrato(M1));
  PERFORM pg_temp.afirma(p_phase, 'R5', 'superadmin reconecta a alheia M3 → superadmin', 'superadmin', (pg_temp.conectar(SUPER, P3, NULL))->>'access');
  -- M2 (nunca registrou): registered_at continua nulo — quem registra é a edge function
  r := pg_temp.conectar(GES, P2, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R5', 'M2 reconecta → mesmo id', M2::text, r->'instance'->>'id');
  PERFORM pg_temp.afirma(p_phase, 'R5', 'M2 registered_at segue nulo (a RPC não registra)', '<null>', r->'instance'->>'registered_at');
  PERFORM pg_temp.afirma(p_phase, 'R5', 'M2 config sem registerPin continua sem', 'false', (r->'instance'->'connection_config' ? 'registerPin')::text);

  -- ============================ R6: as duas colunas discordam ============================
  -- M2: config diz outro número; instance_key ainda é P2 → casa por instance_key.
  UPDATE public.whatsapp_instances SET connection_config = connection_config || '{"phoneNumberId":"900900000000077"}' WHERE id = M2;
  r := pg_temp.conectar(GES, P2, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R6', 'uma linha casando só por instance_key → reconecta ela', M2::text, r->'instance'->>'id');
  PERFORM pg_temp.afirma(p_phase, 'R6', 'config.phoneNumberId regravado com o do diálogo', P2, (SELECT connection_config->>'phoneNumberId' FROM public.whatsapp_instances WHERE id = M2));
  PERFORM pg_temp.afirma(p_phase, 'R6', 'instance_key intacta', P2, (SELECT instance_key FROM public.whatsapp_instances WHERE id = M2));
  -- M2: instance_key diferente; config diz P2 → casa por config.
  UPDATE public.whatsapp_instances SET instance_key = 'fix-chave-antiga' WHERE id = M2;
  r := pg_temp.conectar(GES, P2, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R6', 'uma linha casando só por config → reconecta ela', M2::text, r->'instance'->>'id');
  PERFORM pg_temp.afirma(p_phase, 'R6', 'instance_key NÃO é realinhada (preservada)', 'fix-chave-antiga', (SELECT instance_key FROM public.whatsapp_instances WHERE id = M2));
  -- Duas linhas: M2 casa por config (P2) e M3 passa a casar por instance_key (P2)... M3 é de outra Conta; use E1 (mesma Loja) para isolar o ambiguous.
  UPDATE public.whatsapp_instances SET instance_key = P2 WHERE id = E1;
  antes_md5 := pg_temp.md5_linha(M2);
  r := pg_temp.conectar(GES, P2, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R6', 'duas linhas → ambiguous', 'ambiguous', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R6', 'ambiguous: M2 byte a byte igual', antes_md5, pg_temp.md5_linha(M2));
  UPDATE public.whatsapp_instances SET instance_key = P4 WHERE id = E1;
  UPDATE public.whatsapp_instances SET instance_key = P2 WHERE id = M2;
  -- Identificador de instância Evolution
  r := pg_temp.conectar(GES, P4, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R6', 'identificador de instância Evolution → provider_mismatch', 'provider_mismatch', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R6', 'E1 continua evolution', 'evolution', (SELECT provider FROM public.whatsapp_instances WHERE id = E1));

  -- ============================ R7: falha no meio não apaga nada ============================
  antes_md5 := pg_temp.md5_linha(M1);
  antes := pg_temp.retrato(M1);
  antes_pres := pg_temp.preservados(M1);
  n := (SELECT count(*) FROM public.whatsapp_instances);
  n_vault := (SELECT count(*) FROM vault.secrets WHERE name LIKE 'meta_token_%');
  -- Trigger que explode DEPOIS de a linha ter sido escrita (AFTER INSERT OR
  -- UPDATE), só nas linhas de fixture.
  CREATE FUNCTION pg_temp.explode_fix() RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN
    IF NEW.id::text LIKE 'eeeeeeee-%' OR NEW.instance_key LIKE '9009%' THEN
      RAISE EXCEPTION 'FIXTURE: falha simulada depois da escrita' USING ERRCODE = 'P0099';
    END IF;
    RETURN NEW;
  END;
  $t$;
  CREATE TRIGGER zz_fixture_explode AFTER INSERT OR UPDATE ON public.whatsapp_instances
    FOR EACH ROW EXECUTE FUNCTION pg_temp.explode_fix();
  r := pg_temp.conectar(GES, P1, LOJA_C, p_token => 'FIX-token-never');
  PERFORM pg_temp.afirma(p_phase, 'R7', 'reconexão que explode devolve o erro simulado', 'ERR P0099', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R7', 'M1 byte a byte igual (linha + Vault): nada apagado, nada meio-gravado', antes_md5, pg_temp.md5_linha(M1));
  PERFORM pg_temp.afirma(p_phase, 'R7', 'M1 histórico intacto', antes, pg_temp.retrato(M1));
  PERFORM pg_temp.afirma(p_phase, 'R7', 'M1 preservados intactos', antes_pres, pg_temp.preservados(M1));
  PERFORM pg_temp.afirma(p_phase, 'R7', 'token NÃO virou o novo', 'true', (pg_temp.token_de(M1) <> 'FIX-token-never')::text);
  r := pg_temp.conectar(GES, '900900000000091', LOJA_C, p_token => 'FIX-token-never');
  PERFORM pg_temp.afirma(p_phase, 'R7', 'primeira conexão que explode devolve o erro simulado', 'ERR P0099', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R7', 'zero linha nova', n::text, (SELECT count(*) FROM public.whatsapp_instances)::text);
  PERFORM pg_temp.afirma(p_phase, 'R7', 'zero segredo novo no Vault', n_vault::text, (SELECT count(*) FROM vault.secrets WHERE name LIKE 'meta_token_%')::text);
  DROP TRIGGER zz_fixture_explode ON public.whatsapp_instances;
  DROP FUNCTION pg_temp.explode_fix();
  r := pg_temp.conectar(GES, P1, LOJA_C, p_token => 'FIX-token-7');
  PERFORM pg_temp.afirma(p_phase, 'R7', 'sem a falha, a reconexão conclui', 'reconnect', r->>'mode');

  -- ============================ R8: sessão / entradas ============================
  antes_md5 := pg_temp.md5_linha(M1);
  r := pg_temp.conectar(NULL, P1, LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R8', 'sem sessão → unauthenticated', 'unauthenticated', r->>'reason');
  r := pg_temp.conectar(GES, P1, LOJA_C, p_waba => '');
  PERFORM pg_temp.afirma(p_phase, 'R8', 'wabaId vazio → invalid', 'invalid', r->>'reason');
  r := pg_temp.conectar(GES, P1, LOJA_C, p_token => '');
  PERFORM pg_temp.afirma(p_phase, 'R8', 'token vazio → invalid', 'invalid', r->>'reason');
  r := pg_temp.conectar(GES, 'abc,x.eq.1', LOJA_C);
  PERFORM pg_temp.afirma(p_phase, 'R8', 'phoneNumberId não numérico → invalid', 'invalid', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'R8', 'nada disso tocou M1', antes_md5, pg_temp.md5_linha(M1));
  PERFORM pg_temp.afirma(p_phase, 'R8', 'meta_signup_check direto como authenticated → 42501', 'ERR 42501', pg_temp.check_direto(GES, P1));

  -- ============================ R9: as reais ============================
  PERFORM pg_temp.afirma(p_phase, 'R9', 'instâncias reais: retrato + md5 iguais aos do início', reais_antes, pg_temp.retrato_reais());
  PERFORM pg_temp.afirma(p_phase, 'R9', 'nenhuma instância real sumiu', n_reais_antes::text,
    (SELECT count(*) FROM public.whatsapp_instances WHERE id::text NOT LIKE 'eeeeeeee-%' AND instance_key NOT LIKE '9009%')::text);

  RESET ROLE;
END
$fn$;

-- -----------------------------------------------------------------------------
-- 4. Fase 1 — como está
-- -----------------------------------------------------------------------------
SELECT pg_temp.bateria('1-intacto');

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suíte sabe falhar)
--    A reconexão passa a reconstruir connection_config do zero (some o
--    registerPin) e a zerar registered_at — o que o código antigo faria.
--    Esperado: R1, R2, R5 vermelhos nos checks de registerPin / registered_at /
--    lista de preservação / chave extra; o resto verde. Desfeito pelo ROLLBACK.
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.meta_signup_commit(
--   p_phone_number_id text, p_tenant_id uuid, p_waba_id text, p_graph_api_version text,
--   p_name text, p_phone_number text, p_profile_name text, p_token text)
-- RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $sab$
-- DECLARE v_check jsonb; v_id uuid; v_row record; v_pnid text := nullif(trim(coalesce(p_phone_number_id,'')),'');
-- BEGIN
--   v_check := public.meta_signup_check(v_pnid, p_tenant_id);
--   IF NOT (v_check->>'ok')::boolean THEN RETURN v_check; END IF;
--   IF v_check->>'mode' = 'reconnect' THEN
--     v_id := (v_check->'instance'->>'id')::uuid;
--     UPDATE public.whatsapp_instances SET status='open', last_connected_at=now(), registered_at=NULL,
--       name = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
--       phone_number = coalesce(p_phone_number, phone_number), profile_name = coalesce(p_profile_name, profile_name),
--       connection_config = jsonb_build_object('phoneNumberId', v_pnid, 'wabaId', p_waba_id, 'graphApiVersion', p_graph_api_version, 'onboarding', 'embedded_signup')
--     WHERE id = v_id;
--   ELSE
--     INSERT INTO public.whatsapp_instances (tenant_id, name, instance_key, provider, status, phone_number, profile_name, last_connected_at, connection_config)
--     VALUES ((v_check->>'tenant_id')::uuid, coalesce(nullif(trim(coalesce(p_name,'')),''), p_profile_name, 'Meta '||v_pnid), v_pnid, 'official', 'open', p_phone_number, p_profile_name, now(),
--       jsonb_build_object('phoneNumberId', v_pnid, 'wabaId', p_waba_id, 'graphApiVersion', p_graph_api_version, 'onboarding', 'embedded_signup'))
--     RETURNING id INTO v_id;
--   END IF;
--   PERFORM public.set_instance_meta_token(v_id, p_token);
--   SELECT i.id, i.tenant_id, i.name, i.instance_key, i.status, i.provider, i.phone_number, i.profile_name, i.registered_at, i.connection_config INTO v_row FROM public.whatsapp_instances i WHERE i.id = v_id;
--   RETURN jsonb_build_object('ok', true, 'mode', v_check->>'mode', 'access', v_check->>'access',
--     'instance', jsonb_build_object('id', v_row.id, 'tenant_id', v_row.tenant_id, 'name', v_row.name, 'instance_key', v_row.instance_key, 'status', v_row.status, 'provider', v_row.provider, 'phone_number', v_row.phone_number, 'profile_name', v_row.profile_name, 'registered_at', v_row.registered_at, 'connection_config', v_row.connection_config));
-- END $sab$;
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
FROM _rc_results GROUP BY phase ORDER BY phase;

ROLLBACK;
