-- =============================================================================
-- teste_conexao_instagram.sql — rede de segurança da fatia 4b do Instagram
-- (migração 20260925000003: conectar / reconectar / desligar pela tela).
--
-- O QUE FAZ
--   Semeia uma organização falsa:
--     Conta A (gerente GA) → Loja A1 (gestor GS1, atendente AT1, LIBERADA)
--                          → Loja A2 (gestor GS2, NÃO liberada)
--     Conta B              → Loja B1 (gestor GSB, NÃO liberada)
--     superadmin SU
--   Instâncias: IG1 (Instagram, Loja A1, @fix_a, com histórico e renovação em
--   needs_reconnect), IG2 (Instagram, Loja B1, @fix_b), W1 (WhatsApp oficial,
--   Loja A1). E afirma, com os mesmos papéis e chamadas que a tela e a edge
--   function usam (authenticated para o que é do app, service_role para o que é
--   do servidor):
--
--   L   Só Loja: begin na Conta → not_store; o superadmin não libera Conta;
--       commit de um state forjado para a Conta (até com chave forçada) →
--       not_store, nada criado.
--   N   Conectar conta nova: gestor na Loja dele, gerente na Loja filha,
--       superadmin. Linha nova completa, token no Vault, validade = agora +
--       expires_in, state gravado.
--   R   Reconectar NO LUGAR: pelo cartão e sem o cartão (conta já da Loja).
--       Mesmo id, mesmo tenant, mesma chave, mesmo nome, mesmo created_at, mesmo
--       segredo do Vault com valor novo, renovação zerada, histórico intacto;
--       desligada continua desligada; sem expires_in = 60 dias.
--   F   Conta já de outra Conta/Loja → foreign_account, mensagem sem nome nem
--       id de ninguém, linha e Vault da outra byte a byte iguais. Gestor alheio
--       não inicia nada em instância/Loja que não alcança.
--   W   Reconectar o cartão de @fix_a entrando como outra conta →
--       wrong_account, nada muda.
--   S   O state: inventado, de outro usuário, reusado, vencido, malformado,
--       commit sem claim, commit duas vezes, queimado há mais de 15 min, as
--       funções de servidor fechadas para o app, bounce só com state vivo,
--       identidade devolvida depois do check/commit, e o valor nunca guardado
--       em claro.
--   O   Desligar e religar: gestor, gerente na filha, com a chave desligada;
--       atendente e alheio recusados; WhatsApp não é afetado; histórico e
--       Vault intactos.
--   E   A chave: só o superadmin liga/desliga; o app não escreve nem lê a
--       tabela direto; instagram_connect_enabled por cargo e Loja; begin e
--       commit recusam com a chave desligada; e o texto do sino aponta para o
--       botão só onde a chave está ligada (sem ela, o texto antigo, igual).
--   Z   Instâncias REAIS e EncaixaRH iguais no fim; EncaixaRH sem a chave.
--
-- SEGURANÇA — roda contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo f4b4f4b4-,
--   igAccountIds de fixture começando com 91700000. Guarda de colisão antes de
--   semear. Segredos do Vault e notificações morrem no ROLLBACK.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita), o arquivo inteiro de uma
--   vez. O placar sai no fim.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM da seção 5: o claim passa a ignorar o VALOR do
--   state e aceita o primeiro state pendente do usuário — um state inventado
--   passa. Medido em 2026-09-25 contra produção: fase 1 = 140/140; fase 2 =
--   8 FAIL, a primeira "S1 state inventado / ok [esperado false, obtido
--   true]" (tabela em docs/RUNBOOK_instagram_conectar.md); o resto verde.
-- =============================================================================

BEGIN;

ALTER TABLE public.contacts ENABLE ALWAYS TRIGGER trg_contacts_set_external_id;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'f4b4f4b4-%')
  OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'f4b4f4b4-%')
  OR EXISTS (SELECT 1 FROM public.whatsapp_instances
              WHERE id::text LIKE 'f4b4f4b4-%' OR instance_key LIKE 'instagram_91700000%'
                 OR connection_config->>'igAccountId' LIKE '91700000%') THEN
    RAISE EXCEPTION 'ABORTADO: fixture colide com dado real. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.instagram_connect_commit(uuid,uuid,text,text,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260925000003 ainda não foi aplicada.';
  END IF;
END
$guard$;

-- Retrato das instâncias reais ANTES (para Z).
CREATE TEMP TABLE _cx_antes ON COMMIT DROP AS
SELECT md5(coalesce(string_agg(w::text, '|' ORDER BY w.id), '')) AS inst,
       (SELECT count(*) FROM public.instagram_connect_stores) AS chaves
  FROM public.whatsapp_instances w;

-- -----------------------------------------------------------------------------
-- 1. Semeadura
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('f4b4f4b4-0000-4000-8000-00000000000a','authenticated','authenticated','fx4b-ga@fixture.invalid',  now(), now()),
  ('f4b4f4b4-0000-4000-8000-00000000000b','authenticated','authenticated','fx4b-gs1@fixture.invalid', now(), now()),
  ('f4b4f4b4-0000-4000-8000-00000000000c','authenticated','authenticated','fx4b-at1@fixture.invalid', now(), now()),
  ('f4b4f4b4-0000-4000-8000-00000000000d','authenticated','authenticated','fx4b-gs2@fixture.invalid', now(), now()),
  ('f4b4f4b4-0000-4000-8000-00000000000e','authenticated','authenticated','fx4b-gsb@fixture.invalid', now(), now()),
  ('f4b4f4b4-0000-4000-8000-00000000000f','authenticated','authenticated','fx4b-su@fixture.invalid',  now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('f4b4f4b4-0000-4000-8000-000000000001','FIXTURE 4b Conta A','fixture-4b-conta-a','account', NULL,'active','active'),
  ('f4b4f4b4-0000-4000-8000-000000000002','FIXTURE 4b Loja A1','fixture-4b-loja-a1','store','f4b4f4b4-0000-4000-8000-000000000001','active',NULL),
  ('f4b4f4b4-0000-4000-8000-000000000003','FIXTURE 4b Loja A2','fixture-4b-loja-a2','store','f4b4f4b4-0000-4000-8000-000000000001','active',NULL),
  ('f4b4f4b4-0000-4000-8000-000000000004','FIXTURE 4b Conta B','fixture-4b-conta-b','account', NULL,'active','active'),
  ('f4b4f4b4-0000-4000-8000-000000000005','FIXTURE 4b Loja B1 Segredo','fixture-4b-loja-b1','store','f4b4f4b4-0000-4000-8000-000000000004','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('f4b4f4b4-0000-4000-8000-0000000000fa','f4b4f4b4-0000-4000-8000-00000000000a','f4b4f4b4-0000-4000-8000-000000000001','gerente',   NULL,'active','FIX','GA', now()),
  ('f4b4f4b4-0000-4000-8000-0000000000fb','f4b4f4b4-0000-4000-8000-00000000000b','f4b4f4b4-0000-4000-8000-000000000002','gestor',   'f4b4f4b4-0000-4000-8000-0000000000fa','active','FIX','GS1', now()),
  ('f4b4f4b4-0000-4000-8000-0000000000fc','f4b4f4b4-0000-4000-8000-00000000000c','f4b4f4b4-0000-4000-8000-000000000002','atendente','f4b4f4b4-0000-4000-8000-0000000000fb','active','FIX','AT1', now()),
  ('f4b4f4b4-0000-4000-8000-0000000000fd','f4b4f4b4-0000-4000-8000-00000000000d','f4b4f4b4-0000-4000-8000-000000000003','gestor',   'f4b4f4b4-0000-4000-8000-0000000000fa','active','FIX','GS2', now()),
  ('f4b4f4b4-0000-4000-8000-0000000000fe','f4b4f4b4-0000-4000-8000-00000000000e','f4b4f4b4-0000-4000-8000-000000000005','gestor',    NULL,'active','FIX','GSB', now()),
  ('f4b4f4b4-0000-4000-8000-0000000000ff','f4b4f4b4-0000-4000-8000-00000000000f', NULL,                                 'superadmin',NULL,'active','FIX','SU', now());

CREATE FUNCTION pg_temp.semear() RETURNS void LANGUAGE plpgsql AS $seed$
BEGIN
  INSERT INTO public.whatsapp_instances
    (id, tenant_id, name, instance_key, provider, status, is_active, profile_name, created_at, updated_at, connection_config)
  VALUES
  ('f4b4f4b4-aaaa-4000-8000-000000000001','f4b4f4b4-0000-4000-8000-000000000002','FIX IG1 nome dado','instagram_9170000000001','instagram','connected',true,'@fix_a',
   '2026-09-01 10:00+00','2026-09-01 10:00+00',
   '{"igAccountId":"9170000000001","igUsername":"fix_a","tokenIssuedAt":"2026-09-01T10:00:00+00:00","tokenExpiresAt":"2026-10-31T10:00:00+00:00","extra":"fica",
     "renewal":{"status":"needs_reconnect","forTokenIssuedAt":"2026-09-01T10:00:00+00:00","reason":"token_invalid","message":"O Instagram não aceita mais o acesso atual desta conta."}}'),
  ('f4b4f4b4-aaaa-4000-8000-000000000002','f4b4f4b4-0000-4000-8000-000000000005','FIX IG2 alheia','instagram_9170000000002','instagram','connected',true,'@fix_b',
   '2026-09-02 10:00+00','2026-09-02 10:00+00',
   '{"igAccountId":"9170000000002","igUsername":"fix_b","tokenIssuedAt":"2026-09-02T10:00:00+00:00","tokenExpiresAt":"2026-11-01T10:00:00+00:00"}'),
  ('f4b4f4b4-aaaa-4000-8000-000000000003','f4b4f4b4-0000-4000-8000-000000000002','FIX W1 whatsapp','917000000000303','official','open',true,NULL,
   now(), now(), '{"phoneNumberId":"917000000000303"}');

  INSERT INTO public.contacts (id, tenant_id, whatsapp_instance_id, phone, name, channel, external_id) VALUES
  ('f4b4f4b4-cccc-4000-8000-000000000001','f4b4f4b4-0000-4000-8000-000000000002','f4b4f4b4-aaaa-4000-8000-000000000001',NULL,'FIX cliente ig','instagram','fx-igsid-1');
  INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, channel) VALUES
  ('f4b4f4b4-dddd-4000-8000-000000000001','f4b4f4b4-0000-4000-8000-000000000002','f4b4f4b4-cccc-4000-8000-000000000001','f4b4f4b4-aaaa-4000-8000-000000000001','instagram');
  INSERT INTO public.messages (id, tenant_id, whatsapp_instance_id, contact_id, conversation_id, direction, message_type, content, status, channel)
  SELECT ('f4b4f4b4-eeee-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
         'f4b4f4b4-0000-4000-8000-000000000002'::uuid, 'f4b4f4b4-aaaa-4000-8000-000000000001'::uuid,
         'f4b4f4b4-cccc-4000-8000-000000000001'::uuid, 'f4b4f4b4-dddd-4000-8000-000000000001'::uuid,
         CASE WHEN n % 2 = 0 THEN 'outbound' ELSE 'inbound' END, 'text', 'FIX ig ' || n, 'received', 'instagram'
    FROM generate_series(1, 3) n;

  -- Chave: só a Loja A1.
  INSERT INTO public.instagram_connect_stores (tenant_id, note) VALUES ('f4b4f4b4-0000-4000-8000-000000000002', 'FIXTURE');
END;
$seed$;

CREATE FUNCTION pg_temp.semear_vault() RETURNS void LANGUAGE plpgsql AS $seedv$
BEGIN
  PERFORM public.set_instance_meta_token('f4b4f4b4-aaaa-4000-8000-000000000001', 'FIX-old-ig1');
  PERFORM public.set_instance_meta_token('f4b4f4b4-aaaa-4000-8000-000000000002', 'FIX-old-ig2');
END;
$seedv$;

CREATE FUNCTION pg_temp.limpar() RETURNS void LANGUAGE plpgsql AS $clean$
BEGIN
  DELETE FROM public.notifications          WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM public.instagram_connection_alerts WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM public.instagram_oauth_states WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM public.instagram_connect_stores WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM public.messages               WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM public.conversations          WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM public.contacts               WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM vault.secrets WHERE name IN (SELECT 'meta_token_' || id::text FROM public.whatsapp_instances WHERE tenant_id::text LIKE 'f4b4f4b4-%');
  DELETE FROM public.instance_secrets       WHERE tenant_id::text LIKE 'f4b4f4b4-%';
  DELETE FROM public.whatsapp_instances     WHERE tenant_id::text LIKE 'f4b4f4b4-%';
END;
$clean$;

SELECT pg_temp.semear();
SET LOCAL session_replication_role = origin;
SELECT pg_temp.semear_vault();

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _cx_results (
  seq serial, phase text, cenario text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_phase text, p_cenario text, p_check text, p_expected text, p_actual text) RETURNS void
LANGUAGE sql AS $f$
  INSERT INTO _cx_results(phase, cenario, check_kind, expected, actual, status)
  VALUES (p_phase, p_cenario, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', '', true);
$f$;

-- O que o PostgREST põe quando a edge function chama com a service role.
CREATE FUNCTION pg_temp.como_servidor() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('request.jwt.claim.sub', '', true);
$f$;

CREATE FUNCTION pg_temp.u_begin(p_sub uuid, p_tenant uuid, p_inst uuid,
  p_redirect text DEFAULT 'https://fixture.supabase.co/functions/v1/instagram-connect',
  p_return text DEFAULT 'http://localhost:8081/dashboard/whatsapp-numbers') RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  IF p_sub IS NULL THEN PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  ELSE PERFORM pg_temp.como(p_sub); END IF;
  r := public.instagram_connect_begin(p_tenant, p_inst, p_redirect, p_return);
  RESET ROLE;
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE, 'message', SQLERRM);
END;
$f$;

CREATE FUNCTION pg_temp.u_enabled(p_sub uuid, p_tenant uuid) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r boolean;
BEGIN
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(p_sub);
  r := public.instagram_connect_enabled(p_tenant);
  RESET ROLE; RETURN r::text;
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN 'ERR ' || SQLSTATE;
END;
$f$;

CREATE FUNCTION pg_temp.u_set_enabled(p_sub uuid, p_tenant uuid, p_on boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(p_sub);
  r := public.set_instagram_connect_enabled(p_tenant, p_on);
  RESET ROLE; RETURN r;
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE);
END;
$f$;

CREATE FUNCTION pg_temp.u_active(p_sub uuid, p_inst uuid, p_on boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(p_sub);
  r := public.set_instagram_account_active(p_inst, p_on);
  RESET ROLE; RETURN r;
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE);
END;
$f$;

-- O app tentando o que é do servidor, ou a tabela direto.
CREATE FUNCTION pg_temp.u_direto(p_sub uuid, p_what text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(p_sub);
  CASE p_what
    WHEN 'claim'  THEN PERFORM public.instagram_connect_claim(repeat('a', 64), p_sub);
    WHEN 'check'  THEN PERFORM public.instagram_connect_check(gen_random_uuid(), p_sub, '9170000000001');
    WHEN 'commit' THEN PERFORM public.instagram_connect_commit(gen_random_uuid(), p_sub, '9170000000001', 'x', 'tok', 100);
    WHEN 'bounce' THEN PERFORM public.instagram_connect_bounce(repeat('a', 64));
    WHEN 'act_as' THEN PERFORM public.instagram_connect_act_as(p_sub);
    WHEN 'insert_chave' THEN INSERT INTO public.instagram_connect_stores (tenant_id) VALUES ('f4b4f4b4-0000-4000-8000-000000000003');
    WHEN 'delete_chave' THEN DELETE FROM public.instagram_connect_stores WHERE tenant_id = 'f4b4f4b4-0000-4000-8000-000000000002';
    WHEN 'select_chave' THEN SELECT count(*) INTO n FROM public.instagram_connect_stores WHERE tenant_id::text LIKE 'f4b4f4b4-%';
                              RESET ROLE; RETURN 'leu ' || n;
    WHEN 'select_states' THEN SELECT count(*) INTO n FROM public.instagram_oauth_states;
                              RESET ROLE; RETURN 'leu ' || n;
  END CASE;
  RESET ROLE; RETURN 'chamou';
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN 'ERR ' || SQLSTATE;
END;
$f$;

CREATE FUNCTION pg_temp.s_claim(p_state text, p_user uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE service_role; PERFORM pg_temp.como_servidor();
  r := public.instagram_connect_claim(p_state, p_user);
  RESET ROLE; RETURN r;
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE, 'message', SQLERRM);
END;
$f$;

CREATE FUNCTION pg_temp.s_check(p_state_id uuid, p_user uuid, p_ig text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE service_role; PERFORM pg_temp.como_servidor();
  r := public.instagram_connect_check(p_state_id, p_user, p_ig);
  r := r || jsonb_build_object('_claims_depois', current_setting('request.jwt.claims', true));
  RESET ROLE; RETURN r;
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE, 'message', SQLERRM);
END;
$f$;

CREATE FUNCTION pg_temp.s_commit(p_state_id uuid, p_user uuid, p_ig text, p_username text, p_token text, p_exp integer) RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE service_role; PERFORM pg_temp.como_servidor();
  r := public.instagram_connect_commit(p_state_id, p_user, p_ig, p_username, p_token, p_exp);
  r := r || jsonb_build_object('_claims_depois', current_setting('request.jwt.claims', true));
  RESET ROLE; RETURN r;
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN jsonb_build_object('ok', false, 'reason', 'ERR ' || SQLSTATE, 'message', SQLERRM);
END;
$f$;

CREATE FUNCTION pg_temp.s_bounce(p_state text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r text;
BEGIN
  SET LOCAL ROLE service_role; PERFORM pg_temp.como_servidor();
  r := public.instagram_connect_bounce(p_state);
  RESET ROLE; RETURN coalesce(r, '<null>');
EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN 'ERR ' || SQLSTATE;
END;
$f$;

-- O fluxo inteiro, na ordem da edge function: begin → claim → check → commit.
CREATE FUNCTION pg_temp.fluxo(p_sub uuid, p_tenant uuid, p_inst uuid, p_ig text, p_user text, p_token text, p_exp integer) RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE b jsonb; c jsonb; k jsonb;
BEGIN
  b := pg_temp.u_begin(p_sub, p_tenant, p_inst);
  IF NOT coalesce((b->>'ok')::boolean, false) THEN RETURN b || '{"_etapa":"begin"}'; END IF;
  c := pg_temp.s_claim(b->>'state', p_sub);
  IF NOT coalesce((c->>'ok')::boolean, false) THEN RETURN c || '{"_etapa":"claim"}'; END IF;
  k := pg_temp.s_check((c->>'state_id')::uuid, p_sub, p_ig);
  IF NOT coalesce((k->>'ok')::boolean, false) THEN RETURN k || jsonb_build_object('_etapa', 'check', 'state_id', c->>'state_id'); END IF;
  RETURN pg_temp.s_commit((c->>'state_id')::uuid, p_sub, p_ig, p_user, p_token, p_exp)
         || jsonb_build_object('_etapa', 'commit', 'state_id', c->>'state_id');
END;
$f$;

CREATE FUNCTION pg_temp.token_de(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT ds.decrypted_secret FROM public.instance_secrets s JOIN vault.decrypted_secrets ds ON ds.id = s.vault_secret_id WHERE s.instance_id = p_id;
$f$;
CREATE FUNCTION pg_temp.vault_id_de(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT vault_secret_id::text FROM public.instance_secrets WHERE instance_id = p_id;
$f$;
CREATE FUNCTION pg_temp.md5_linha(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT md5(row_to_json(i)::text) || '/' ||
         coalesce((SELECT md5(concat(v.id, v.secret, v.nonce::text)) FROM vault.secrets v WHERE v.name = 'meta_token_' || p_id::text), '-')
  FROM public.whatsapp_instances i WHERE i.id = p_id;
$f$;
CREATE FUNCTION pg_temp.historico(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT format('conv=%s msg=%s cont=%s',
    (SELECT count(*) FROM public.conversations WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.messages WHERE whatsapp_instance_id = p_id),
    (SELECT count(*) FROM public.contacts WHERE whatsapp_instance_id = p_id));
$f$;
CREATE FUNCTION pg_temp.n_ig() RETURNS text LANGUAGE sql AS $f$
  SELECT count(*)::text FROM public.whatsapp_instances WHERE tenant_id::text LIKE 'f4b4f4b4-%' AND provider = 'instagram';
$f$;
-- "agora + N segundos" dentro de 5 s, como texto sim/não.
CREATE FUNCTION pg_temp.perto(p_ts text, p_secs integer) RETURNS text LANGUAGE sql AS $f$
  SELECT CASE WHEN abs(extract(epoch FROM (p_ts::timestamptz - (now() + make_interval(secs => p_secs))))) < 5
              THEN 'sim' ELSE 'não: ' || coalesce(p_ts, '<null>') END;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.bateria(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  GA   CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-00000000000a';
  GS1  CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-00000000000b';
  AT1  CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-00000000000c';
  GS2  CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-00000000000d';
  GSB  CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-00000000000e';
  SU   CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-00000000000f';
  CONTA_A CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-000000000001';
  A1   CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-000000000002';
  A2   CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-000000000003';
  B1   CONSTANT uuid := 'f4b4f4b4-0000-4000-8000-000000000005';
  IG1  CONSTANT uuid := 'f4b4f4b4-aaaa-4000-8000-000000000001';
  IG2  CONSTANT uuid := 'f4b4f4b4-aaaa-4000-8000-000000000002';
  W1   CONSTANT uuid := 'f4b4f4b4-aaaa-4000-8000-000000000003';
  SERV CONSTANT text := '{"role":"service_role"}';
  r jsonb; b jsonb; c jsonb; k jsonb;
  v_n text; v_md5 text; v_md5b text; v_vid text; v_row record; v_id uuid; v_state_id uuid;
  v_forjado text;
BEGIN
  -- ========================= E — a chave =========================
  PERFORM pg_temp.afirma(p_phase, 'E1 gestor liga a chave', 'reason', 'forbidden', pg_temp.u_set_enabled(GS1, A2, true)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E1 gerente liga a chave', 'reason', 'forbidden', pg_temp.u_set_enabled(GA, A2, true)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E1 nada ligado por eles', 'A2 na tabela', '0',
    (SELECT count(*)::text FROM public.instagram_connect_stores WHERE tenant_id = A2));
  r := pg_temp.u_set_enabled(SU, A2, true);
  PERFORM pg_temp.afirma(p_phase, 'E2 superadmin liga A2', 'ok', 'true', r->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'E2 superadmin liga A2', 'enabled_by', SU::text,
    (SELECT enabled_by::text FROM public.instagram_connect_stores WHERE tenant_id = A2));
  PERFORM pg_temp.afirma(p_phase, 'E2 idempotente', 'ok', 'true', pg_temp.u_set_enabled(SU, A2, true)->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'E2 superadmin desliga A2', 'ok', 'true', pg_temp.u_set_enabled(SU, A2, false)->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'E2 desligada', 'A2 na tabela', '0',
    (SELECT count(*)::text FROM public.instagram_connect_stores WHERE tenant_id = A2));
  PERFORM pg_temp.afirma(p_phase, 'E3 enabled gestor A1', 'enabled', 'true',  pg_temp.u_enabled(GS1, A1));
  PERFORM pg_temp.afirma(p_phase, 'E3 enabled gerente A1 (filha)', 'enabled', 'true', pg_temp.u_enabled(GA, A1));
  PERFORM pg_temp.afirma(p_phase, 'E3 enabled superadmin A1', 'enabled', 'true', pg_temp.u_enabled(SU, A1));
  PERFORM pg_temp.afirma(p_phase, 'E3 enabled atendente A1', 'enabled', 'false', pg_temp.u_enabled(AT1, A1));
  PERFORM pg_temp.afirma(p_phase, 'E3 enabled gestor A2 (sem chave)', 'enabled', 'false', pg_temp.u_enabled(GS2, A2));
  PERFORM pg_temp.afirma(p_phase, 'E3 enabled gestor alheio em A1', 'enabled', 'false', pg_temp.u_enabled(GSB, A1));
  PERFORM pg_temp.afirma(p_phase, 'E3 enabled gerente na Conta', 'enabled', 'false', pg_temp.u_enabled(GA, CONTA_A));
  PERFORM pg_temp.afirma(p_phase, 'E4 begin sem chave', 'reason', 'not_enabled', pg_temp.u_begin(GS2, A2, NULL)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E6 app insere chave direto', 'erro', 'ERR 42501', pg_temp.u_direto(GS1, 'insert_chave'));
  PERFORM pg_temp.afirma(p_phase, 'E6 app apaga chave direto', 'erro', 'ERR 42501', pg_temp.u_direto(GS1, 'delete_chave'));
  PERFORM pg_temp.afirma(p_phase, 'E6 gestor lê a tabela', 'linhas', 'leu 0', pg_temp.u_direto(GS1, 'select_chave'));
  PERFORM pg_temp.afirma(p_phase, 'E6 superadmin lê a tabela', 'linhas', 'leu 1', pg_temp.u_direto(SU, 'select_chave'));
  PERFORM pg_temp.afirma(p_phase, 'E6 app lê os states', 'erro', 'ERR 42501', pg_temp.u_direto(SU, 'select_states'));

  -- ========================= L — só Loja =========================
  PERFORM pg_temp.afirma(p_phase, 'L1 begin na Conta', 'reason', 'not_store', pg_temp.u_begin(GA, CONTA_A, NULL)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'L2 superadmin libera Conta', 'reason', 'not_store', pg_temp.u_set_enabled(SU, CONTA_A, true)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'L2 Conta fora da tabela', 'linhas', '0',
    (SELECT count(*)::text FROM public.instagram_connect_stores WHERE tenant_id = CONTA_A));
  -- State forjado direto no banco para a Conta, com a chave forçada: o commit
  -- ainda recusa por não ser Loja.
  INSERT INTO public.instagram_connect_stores (tenant_id, note) VALUES (CONTA_A, 'FORÇADA');
  INSERT INTO public.instagram_oauth_states (state_hash, user_id, tenant_id, redirect_uri, return_to, expires_at, claimed_at)
  VALUES (md5(random()::text) || md5(random()::text), GA, CONTA_A, 'https://x', 'https://y', now() + interval '10 min', now())
  RETURNING id INTO v_state_id;
  r := pg_temp.s_commit(v_state_id, GA, '9170000000050', 'fix_conta', 'tok', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'L3 commit na Conta', 'reason', 'not_store', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'L3 nada criado', 'linhas da Conta', '0',
    (SELECT count(*)::text FROM public.whatsapp_instances WHERE tenant_id = CONTA_A));
  DELETE FROM public.instagram_connect_stores WHERE tenant_id = CONTA_A;

  -- ========================= S — o state =========================
  PERFORM pg_temp.afirma(p_phase, 'S0 begin sem sessão', 'reason', 'unauthenticated', pg_temp.u_begin(NULL, A1, NULL)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S0 begin atendente', 'reason', 'forbidden', pg_temp.u_begin(AT1, A1, NULL)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S0 begin retorno inválido', 'reason', 'invalid_redirect',
    pg_temp.u_begin(GS1, A1, NULL, 'https://ok.example/cb', 'javascript:alert(1)')->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S0 begin redirect sem https', 'reason', 'invalid_redirect',
    pg_temp.u_begin(GS1, A1, NULL, 'http://ok.example/cb')->>'reason');

  b := pg_temp.u_begin(GS1, A1, NULL);
  PERFORM pg_temp.afirma(p_phase, 'S1 begin gestor', 'ok', 'true', b->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'S1 state tem 64 hex', 'formato', 'true', ((b->>'state') ~ '^[0-9a-f]{64}$')::text);
  PERFORM pg_temp.afirma(p_phase, 'S12 valor não fica em claro', 'linhas com o valor', '0',
    (SELECT count(*)::text FROM public.instagram_oauth_states WHERE state_hash = b->>'state'));
  PERFORM pg_temp.afirma(p_phase, 'S9 bounce com state vivo', 'return_to', 'http://localhost:8081/dashboard/whatsapp-numbers',
    pg_temp.s_bounce(b->>'state'));
  -- State inventado, com um state LEGÍTIMO pendente do mesmo usuário (b).
  v_forjado := encode(extensions.gen_random_bytes(32), 'hex');
  r := pg_temp.s_claim(v_forjado, GS1);
  PERFORM pg_temp.afirma(p_phase, 'S1 state inventado', 'reason', 'invalid_state', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S1 state inventado', 'ok', 'false', coalesce(r->>'ok', '<null>'));
  PERFORM pg_temp.afirma(p_phase, 'S9 bounce com state inventado', 'return_to', '<null>', pg_temp.s_bounce(v_forjado));
  PERFORM pg_temp.afirma(p_phase, 'S7 state malformado', 'reason', 'invalid_state', pg_temp.s_claim('não-é-hex', GS1)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S7 state vazio', 'reason', 'invalid_state', pg_temp.s_claim(NULL, GS1)->>'reason');
  -- De outro usuário: recusa e NÃO queima.
  PERFORM pg_temp.afirma(p_phase, 'S2 state de outro usuário', 'reason', 'invalid_state', pg_temp.s_claim(b->>'state', GA)->>'reason');
  c := pg_temp.s_claim(b->>'state', GS1);
  PERFORM pg_temp.afirma(p_phase, 'S2 dono ainda usa depois', 'ok', 'true', c->>'ok');
  PERFORM pg_temp.afirma(p_phase, 'S2 claim devolve a Loja', 'tenant_id', A1::text, c->>'tenant_id');
  PERFORM pg_temp.afirma(p_phase, 'S3 reuso', 'reason', 'used_state', pg_temp.s_claim(b->>'state', GS1)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S9 bounce depois do claim', 'return_to', '<null>', pg_temp.s_bounce(b->>'state'));
  -- check devolve a identidade de antes.
  k := pg_temp.s_check((c->>'state_id')::uuid, GS1, '9170000000099');
  PERFORM pg_temp.afirma(p_phase, 'S11 check devolve identidade', 'claims depois', SERV, k->>'_claims_depois');
  PERFORM pg_temp.afirma(p_phase, 'S11 check aceita conta nova', 'mode', 'connect', k->>'mode');
  -- check só lê: nada gravado.
  PERFORM pg_temp.afirma(p_phase, 'S11 check não grava', 'linhas 9170000000099', '0',
    (SELECT count(*)::text FROM public.whatsapp_instances WHERE connection_config->>'igAccountId' = '9170000000099'));
  -- check/commit com usuário diferente do state.
  PERFORM pg_temp.afirma(p_phase, 'S2 check com outro usuário', 'reason', 'invalid_state',
    pg_temp.s_check((c->>'state_id')::uuid, GA, '9170000000099')->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S2 commit com outro usuário', 'reason', 'invalid_state',
    pg_temp.s_commit((c->>'state_id')::uuid, GA, '9170000000099', 'x', 'tok', 100)->>'reason');
  -- Vencido.
  b := pg_temp.u_begin(GS1, A1, NULL);
  UPDATE public.instagram_oauth_states SET expires_at = now() - interval '1 second'
   WHERE state_hash = encode(sha256(convert_to(b->>'state', 'UTF8')), 'hex');
  PERFORM pg_temp.afirma(p_phase, 'S9 bounce vencido', 'return_to', '<null>', pg_temp.s_bounce(b->>'state'));
  PERFORM pg_temp.afirma(p_phase, 'S4 state vencido', 'reason', 'expired_state', pg_temp.s_claim(b->>'state', GS1)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S4 vencido queima', 'reason', 'used_state', pg_temp.s_claim(b->>'state', GS1)->>'reason');
  -- Commit sem claim.
  b := pg_temp.u_begin(GS1, A1, NULL);
  SELECT id INTO v_state_id FROM public.instagram_oauth_states WHERE state_hash = encode(sha256(convert_to(b->>'state', 'UTF8')), 'hex');
  r := pg_temp.s_commit(v_state_id, GS1, '9170000000098', 'fix_semclaim', 'tok', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'S5 commit sem claim', 'reason', 'invalid_state', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'S5 nada criado', 'linhas', '0',
    (SELECT count(*)::text FROM public.whatsapp_instances WHERE connection_config->>'igAccountId' = '9170000000098'));
  -- Queimado há mais de 15 minutos.
  c := pg_temp.s_claim(b->>'state', GS1);
  UPDATE public.instagram_oauth_states SET claimed_at = now() - interval '16 minutes' WHERE id = (c->>'state_id')::uuid;
  PERFORM pg_temp.afirma(p_phase, 'S10 claim velho', 'reason', 'invalid_state',
    pg_temp.s_commit((c->>'state_id')::uuid, GS1, '9170000000098', 'x', 'tok', 100)->>'reason');
  -- Servidor fechado para o app.
  PERFORM pg_temp.afirma(p_phase, 'S8 app chama claim', 'erro', 'ERR 42501', pg_temp.u_direto(GS1, 'claim'));
  PERFORM pg_temp.afirma(p_phase, 'S8 app chama check', 'erro', 'ERR 42501', pg_temp.u_direto(GS1, 'check'));
  PERFORM pg_temp.afirma(p_phase, 'S8 app chama commit', 'erro', 'ERR 42501', pg_temp.u_direto(GS1, 'commit'));
  PERFORM pg_temp.afirma(p_phase, 'S8 app chama bounce', 'erro', 'ERR 42501', pg_temp.u_direto(GS1, 'bounce'));
  PERFORM pg_temp.afirma(p_phase, 'S8 app chama act_as', 'erro', 'ERR 42501', pg_temp.u_direto(SU, 'act_as'));

  -- ========================= N — conectar conta nova =========================
  r := pg_temp.fluxo(GS1, A1, NULL, '9170000000010', 'fix_novo', 'TOK-novo', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'N1 gestor conecta', 'mode', 'connect', r->>'mode');
  PERFORM pg_temp.afirma(p_phase, 'N1 gestor conecta', 'access', 'own_tenant', r->>'access');
  PERFORM pg_temp.afirma(p_phase, 'S11 commit devolve identidade', 'claims depois', SERV, r->>'_claims_depois');
  v_id := (r->'instance'->>'id')::uuid;
  SELECT * INTO v_row FROM public.whatsapp_instances WHERE id = v_id;
  PERFORM pg_temp.afirma(p_phase, 'N1 linha', 'tenant', A1::text, v_row.tenant_id::text);
  PERFORM pg_temp.afirma(p_phase, 'N1 linha', 'provider/status/ativa/chave',
    'instagram/connected/true/instagram_9170000000010',
    concat_ws('/', v_row.provider, v_row.status, v_row.is_active::text, v_row.instance_key));
  PERFORM pg_temp.afirma(p_phase, 'N1 linha', 'nome/perfil', 'Instagram @fix_novo/@fix_novo', v_row.name || '/' || v_row.profile_name);
  PERFORM pg_temp.afirma(p_phase, 'N1 config', 'igAccountId/igUsername/onboarding', '9170000000010/fix_novo/instagram_login',
    concat_ws('/', v_row.connection_config->>'igAccountId', v_row.connection_config->>'igUsername', v_row.connection_config->>'onboarding'));
  PERFORM pg_temp.afirma(p_phase, 'N1 validade = agora + expires_in', 'perto', 'sim', pg_temp.perto(v_row.connection_config->>'tokenExpiresAt', 5184000));
  PERFORM pg_temp.afirma(p_phase, 'N1 emitido agora', 'perto', 'sim', pg_temp.perto(v_row.connection_config->>'tokenIssuedAt', 0));
  PERFORM pg_temp.afirma(p_phase, 'N1 sem renovação', 'renewal', '<null>', v_row.connection_config->>'renewal');
  PERFORM pg_temp.afirma(p_phase, 'N1 token no Vault', 'token', 'TOK-novo', pg_temp.token_de(v_id));
  PERFORM pg_temp.afirma(p_phase, 'N1 state gravado', 'outcome', 'connect',
    (SELECT outcome FROM public.instagram_oauth_states WHERE id = (r->>'state_id')::uuid));
  PERFORM pg_temp.afirma(p_phase, 'N1 validade devolvida', 'valid_until', v_row.connection_config->>'tokenExpiresAt', r->'instance'->>'valid_until');
  PERFORM pg_temp.afirma(p_phase, 'S6 commit de novo', 'reason', 'invalid_state',
    pg_temp.s_commit((r->>'state_id')::uuid, GS1, '9170000000011', 'x', 'tok', 100)->>'reason');

  r := pg_temp.fluxo(GA, A1, NULL, '9170000000011', 'fix_ger', 'TOK-ger', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'N2 gerente na Loja filha', 'mode/access', 'connect/gerente_child_store', (r->>'mode') || '/' || (r->>'access'));
  PERFORM pg_temp.afirma(p_phase, 'N2 linha na Loja filha', 'tenant', A1::text, r->'instance'->>'tenant_id');
  r := pg_temp.fluxo(SU, A1, NULL, '9170000000012', NULL, 'TOK-su', NULL);
  PERFORM pg_temp.afirma(p_phase, 'N3 superadmin', 'mode/access', 'connect/superadmin', (r->>'mode') || '/' || (r->>'access'));
  PERFORM pg_temp.afirma(p_phase, 'N3 sem @', 'nome', 'Instagram', r->'instance'->>'name');
  PERFORM pg_temp.afirma(p_phase, 'N3 sem expires_in = 60 dias', 'perto', 'sim', pg_temp.perto(r->'instance'->>'valid_until', 60 * 86400));
  PERFORM pg_temp.afirma(p_phase, 'N3 sem expires_in', 'expiry_from_meta', 'false', r->>'expiry_from_meta');

  -- ========================= R — reconectar no lugar =========================
  SELECT * INTO v_row FROM public.whatsapp_instances WHERE id = IG1;
  v_vid := pg_temp.vault_id_de(IG1);
  v_n := pg_temp.n_ig();
  r := pg_temp.fluxo(GS1, NULL, IG1, '9170000000001', 'fix_a2', 'TOK-r1', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'R1 reconexão pelo cartão', 'mode', 'reconnect', r->>'mode');
  PERFORM pg_temp.afirma(p_phase, 'R1 mesmo id', 'id', IG1::text, r->'instance'->>'id');
  PERFORM pg_temp.afirma(p_phase, 'R1 preservados', 'tenant/chave/nome/criado/ativa',
    concat_ws('/', v_row.tenant_id, v_row.instance_key, v_row.name, v_row.created_at, v_row.is_active),
    (SELECT concat_ws('/', tenant_id, instance_key, name, created_at, is_active) FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'R1 nenhuma linha nova', 'contas IG', v_n, pg_temp.n_ig());
  PERFORM pg_temp.afirma(p_phase, 'R1 Vault no lugar', 'vault id', v_vid, pg_temp.vault_id_de(IG1));
  PERFORM pg_temp.afirma(p_phase, 'R1 Vault valor novo', 'token', 'TOK-r1', pg_temp.token_de(IG1));
  PERFORM pg_temp.afirma(p_phase, 'R1 renovação zerada', 'renewal', '<null>',
    (SELECT connection_config->>'renewal' FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'R1 emitido agora', 'perto', 'sim',
    pg_temp.perto((SELECT connection_config->>'tokenIssuedAt' FROM public.whatsapp_instances WHERE id = IG1), 0));
  PERFORM pg_temp.afirma(p_phase, 'R1 validade nova', 'perto', 'sim',
    pg_temp.perto((SELECT connection_config->>'tokenExpiresAt' FROM public.whatsapp_instances WHERE id = IG1), 5184000));
  PERFORM pg_temp.afirma(p_phase, 'R1 @ novo', 'igUsername/perfil', 'fix_a2/@fix_a2',
    (SELECT (connection_config->>'igUsername') || '/' || profile_name FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'R1 chave extra da config fica', 'extra', 'fica',
    (SELECT connection_config->>'extra' FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'R1 histórico intacto', 'histórico', 'conv=1 msg=3 cont=1', pg_temp.historico(IG1));
  PERFORM pg_temp.afirma(p_phase, 'R1 cartão volta ao normal', 'status', 'connected',
    (SELECT status FROM public.whatsapp_instances WHERE id = IG1));

  -- Sem clicar no cartão, a conta já é desta Loja: reconecta no lugar.
  r := pg_temp.fluxo(GS1, A1, NULL, '9170000000001', NULL, 'TOK-r2', 5000000);
  PERFORM pg_temp.afirma(p_phase, 'R2 conectar conta já da Loja', 'mode/id', 'reconnect/' || IG1::text, (r->>'mode') || '/' || (r->'instance'->>'id'));
  PERFORM pg_temp.afirma(p_phase, 'R2 sem @ mantém o @', 'perfil', '@fix_a2', (SELECT profile_name FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'R2 nenhuma linha nova', 'contas IG', v_n, pg_temp.n_ig());

  -- Desligada continua desligada.
  UPDATE public.whatsapp_instances SET is_active = false WHERE id = IG1;
  r := pg_temp.fluxo(GA, NULL, IG1, '9170000000001', 'fix_a2', 'TOK-r3', NULL);
  PERFORM pg_temp.afirma(p_phase, 'R3 gerente reconecta desligada', 'mode', 'reconnect', r->>'mode');
  PERFORM pg_temp.afirma(p_phase, 'R3 continua desligada', 'is_active', 'false',
    (SELECT is_active::text FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'R4 sem expires_in = 60 dias', 'perto', 'sim',
    pg_temp.perto((SELECT connection_config->>'tokenExpiresAt' FROM public.whatsapp_instances WHERE id = IG1), 60 * 86400));
  UPDATE public.whatsapp_instances SET is_active = true WHERE id = IG1;

  -- ========================= F — conta de outra Conta/Loja =========================
  v_md5b := pg_temp.md5_linha(IG2);
  v_n := pg_temp.n_ig();
  r := pg_temp.fluxo(GS1, A1, NULL, '9170000000002', 'fix_b', 'TOK-ladrao', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'F1 conta de outra Conta', 'reason/etapa', 'foreign_account/check', (r->>'reason') || '/' || (r->>'_etapa'));
  PERFORM pg_temp.afirma(p_phase, 'F1 mensagem não revela', 'cita nome/id', 'false',
    ((r->>'message') ILIKE '%Segredo%' OR (r->>'message') ILIKE '%FIXTURE%' OR (r->>'message') LIKE '%f4b4f4b4%' OR (r->>'message') LIKE '%fix_b%')::text);
  PERFORM pg_temp.afirma(p_phase, 'F1 a outra intacta', 'md5 linha+vault', v_md5b, pg_temp.md5_linha(IG2));
  PERFORM pg_temp.afirma(p_phase, 'F1 nada criado', 'contas IG', v_n, pg_temp.n_ig());
  -- O commit sozinho também recusa (corrida: a edge function só chama commit
  -- depois do check, mas o banco não confia nisso).
  r := pg_temp.s_commit((r->>'state_id')::uuid, GS1, '9170000000002', 'fix_b', 'TOK-ladrao', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'F1 commit também recusa', 'reason', 'foreign_account', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'F1 a outra intacta depois do commit', 'md5 linha+vault', v_md5b, pg_temp.md5_linha(IG2));
  -- Outra Loja da MESMA Conta, que o gerente alcança: recusa igual.
  PERFORM pg_temp.u_set_enabled(SU, A2, true);
  v_md5 := pg_temp.md5_linha(IG1);
  r := pg_temp.fluxo(GA, A2, NULL, '9170000000001', 'fix_a2', 'TOK-mover', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'F2 conta de Loja irmã', 'reason', 'foreign_account', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'F2 Loja irmã intacta', 'md5 linha+vault', v_md5, pg_temp.md5_linha(IG1));
  PERFORM pg_temp.u_set_enabled(SU, A2, false);
  PERFORM pg_temp.afirma(p_phase, 'F3 alheio no cartão de A1', 'reason', 'not_found', pg_temp.u_begin(GSB, NULL, IG1)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'F3 cartão de WhatsApp', 'reason', 'not_found', pg_temp.u_begin(GS1, NULL, W1)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'F3 cartão inexistente', 'reason', 'not_found', pg_temp.u_begin(GS1, NULL, gen_random_uuid())->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'F4 alheio na Loja A1', 'reason', 'forbidden_tenant', pg_temp.u_begin(GSB, A1, NULL)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'F4 Loja inexistente', 'reason', 'forbidden_tenant', pg_temp.u_begin(GS1, gen_random_uuid(), NULL)->>'reason');

  -- ========================= W — outra conta no cartão =========================
  v_md5 := pg_temp.md5_linha(IG1);
  v_n := pg_temp.n_ig();
  r := pg_temp.fluxo(GS1, NULL, IG1, '9170000000077', 'fix_outra', 'TOK-outra', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'W1 @b no cartão de @a', 'reason', 'wrong_account', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'W1 mensagem diz de quem é o cartão', 'cita @fix_a2', 'true', ((r->>'message') LIKE '%@fix_a2%')::text);
  PERFORM pg_temp.afirma(p_phase, 'W1 nada muda', 'md5 linha+vault', v_md5, pg_temp.md5_linha(IG1));
  PERFORM pg_temp.afirma(p_phase, 'W1 nada criado', 'contas IG', v_n, pg_temp.n_ig());
  r := pg_temp.s_commit((r->>'state_id')::uuid, GS1, '9170000000077', 'fix_outra', 'TOK-outra', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'W1 commit também recusa', 'reason', 'wrong_account', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'W1 nada muda depois do commit', 'md5 linha+vault', v_md5, pg_temp.md5_linha(IG1));
  r := pg_temp.fluxo(GS1, NULL, IG1, '9170000000002', 'fix_b', 'TOK-b', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'W2 conta alheia no cartão', 'reason', 'wrong_account', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'W2 não revela a alheia', 'cita fix_b', 'false', ((r->>'message') LIKE '%fix_b%')::text);
  PERFORM pg_temp.afirma(p_phase, 'W2 nada muda', 'md5 IG1 / IG2', v_md5 || v_md5b, pg_temp.md5_linha(IG1) || pg_temp.md5_linha(IG2));
  PERFORM pg_temp.afirma(p_phase, 'W3 igAccountId inválido', 'reason', 'invalid',
    pg_temp.fluxo(GS1, A1, NULL, '12ab', 'x', 'tok', 100)->>'reason');

  -- ========================= E5 — chave desligada no meio =========================
  b := pg_temp.u_begin(GS1, A1, NULL);
  c := pg_temp.s_claim(b->>'state', GS1);
  DELETE FROM public.instagram_connect_stores WHERE tenant_id = A1;
  r := pg_temp.s_commit((c->>'state_id')::uuid, GS1, '9170000000020', 'fix_meio', 'tok', 5184000);
  PERFORM pg_temp.afirma(p_phase, 'E5 chave desligada no meio', 'reason', 'not_enabled', r->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'E5 nada criado', 'linhas', '0',
    (SELECT count(*)::text FROM public.whatsapp_instances WHERE connection_config->>'igAccountId' = '9170000000020'));
  PERFORM pg_temp.afirma(p_phase, 'E5 enabled depois', 'enabled', 'false', pg_temp.u_enabled(GS1, A1));

  -- ========================= O — desligar / religar (chave de A1 desligada) =========================
  v_vid := pg_temp.vault_id_de(IG1);
  r := pg_temp.u_active(GS1, IG1, false);
  PERFORM pg_temp.afirma(p_phase, 'O1 gestor desliga (sem chave)', 'ok/is_active', 'true/false', (r->>'ok') || '/' || (r->>'is_active'));
  PERFORM pg_temp.afirma(p_phase, 'O1 desligada', 'is_active', 'false', (SELECT is_active::text FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'O1 histórico e Vault intactos', 'histórico/vault', 'conv=1 msg=3 cont=1/' || v_vid || '/TOK-r3',
    pg_temp.historico(IG1) || '/' || pg_temp.vault_id_de(IG1) || '/' || pg_temp.token_de(IG1));
  v_md5 := pg_temp.md5_linha(IG1);
  PERFORM pg_temp.afirma(p_phase, 'O3 atendente religa', 'reason', 'forbidden', pg_temp.u_active(AT1, IG1, true)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'O4 alheio religa', 'reason', 'not_found', pg_temp.u_active(GSB, IG1, true)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'O4 gestor irmão religa', 'reason', 'not_found', pg_temp.u_active(GS2, IG1, true)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'O3/O4 nada muda', 'md5', v_md5, pg_temp.md5_linha(IG1));
  PERFORM pg_temp.afirma(p_phase, 'O6 WhatsApp não é desligado aqui', 'reason', 'not_found', pg_temp.u_active(GS1, W1, false)->>'reason');
  PERFORM pg_temp.afirma(p_phase, 'O6 WhatsApp intacto', 'is_active', 'true', (SELECT is_active::text FROM public.whatsapp_instances WHERE id = W1));
  r := pg_temp.u_active(GA, IG1, true);
  PERFORM pg_temp.afirma(p_phase, 'O5 gerente religa na filha', 'ok/changed', 'true/true', (r->>'ok') || '/' || (r->>'changed'));
  PERFORM pg_temp.afirma(p_phase, 'O2 religada', 'is_active', 'true', (SELECT is_active::text FROM public.whatsapp_instances WHERE id = IG1));
  PERFORM pg_temp.afirma(p_phase, 'O2 religar de novo não muda', 'changed', 'false', pg_temp.u_active(GS1, IG1, true)->>'changed');
  PERFORM pg_temp.afirma(p_phase, 'O7 sem sessão', 'reason', 'unauthenticated',
    (SELECT pg_temp.u_active(NULL, IG1, false)->>'reason'));

  -- ========================= E7 — o texto do sino =========================
  INSERT INTO public.instagram_connect_stores (tenant_id, note) VALUES (A1, 'FIXTURE de novo');
  UPDATE public.whatsapp_instances
     SET connection_config = connection_config || '{"tokenExpiresAt":"2026-01-01T00:00:00+00:00"}'
   WHERE id IN (IG1, IG2);
  PERFORM public.instagram_connection_alert_sweep(now(), IG1);
  PERFORM public.instagram_connection_alert_sweep(now(), IG2);
  PERFORM pg_temp.afirma(p_phase, 'E7 Loja com chave: aponta o botão', 'texto',
    'A conexão do Instagram @fix_a2 venceu em 31/12/2025 às 21:00. As respostas pelo Instagram estão paradas até a conta ser reconectada. Para reconectar, abra Instâncias e APIs e clique em Reconectar no cartão da conta.',
    (SELECT min(message) FROM public.notifications WHERE tenant_id = A1 AND metadata->>'instance_id' = IG1::text));
  PERFORM pg_temp.afirma(p_phase, 'E7 Loja sem chave: texto de antes', 'texto',
    'A conexão do Instagram @fix_b venceu em 31/12/2025 às 21:00. As respostas pelo Instagram estão paradas até a conta ser reconectada. Para reconectar, escreva para contato@convoflow.com.br.',
    (SELECT min(message) FROM public.notifications WHERE tenant_id = B1 AND metadata->>'instance_id' = IG2::text));
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 4. Fase 1 — como está
-- -----------------------------------------------------------------------------
SELECT pg_temp.bateria('1-intacto');

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suíte sabe falhar)
--    O claim passa a ignorar o VALOR do state: pega o primeiro state pendente
--    do usuário. Um state inventado passa. Desfeito pelo ROLLBACK.
-- -----------------------------------------------------------------------------
-- DO $sab$
-- DECLARE
--   v_def text := pg_get_functiondef('public.instagram_connect_claim(text,uuid)'::regprocedure);
--   v_old text := $a$WHERE s.state_hash = encode(sha256(convert_to(p_state, 'UTF8')), 'hex')  -- [state-confere]$a$;
-- BEGIN
--   IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
--     RAISE EXCEPTION 'SABOTAGEM: âncora não encontrada exatamente uma vez.';
--   END IF;
--   EXECUTE replace(v_def, v_old, $b$WHERE s.user_id = p_user_id AND s.claimed_at IS NULL AND s.expires_at > now()  -- [sabotado]$b$);
-- END
-- $sab$;
-- SET LOCAL session_replication_role = replica;
-- SELECT pg_temp.limpar();
-- SELECT pg_temp.semear();
-- SET LOCAL session_replication_role = origin;
-- SELECT pg_temp.semear_vault();
-- SELECT pg_temp.bateria('2-sabotado');

-- -----------------------------------------------------------------------------
-- 6. Z — dados reais iguais
-- -----------------------------------------------------------------------------
SELECT pg_temp.limpar();
SELECT pg_temp.afirma('9-reais', 'Z1 instâncias reais', 'md5',
  (SELECT inst FROM _cx_antes),
  (SELECT md5(coalesce(string_agg(w::text, '|' ORDER BY w.id), '')) FROM public.whatsapp_instances w));
SELECT pg_temp.afirma('9-reais', 'Z2 chaves reais', 'linhas',
  (SELECT chaves::text FROM _cx_antes), (SELECT count(*)::text FROM public.instagram_connect_stores));
SELECT pg_temp.afirma('9-reais', 'Z3 EncaixaRH sem a chave', 'linhas', '0',
  (SELECT count(*)::text FROM public.instagram_connect_stores WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'));

-- -----------------------------------------------------------------------------
-- 7. Placar
-- -----------------------------------------------------------------------------
SELECT phase,
       count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(cenario || ' / ' || check_kind
                           || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _cx_results GROUP BY phase ORDER BY phase;

ROLLBACK;
