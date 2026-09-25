-- =============================================================================
-- teste_renovacao_instagram.sql — rede de segurança da migração
-- 20260924000001_instagram_token_renewal (fatia 4/5 do Instagram: renovação).
--
-- O QUE FAZ
--   Semeia uma Conta falsa (A) com uma Loja (L), uma Conta sem ninguém (Z) e
--   instâncias de Instagram em cada situação. Chama as funções como a edge
--   function chama (papel postgres; nas de gravação o `p_now` é fixo, para o
--   relógio não mexer no resultado).
--
--   S0  Estrutura e permissões: tabela sem acesso pelo app; nada executável por
--       anon/authenticated; o disparo nem pela service_role.
--   S1  Sucesso: token novo no Vault NO LUGAR (mesmo segredo), validade =
--       agora + expires_in da Meta (não 60 dias), estado 'ok', resto da config
--       preservado.
--   S2  Sucesso sem expires_in (ou absurdo): guarda o token, MANTÉM a validade,
--       estado 'retrying'.
--   S3  Guarda de corrida: tokenIssuedAt mudou desde a leitura → 'stale', nada
--       gravado (sucesso e falha). Instância que não é de Instagram → not_found.
--   S4  Falha passageira: 'retrying', motivo, data; token e validade intocados;
--       lastSuccessAt do mesmo token preservado.
--   S5  Falha que pede reconexão: 'needs_reconnect' + código da Meta; tipo
--       inválido levanta.
--   S6  Aviso "precisa reconectar" (instância da Loja): Gestor da Loja e
--       Gerente da Conta-mãe recebem; Atendente e outras Contas não. UMA vez,
--       mesmo com o sweep rodando de novo no mesmo dia e no dia seguinte.
--   S7  Token trocado à mão (runbook) depois do needs_reconnect: o estado
--       antigo deixa de valer; nenhum aviso de reconexão para o token novo.
--   S8  Marco de 7 dias: não sai com 8 dias; sai com 6; não repete com 5.
--   S9  Vencimento: sai uma vez; o de 7 dias não volta.
--   S10 Novo ciclo: depois de renovar (validade nova) o marco de 7 dias pode
--       sair de novo — uma vez por token.
--   S11 Não avisa: instância inativa, sem datas, instância de WhatsApp.
--   S12 Conta sem Gerente/Gestor: marca gravada com 0 destinatários, sem erro.
--   S13 Texto: pt-BR simples, data de Brasília, link para a tela, sem jargão.
--   S14 O disparo: sem segredo no Vault levanta com instrução; com segredo,
--       enfileira UM pedido para a função certa com o cabeçalho certo (o
--       ROLLBACK tira da fila antes de o pg_net enviar).
--   S15 Nada mais muda: EncaixaRH, triggers de mensagens, funções de entrada.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo b9b9b9b9-.
--   Guarda de colisão antes de semear. Tokens e segredo de fixture vão para o
--   Vault e saem no ROLLBACK. O pedido HTTP do S14 fica em
--   net.http_request_queue, que o pg_net só lê depois do COMMIT — com ROLLBACK
--   ele nunca é enviado.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o conector de escrita), o arquivo inteiro
--   de uma vez. O placar é a ÚLTIMA consulta.
--
-- MODO AUTO-TESTE (prova que a suíte pega aviso duplicado)
--   Descomente o bloco SABOTAGEM logo abaixo da semeadura: ele desliga a regra
--   "uma vez por marco" (a notificação sai mesmo quando a marca já existia),
--   dentro da transação. Resultado medido está em docs/RUNBOOK_instagram_renovacao.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guarda de colisão e de pré-requisito
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'b9b9b9b9-%')
  OR EXISTS (SELECT 1 FROM public.whatsapp_instances
              WHERE connection_config ->> 'igAccountId' LIKE '1784140000000049%') THEN
    RAISE EXCEPTION 'ABORTADO: já existe fixture b9b9b9b9- ou conta de Instagram de fixture. Limpe antes.';
  END IF;
  IF to_regclass('public.instagram_connection_alerts') IS NULL
  OR to_regprocedure('public.instagram_connection_alert_sweep(timestamptz,uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260924000001 não está aplicada.';
  END IF;
END
$guard$;

-- Retrato de antes (S15), tirado ANTES de semear.
CREATE TEMP TABLE _s_antes ON COMMIT DROP AS
SELECT
  (SELECT concat_ws('|',
     (SELECT count(*) FROM public.contacts      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
     (SELECT count(*) FROM public.conversations WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
     (SELECT count(*) FROM public.messages      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
     (SELECT count(*) FROM public.notifications WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
     (SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) FROM public.whatsapp_instances w
       WHERE w.tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'))) AS encaixa,
  (SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) FROM public.whatsapp_instances w) AS instancias,
  (SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname))
     FROM pg_trigger t
    WHERE NOT t.tgisinternal
      AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass,
                        'public.conversations'::regclass, 'public.whatsapp_instances'::regclass)) AS triggers,
  (SELECT md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY p.oid::regprocedure::text))
     FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('process_instagram_message', 'process_incoming_message', 'update_conversation_on_message',
                        'handle_message_conversation', 'set_instance_meta_token', 'get_instance_meta_token',
                        'response_rule_admin_user_ids', 'delete_whatsapp_instance')) AS funcoes;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('b9b9b9b9-0000-4000-8000-00000000000a','authenticated','authenticated','fix-s-gerente-a@fixture.invalid', now(), now()),
  ('b9b9b9b9-0000-4000-8000-00000000000b','authenticated','authenticated','fix-s-gestor-a@fixture.invalid',  now(), now()),
  ('b9b9b9b9-0000-4000-8000-00000000000c','authenticated','authenticated','fix-s-gestor-l@fixture.invalid',  now(), now()),
  ('b9b9b9b9-0000-4000-8000-00000000000d','authenticated','authenticated','fix-s-atend-l@fixture.invalid',   now(), now()),
  ('b9b9b9b9-0000-4000-8000-00000000000e','authenticated','authenticated','fix-s-outra@fixture.invalid',     now(), now()),
  ('b9b9b9b9-0000-4000-8000-00000000000f','authenticated','authenticated','fix-s-inativo@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('b9b9b9b9-0000-4000-8000-000000000001','FIXTURE Conta S','fixture-conta-s','account', NULL,'active','active','{}'),
  ('b9b9b9b9-0000-4000-8000-000000000002','FIXTURE Loja S','fixture-loja-s','store','b9b9b9b9-0000-4000-8000-000000000001','active','active','{}'),
  ('b9b9b9b9-0000-4000-8000-000000000003','FIXTURE Conta Z','fixture-conta-z','account', NULL,'active','active','{}'),
  ('b9b9b9b9-0000-4000-8000-000000000009','FIXTURE Outra S','fixture-outra-s','account', NULL,'active','active','{}');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('b9b9b9b9-0000-4000-8000-0000000000fa','b9b9b9b9-0000-4000-8000-00000000000a','b9b9b9b9-0000-4000-8000-000000000001','gerente',   NULL,'active','FIX','GerenteA','2026-01-01 10:00+00'),
  ('b9b9b9b9-0000-4000-8000-0000000000fb','b9b9b9b9-0000-4000-8000-00000000000b','b9b9b9b9-0000-4000-8000-000000000001','gestor',    'b9b9b9b9-0000-4000-8000-0000000000fa','active','FIX','GestorA','2026-01-01 10:01+00'),
  ('b9b9b9b9-0000-4000-8000-0000000000fc','b9b9b9b9-0000-4000-8000-00000000000c','b9b9b9b9-0000-4000-8000-000000000002','gestor',    'b9b9b9b9-0000-4000-8000-0000000000fa','active','FIX','GestorL','2026-01-01 10:02+00'),
  ('b9b9b9b9-0000-4000-8000-0000000000fd','b9b9b9b9-0000-4000-8000-00000000000d','b9b9b9b9-0000-4000-8000-000000000002','atendente', 'b9b9b9b9-0000-4000-8000-0000000000fc','active','FIX','AtendL','2026-01-01 10:03+00'),
  ('b9b9b9b9-0000-4000-8000-0000000000fe','b9b9b9b9-0000-4000-8000-00000000000e','b9b9b9b9-0000-4000-8000-000000000009','gerente',   NULL,'active','FIX','Outra','2026-01-01 10:04+00'),
  ('b9b9b9b9-0000-4000-8000-0000000000ff','b9b9b9b9-0000-4000-8000-00000000000f','b9b9b9b9-0000-4000-8000-000000000001','gestor',    'b9b9b9b9-0000-4000-8000-0000000000fa','suspended','FIX','Suspenso','2026-01-01 10:05+00');

-- Datas de fixture: emissão 2026-09-24 00:00 UTC, validade +60 dias.
INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, provider, status, is_active, profile_name, connection_config) VALUES
  -- I1: Loja L — renovação e "precisa reconectar"
  ('b9b9b9b9-aaaa-4000-8000-000000000001','b9b9b9b9-0000-4000-8000-000000000002','FIX IG Loja','instagram_17841400000000491','instagram','connected',true,'@fix_ig_loja',
   jsonb_build_object('igAccountId','17841400000000491','igUsername','fix_ig_loja',
                      'tokenIssuedAt', to_jsonb('2026-09-24 00:00:00+00'::timestamptz),
                      'tokenExpiresAt', to_jsonb('2026-11-23 00:00:00+00'::timestamptz))),
  -- I2: Conta A — marcos de 7 dias / vencimento / novo ciclo
  ('b9b9b9b9-aaaa-4000-8000-000000000002','b9b9b9b9-0000-4000-8000-000000000001','FIX IG Conta','instagram_17841400000000492','instagram','connected',true,'@fix_ig_conta',
   jsonb_build_object('igAccountId','17841400000000492','igUsername','fix_ig_conta',
                      'tokenIssuedAt', to_jsonb('2026-09-24 00:00:00+00'::timestamptz),
                      'tokenExpiresAt', to_jsonb('2026-11-23 00:00:00+00'::timestamptz))),
  -- I3: inativa, vencida
  ('b9b9b9b9-aaaa-4000-8000-000000000003','b9b9b9b9-0000-4000-8000-000000000001','FIX IG Inativa','instagram_17841400000000493','instagram','connected',false,'@fix_ig_inativa',
   jsonb_build_object('igAccountId','17841400000000493',
                      'tokenIssuedAt', to_jsonb('2026-01-01 00:00:00+00'::timestamptz),
                      'tokenExpiresAt', to_jsonb('2026-03-01 00:00:00+00'::timestamptz))),
  -- I4: sem datas
  ('b9b9b9b9-aaaa-4000-8000-000000000004','b9b9b9b9-0000-4000-8000-000000000001','FIX IG Sem Datas','instagram_17841400000000494','instagram','connected',true,NULL,
   jsonb_build_object('igAccountId','17841400000000494')),
  -- I5: Conta Z (ninguém para avisar), vencida
  ('b9b9b9b9-aaaa-4000-8000-000000000005','b9b9b9b9-0000-4000-8000-000000000003','FIX IG Conta Z','instagram_17841400000000495','instagram','connected',true,'@fix_ig_z',
   jsonb_build_object('igAccountId','17841400000000495',
                      'tokenIssuedAt', to_jsonb('2026-01-01 00:00:00+00'::timestamptz),
                      'tokenExpiresAt', to_jsonb('2026-03-01 00:00:00+00'::timestamptz))),
  -- W1: WhatsApp oficial com datas "vencidas" na config — nunca pode avisar
  ('b9b9b9b9-aaaa-4000-8000-0000000000f1','b9b9b9b9-0000-4000-8000-000000000001','FIX WA','fix-key-s-wa','official','open',true,NULL,
   jsonb_build_object('phoneNumberId','999000111',
                      'tokenIssuedAt', to_jsonb('2026-01-01 00:00:00+00'::timestamptz),
                      'tokenExpiresAt', to_jsonb('2026-03-01 00:00:00+00'::timestamptz)));

SET LOCAL session_replication_role = origin;

SELECT public.set_instance_meta_token('b9b9b9b9-aaaa-4000-8000-000000000001', 'FIXTURE-TOKEN-ANTIGO-I1');
SELECT public.set_instance_meta_token('b9b9b9b9-aaaa-4000-8000-000000000002', 'FIXTURE-TOKEN-ANTIGO-I2');

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- SABOTAGEM (MODO AUTO-TESTE) — descomente o bloco inteiro: a notificação sai
-- mesmo quando a marca do marco já existia. O ROLLBACK desfaz.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- DO $sab$
-- DECLARE
--   v_def text := pg_get_functiondef('public.instagram_connection_alert_sweep(timestamptz,uuid)'::regprocedure);
--   v_old constant text := 'CONTINUE WHEN v_n = 0; -- [uma-vez-por-marco]';
-- BEGIN
--   IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
--     RAISE EXCEPTION 'SABOTAGEM: âncora não encontrada exatamente uma vez.';
--   END IF;
--   EXECUTE replace(v_def, v_old, 'CONTINUE WHEN false; -- [uma-vez-por-marco]');
-- END
-- $sab$;

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _s_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _s_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

-- Notificações de um usuário sobre uma instância num marco.
CREATE FUNCTION pg_temp.avisos(p_user uuid, p_inst uuid, p_marco text) RETURNS text
LANGUAGE sql AS $f$
  SELECT count(*)::text FROM public.notifications
   WHERE user_id = p_user
     AND metadata ->> 'kind' = 'instagram_connection'
     AND metadata ->> 'instance_id' = p_inst::text
     AND metadata ->> 'milestone' = p_marco;
$f$;

CREATE FUNCTION pg_temp.cfg(p_inst uuid) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT connection_config FROM public.whatsapp_instances WHERE id = p_inst;
$f$;

-- -----------------------------------------------------------------------------
-- 3. Bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  I1   constant uuid := 'b9b9b9b9-aaaa-4000-8000-000000000001';
  I2   constant uuid := 'b9b9b9b9-aaaa-4000-8000-000000000002';
  I3   constant uuid := 'b9b9b9b9-aaaa-4000-8000-000000000003';
  I4   constant uuid := 'b9b9b9b9-aaaa-4000-8000-000000000004';
  I5   constant uuid := 'b9b9b9b9-aaaa-4000-8000-000000000005';
  W1   constant uuid := 'b9b9b9b9-aaaa-4000-8000-0000000000f1';
  U_GER_A  constant uuid := 'b9b9b9b9-0000-4000-8000-00000000000a';
  U_GES_A  constant uuid := 'b9b9b9b9-0000-4000-8000-00000000000b';
  U_GES_L  constant uuid := 'b9b9b9b9-0000-4000-8000-00000000000c';
  U_ATD_L  constant uuid := 'b9b9b9b9-0000-4000-8000-00000000000d';
  U_OUTRA  constant uuid := 'b9b9b9b9-0000-4000-8000-00000000000e';
  U_INAT   constant uuid := 'b9b9b9b9-0000-4000-8000-00000000000f';
  NOW1 constant timestamptz := '2026-10-24 09:20:00+00';
  res   jsonb;
  c     jsonb;
  c2    jsonb;
  txt   text;
  txt2  text;
  sid   uuid;
  exp2  timestamptz;
  n     bigint;
BEGIN
  -- ===========================================================================
  -- S0 — estrutura e permissões
  -- ===========================================================================
  PERFORM pg_temp.afirma('S0','S0a tabela com RLS e sem policy',
    'true|0',
    (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.instagram_connection_alerts'::regclass)
    || '|' || (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'instagram_connection_alerts'));

  PERFORM pg_temp.afirma('S0','S0b app não lê a tabela de avisos',
    'false|false',
    has_table_privilege('anon', 'public.instagram_connection_alerts', 'SELECT')::text || '|' ||
    has_table_privilege('authenticated', 'public.instagram_connection_alerts', 'SELECT')::text);

  SELECT string_agg(f.sig || '=' || has_function_privilege('anon', f.sig, 'EXECUTE')::text
                    || '/' || has_function_privilege('authenticated', f.sig, 'EXECUTE')::text, ' ' ORDER BY f.sig)
    INTO txt
    FROM (VALUES
      ('public.instagram_token_renewal_record_success(uuid,text,integer,text,timestamptz)'),
      ('public.instagram_token_renewal_record_failure(uuid,text,text,text,integer,text,timestamptz)'),
      ('public.instagram_connection_alert_sweep(timestamptz,uuid)'),
      ('public.instagram_token_renewal_cron_secret()'),
      ('public.instagram_token_renewal_kick(uuid,boolean,boolean)'),
      ('public.instagram_parse_ts(text)')) f(sig);
  PERFORM pg_temp.afirma('S0','S0c nenhuma função executável por anon/authenticated',
    '0', (SELECT count(*)::text FROM regexp_matches(txt, 'true', 'g')));

  PERFORM pg_temp.afirma('S0','S0d service_role: grava, avisa e lê o segredo; NÃO dispara',
    'true|true|true|true|false',
    has_function_privilege('service_role', 'public.instagram_token_renewal_record_success(uuid,text,integer,text,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_token_renewal_record_failure(uuid,text,text,text,integer,text,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_connection_alert_sweep(timestamptz,uuid)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_token_renewal_cron_secret()', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_token_renewal_kick(uuid,boolean,boolean)', 'EXECUTE')::text);

  PERFORM pg_temp.afirma('S0','S0e a chave da tabela É a regra: (instância, marco, validade)',
    'instance_id,milestone,token_expires_at',
    (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
       FROM pg_constraint co
       CROSS JOIN LATERAL unnest(co.conkey) WITH ORDINALITY k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.attnum
      WHERE co.conrelid = 'public.instagram_connection_alerts'::regclass AND co.contype = 'p'));

  -- ===========================================================================
  -- S1 — sucesso com expires_in
  -- ===========================================================================
  SELECT vault_secret_id INTO sid FROM public.instance_secrets WHERE instance_id = I1;
  c := pg_temp.cfg(I1);
  res := public.instagram_token_renewal_record_success(I1, 'FIXTURE-TOKEN-NOVO-1', 5183944, c ->> 'tokenIssuedAt', NOW1);
  c2 := pg_temp.cfg(I1);

  PERFORM pg_temp.afirma('S1','S1a resultado','renewed', res ->> 'outcome');
  PERFORM pg_temp.afirma('S1','S1b token novo no Vault','FIXTURE-TOKEN-NOVO-1', public.get_instance_meta_token(I1));
  PERFORM pg_temp.afirma('S1','S1c no lugar: mesmo segredo do Vault','true',
    ((SELECT vault_secret_id FROM public.instance_secrets WHERE instance_id = I1) = sid)::text);
  PERFORM pg_temp.afirma('S1','S1d validade = agora + expires_in da Meta (e NÃO +60 dias)','true|false',
    (public.instagram_parse_ts(c2 ->> 'tokenExpiresAt') = NOW1 + make_interval(secs => 5183944))::text || '|' ||
    (public.instagram_parse_ts(c2 ->> 'tokenExpiresAt') = NOW1 + interval '60 days')::text);
  PERFORM pg_temp.afirma('S1','S1e tokenIssuedAt = agora','true',
    (public.instagram_parse_ts(c2 ->> 'tokenIssuedAt') = NOW1)::text);
  PERFORM pg_temp.afirma('S1','S1f estado ok, do token atual, sem erro','ok|true|<null>|<null>',
    (c2 #>> '{renewal,status}') || '|' ||
    ((c2 #>> '{renewal,forTokenIssuedAt}') = (c2 ->> 'tokenIssuedAt'))::text || '|' ||
    coalesce(c2 #>> '{renewal,reason}', '<null>') || '|' || coalesce(c2 #>> '{renewal,lastErrorAt}', '<null>'));
  PERFORM pg_temp.afirma('S1','S1g resto da config preservado','17841400000000491|fix_ig_loja',
    (c2 ->> 'igAccountId') || '|' || (c2 ->> 'igUsername'));
  PERFORM pg_temp.afirma('S1','S1h valid_until devolvido = gravado','true',
    ((res ->> 'valid_until') = (c2 ->> 'tokenExpiresAt'))::text);
  PERFORM pg_temp.afirma('S1','S1i token não aparece na config','false',
    (c2::text LIKE '%FIXTURE-TOKEN%')::text);

  -- ===========================================================================
  -- S2 — sucesso sem expires_in: guarda o token, mantém a validade, retrying
  -- ===========================================================================
  c := pg_temp.cfg(I1);
  res := public.instagram_token_renewal_record_success(I1, 'FIXTURE-TOKEN-NOVO-2', NULL, c ->> 'tokenIssuedAt', NOW1 + interval '2 days');
  c2 := pg_temp.cfg(I1);
  PERFORM pg_temp.afirma('S2','S2a resultado','renewed_without_expiry', res ->> 'outcome');
  PERFORM pg_temp.afirma('S2','S2b token guardado assim mesmo','FIXTURE-TOKEN-NOVO-2', public.get_instance_meta_token(I1));
  PERFORM pg_temp.afirma('S2','S2c validade MANTIDA (nunca inventa 60 dias)','true',
    ((c2 ->> 'tokenExpiresAt') = (c ->> 'tokenExpiresAt'))::text);
  PERFORM pg_temp.afirma('S2','S2d estado retrying/no_expiry, token novo','retrying|no_expiry|true',
    (c2 #>> '{renewal,status}') || '|' || (c2 #>> '{renewal,reason}') || '|' ||
    (public.instagram_parse_ts(c2 ->> 'tokenIssuedAt') = NOW1 + interval '2 days')::text);

  c := pg_temp.cfg(I1);
  res := public.instagram_token_renewal_record_success(I1, 'FIXTURE-TOKEN-NOVO-3', 999999999, c ->> 'tokenIssuedAt', NOW1 + interval '3 days');
  c2 := pg_temp.cfg(I1);
  PERFORM pg_temp.afirma('S2','S2e expires_in absurdo (> 400 dias) = ausente','renewed_without_expiry|true',
    (res ->> 'outcome') || '|' || ((c2 ->> 'tokenExpiresAt') = (c ->> 'tokenExpiresAt'))::text);

  -- ===========================================================================
  -- S3 — guarda de corrida e instância errada
  -- ===========================================================================
  c := pg_temp.cfg(I1);
  res := public.instagram_token_renewal_record_success(I1, 'FIXTURE-TOKEN-INTRUSO', 5183944, '2020-01-01T00:00:00+00:00', NOW1);
  PERFORM pg_temp.afirma('S3','S3a sucesso com leitura velha → stale, nada gravado','stale|FIXTURE-TOKEN-NOVO-3|true',
    (res ->> 'outcome') || '|' || public.get_instance_meta_token(I1) || '|' || (pg_temp.cfg(I1) = c)::text);
  res := public.instagram_token_renewal_record_failure(I1, 'needs_reconnect', 'token_invalid', 'x', 190, '2020-01-01T00:00:00+00:00', NOW1);
  PERFORM pg_temp.afirma('S3','S3b falha com leitura velha → stale, nada gravado','stale|true',
    (res ->> 'outcome') || '|' || (pg_temp.cfg(I1) = c)::text);
  c := pg_temp.cfg(W1);
  res := public.instagram_token_renewal_record_success(W1, 'FIXTURE-TOKEN-WA', 5183944, c ->> 'tokenIssuedAt', NOW1);
  PERFORM pg_temp.afirma('S3','S3c instância de WhatsApp → not_found, intocada','not_found|true|<null>',
    (res ->> 'outcome') || '|' || (pg_temp.cfg(W1) = c)::text || '|' ||
    coalesce((SELECT 'tem' FROM public.instance_secrets WHERE instance_id = W1), '<null>'));

  -- ===========================================================================
  -- S4 — falha passageira
  -- ===========================================================================
  c := pg_temp.cfg(I1);
  res := public.instagram_token_renewal_record_failure(I1, 'transient', 'network_error',
           'Não foi possível falar com o Instagram.', NULL, c ->> 'tokenIssuedAt', NOW1 + interval '4 days');
  c2 := pg_temp.cfg(I1);
  PERFORM pg_temp.afirma('S4','S4a resultado','retry_tomorrow', res ->> 'outcome');
  PERFORM pg_temp.afirma('S4','S4b estado, motivo, mensagem, data','retrying|network_error|Não foi possível falar com o Instagram.|true',
    (c2 #>> '{renewal,status}') || '|' || (c2 #>> '{renewal,reason}') || '|' || (c2 #>> '{renewal,message}') || '|' ||
    (public.instagram_parse_ts(c2 #>> '{renewal,lastErrorAt}') = NOW1 + interval '4 days')::text);
  PERFORM pg_temp.afirma('S4','S4c token e validade intocados','FIXTURE-TOKEN-NOVO-3|true|true',
    public.get_instance_meta_token(I1) || '|' ||
    ((c2 ->> 'tokenExpiresAt') = (c ->> 'tokenExpiresAt'))::text || '|' ||
    ((c2 ->> 'tokenIssuedAt') = (c ->> 'tokenIssuedAt'))::text);
  PERFORM pg_temp.afirma('S4','S4d lastSuccessAt do mesmo token preservado','true',
    ((c2 #>> '{renewal,lastSuccessAt}') = (c #>> '{renewal,lastSuccessAt}'))::text);

  -- ===========================================================================
  -- S5 — falha que pede reconexão
  -- ===========================================================================
  c := pg_temp.cfg(I1);
  res := public.instagram_token_renewal_record_failure(I1, 'needs_reconnect', 'token_invalid',
           'O Instagram não aceita mais o acesso atual desta conta.', 190, c ->> 'tokenIssuedAt', NOW1 + interval '5 days');
  c2 := pg_temp.cfg(I1);
  PERFORM pg_temp.afirma('S5','S5a estado needs_reconnect, código 190, do token atual','needs_reconnect|needs_reconnect|190|true',
    (res ->> 'outcome') || '|' || (c2 #>> '{renewal,status}') || '|' || (c2 #>> '{renewal,metaCode}') || '|' ||
    ((c2 #>> '{renewal,forTokenIssuedAt}') = (c2 ->> 'tokenIssuedAt'))::text);
  BEGIN
    PERFORM public.instagram_token_renewal_record_failure(I1, 'qualquer', 'x', 'x', NULL, c2 ->> 'tokenIssuedAt', NOW1);
    txt := 'não levantou';
  EXCEPTION WHEN OTHERS THEN
    txt := 'levantou';
  END;
  PERFORM pg_temp.afirma('S5','S5b tipo de falha inválido levanta','levantou', txt);

  -- ===========================================================================
  -- S6 — aviso "precisa reconectar", uma vez (instância da Loja)
  -- ===========================================================================
  -- A validade de I1 é 2026-11-23 00:00 UTC; NOW1+5d está longe dos marcos de data.
  res := public.instagram_connection_alert_sweep(NOW1 + interval '5 days', NULL);
  PERFORM pg_temp.afirma('S6','S6a primeira varredura: 1 aviso, 2 notificações, 0 erro','1|2|0',
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I1 AND milestone = 'needs_reconnect')
    || '|' || (SELECT count(*)::text FROM public.notifications WHERE metadata ->> 'instance_id' = I1::text)
    || '|' || (res ->> 'errors'));
  PERFORM pg_temp.afirma('S6','S6b recebem: Gestor da Loja e Gerente da Conta-mãe','1|1',
    pg_temp.avisos(U_GES_L, I1, 'needs_reconnect') || '|' || pg_temp.avisos(U_GER_A, I1, 'needs_reconnect'));
  PERFORM pg_temp.afirma('S6','S6c não recebem: Atendente, Gestor da Conta, outra Conta, perfil inativo','0|0|0|0',
    pg_temp.avisos(U_ATD_L, I1, 'needs_reconnect') || '|' || pg_temp.avisos(U_GES_A, I1, 'needs_reconnect') || '|' ||
    pg_temp.avisos(U_OUTRA, I1, 'needs_reconnect') || '|' || pg_temp.avisos(U_INAT, I1, 'needs_reconnect'));

  PERFORM public.instagram_connection_alert_sweep(NOW1 + interval '5 days', NULL);
  PERFORM public.instagram_connection_alert_sweep(NOW1 + interval '5 days 1 hour', I1);
  PERFORM pg_temp.afirma('S6','S6d mesma data de novo (2x): nada duplica','1|1',
    pg_temp.avisos(U_GES_L, I1, 'needs_reconnect') || '|' || pg_temp.avisos(U_GER_A, I1, 'needs_reconnect'));
  PERFORM public.instagram_connection_alert_sweep(NOW1 + interval '6 days', NULL);
  PERFORM public.instagram_connection_alert_sweep(NOW1 + interval '7 days', NULL);
  PERFORM pg_temp.afirma('S6','S6e dias seguintes: nada duplica','1|1',
    pg_temp.avisos(U_GES_L, I1, 'needs_reconnect') || '|' || pg_temp.avisos(U_GER_A, I1, 'needs_reconnect'));
  PERFORM pg_temp.afirma('S6','S6f marca guarda quantos receberam','2',
    (SELECT recipients::text FROM public.instagram_connection_alerts WHERE instance_id = I1 AND milestone = 'needs_reconnect'));

  -- ===========================================================================
  -- S7 — token trocado à mão depois do needs_reconnect (receita do runbook)
  -- ===========================================================================
  UPDATE public.whatsapp_instances
     SET connection_config = connection_config
           || jsonb_build_object('tokenIssuedAt', NOW1 + interval '8 days',
                                 'tokenExpiresAt', NOW1 + interval '68 days')
   WHERE id = I1;
  PERFORM public.instagram_connection_alert_sweep(NOW1 + interval '9 days', NULL);
  PERFORM pg_temp.afirma('S7','S7a estado antigo não vale para o token novo: nenhum aviso de reconexão novo','1|1|1',
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I1 AND milestone = 'needs_reconnect')
    || '|' || pg_temp.avisos(U_GES_L, I1, 'needs_reconnect') || '|' || pg_temp.avisos(U_GER_A, I1, 'needs_reconnect'));

  -- ===========================================================================
  -- S8 — marco de 7 dias (I2, Conta A; validade 2026-11-23 00:00 UTC)
  -- ===========================================================================
  exp2 := public.instagram_parse_ts(pg_temp.cfg(I2) ->> 'tokenExpiresAt');
  PERFORM public.instagram_connection_alert_sweep(exp2 - interval '8 days', NULL);
  PERFORM pg_temp.afirma('S8','S8a faltando 8 dias: nada','0|0',
    pg_temp.avisos(U_GER_A, I2, 'expiring_7d') || '|' || pg_temp.avisos(U_GES_A, I2, 'expiring_7d'));
  PERFORM public.instagram_connection_alert_sweep(exp2 - interval '6 days', NULL);
  PERFORM pg_temp.afirma('S8','S8b faltando 6 dias: Gerente e Gestor da Conta recebem 1','1|1',
    pg_temp.avisos(U_GER_A, I2, 'expiring_7d') || '|' || pg_temp.avisos(U_GES_A, I2, 'expiring_7d'));
  PERFORM pg_temp.afirma('S8','S8c tipo warning','warning',
    (SELECT string_agg(DISTINCT type, ',') FROM public.notifications
      WHERE metadata ->> 'instance_id' = I2::text AND metadata ->> 'milestone' = 'expiring_7d'));
  PERFORM public.instagram_connection_alert_sweep(exp2 - interval '5 days', NULL);
  PERFORM public.instagram_connection_alert_sweep(exp2 - interval '1 hour', NULL);
  PERFORM pg_temp.afirma('S8','S8d faltando 5 dias e 1 hora: não repete','1|1',
    pg_temp.avisos(U_GER_A, I2, 'expiring_7d') || '|' || pg_temp.avisos(U_GES_A, I2, 'expiring_7d'));
  PERFORM pg_temp.afirma('S8','S8e não recebem: Gestor da Loja (instância é da Conta), Gestor inativo, Atendente','0|0|0',
    pg_temp.avisos(U_GES_L, I2, 'expiring_7d') || '|' || pg_temp.avisos(U_INAT, I2, 'expiring_7d') || '|' ||
    pg_temp.avisos(U_ATD_L, I2, 'expiring_7d'));

  -- ===========================================================================
  -- S9 — vencimento
  -- ===========================================================================
  PERFORM public.instagram_connection_alert_sweep(exp2 + interval '1 hour', NULL);
  PERFORM pg_temp.afirma('S9','S9a venceu: 1 aviso de vencimento cada, tipo error','1|1|error',
    pg_temp.avisos(U_GER_A, I2, 'expired') || '|' || pg_temp.avisos(U_GES_A, I2, 'expired') || '|' ||
    (SELECT string_agg(DISTINCT type, ',') FROM public.notifications
      WHERE metadata ->> 'instance_id' = I2::text AND metadata ->> 'milestone' = 'expired'));
  PERFORM public.instagram_connection_alert_sweep(exp2 + interval '1 day', NULL);
  PERFORM public.instagram_connection_alert_sweep(exp2 + interval '30 days', NULL);
  PERFORM pg_temp.afirma('S9','S9b dias depois: vencimento não repete, 7 dias não volta','1|1|1|1',
    pg_temp.avisos(U_GER_A, I2, 'expired') || '|' || pg_temp.avisos(U_GES_A, I2, 'expired') || '|' ||
    pg_temp.avisos(U_GER_A, I2, 'expiring_7d') || '|' || pg_temp.avisos(U_GES_A, I2, 'expiring_7d'));

  -- ===========================================================================
  -- S10 — novo ciclo: renovou, validade nova, o marco vale para o token novo
  -- ===========================================================================
  c := pg_temp.cfg(I2);
  res := public.instagram_token_renewal_record_success(I2, 'FIXTURE-TOKEN-I2-NOVO', 5184000, c ->> 'tokenIssuedAt', exp2 - interval '10 days');
  exp2 := public.instagram_parse_ts(pg_temp.cfg(I2) ->> 'tokenExpiresAt');
  PERFORM public.instagram_connection_alert_sweep(exp2 - interval '6 days', NULL);
  PERFORM public.instagram_connection_alert_sweep(exp2 - interval '5 days', NULL);
  PERFORM pg_temp.afirma('S10','S10a token novo: 7 dias sai de novo, uma vez (total 2 = 1 por token)','2|2',
    pg_temp.avisos(U_GER_A, I2, 'expiring_7d') || '|' || pg_temp.avisos(U_GES_A, I2, 'expiring_7d'));
  PERFORM pg_temp.afirma('S10','S10b marcas: 2 de 7 dias (uma por validade), 1 de vencimento','2|1',
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I2 AND milestone = 'expiring_7d')
    || '|' || (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I2 AND milestone = 'expired'));

  -- ===========================================================================
  -- S11 — quem nunca avisa
  -- ===========================================================================
  res := public.instagram_connection_alert_sweep('2026-12-31 00:00+00', NULL);
  PERFORM pg_temp.afirma('S11','S11a inativa, sem datas e WhatsApp: nenhuma marca','0|0|0',
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I3) || '|' ||
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I4) || '|' ||
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = W1));
  PERFORM pg_temp.afirma('S11','S11b varredura sem erro','0', res ->> 'errors');

  -- ===========================================================================
  -- S12 — Conta sem Gerente/Gestor
  -- ===========================================================================
  PERFORM pg_temp.afirma('S12','S12a marca de vencimento com 0 destinatários','1|0',
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I5 AND milestone = 'expired') || '|' ||
    (SELECT recipients::text FROM public.instagram_connection_alerts WHERE instance_id = I5 AND milestone = 'expired'));
  PERFORM public.instagram_connection_alert_sweep('2027-01-31 00:00+00', NULL);
  PERFORM pg_temp.afirma('S12','S12b e não tenta de novo','1',
    (SELECT count(*)::text FROM public.instagram_connection_alerts WHERE instance_id = I5));

  -- ===========================================================================
  -- S13 — o texto
  -- ===========================================================================
  SELECT title || ' || ' || message INTO txt FROM public.notifications
   WHERE user_id = U_GES_L AND metadata ->> 'milestone' = 'needs_reconnect' AND metadata ->> 'instance_id' = I1::text;
  PERFORM pg_temp.afirma('S13','S13a reconectar: título, conta, motivo, data de Brasília, contato',
    'O Instagram precisa ser reconectado || O ConvoFlow não conseguiu renovar a conexão do Instagram @fix_ig_loja. O Instagram não aceita mais o acesso atual desta conta. A conexão vale até 23/12/2026 às 06:19; depois disso, as respostas pelo Instagram param. Para reconectar, escreva para contato@convoflow.com.br.',
    txt);
  SELECT action_url || '|' || action_label INTO txt FROM public.notifications
   WHERE user_id = U_GES_L AND metadata ->> 'milestone' = 'needs_reconnect' AND metadata ->> 'instance_id' = I1::text;
  PERFORM pg_temp.afirma('S13','S13b leva para a tela','/dashboard/whatsapp-numbers|Ver conexão', txt);
  SELECT string_agg(title || ' || ' || message, ' ## ') INTO txt FROM public.notifications
   WHERE metadata ->> 'kind' = 'instagram_connection' AND tenant_id::text LIKE 'b9b9b9b9-%';
  PERFORM pg_temp.afirma('S13','S13c sem jargão (token, API, OAuth, webhook, cron, expires)','0',
    (SELECT count(*)::text FROM regexp_matches(lower(txt), '(token|\mapi\M|oauth|webhook|cron|expires|renewal)', 'g')));
  SELECT message INTO txt FROM public.notifications
   WHERE user_id = U_GER_A AND metadata ->> 'milestone' = 'expired' AND metadata ->> 'instance_id' = I2::text;
  PERFORM pg_temp.afirma('S13','S13d vencimento em pt-BR simples',
    'A conexão do Instagram @fix_ig_conta venceu em 22/11/2026 às 21:00. As respostas pelo Instagram estão paradas até a conta ser reconectada. Para reconectar, escreva para contato@convoflow.com.br.',
    txt);

  -- ===========================================================================
  -- S14 — o disparo (nada sai: o ROLLBACK tira da fila do pg_net)
  -- ===========================================================================
  DELETE FROM vault.secrets WHERE name = 'instagram_token_renewal_cron_secret';
  BEGIN
    PERFORM public.instagram_token_renewal_kick(NULL, true, false);
    txt := 'não levantou';
  EXCEPTION WHEN OTHERS THEN
    txt := CASE WHEN SQLERRM LIKE '%instagram_token_renewal_cron_secret%RUNBOOK_instagram_renovacao%'
                THEN 'levantou com instrução' ELSE 'levantou: ' || SQLERRM END;
  END;
  PERFORM pg_temp.afirma('S14','S14a sem segredo no Vault: levanta e diz o que fazer','levantou com instrução', txt);
  PERFORM pg_temp.afirma('S14','S14b sem segredo: a função de leitura devolve nada','<null>',
    public.instagram_token_renewal_cron_secret());

  PERFORM vault.create_secret(repeat('ab', 32), 'instagram_token_renewal_cron_secret', 'fixture da suíte');
  n := public.instagram_token_renewal_kick(I1, true, true);
  SELECT q.url || '|' || (q.headers ->> 'x-cron-secret') || '|' ||
         (convert_from(q.body, 'UTF8')::jsonb ->> 'dryRun') || '|' ||
         (convert_from(q.body, 'UTF8')::jsonb ->> 'ignoreWindow') || '|' ||
         (convert_from(q.body, 'UTF8')::jsonb ->> 'instanceId') || '|' ||
         q.timeout_milliseconds::text || '|' || coalesce(q.headers ->> 'Authorization', '<sem anon>')
    INTO txt
    FROM net.http_request_queue q WHERE q.id = n;
  PERFORM pg_temp.afirma('S14','S14c um pedido para a função, com o segredo e sem chave anon',
    'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/instagram-token-renewal|' || repeat('ab', 32)
      || '|true|true|' || I1::text || '|60000|<sem anon>',
    txt);
  PERFORM pg_temp.afirma('S14','S14d a leitura do segredo devolve o do Vault','true',
    (public.instagram_token_renewal_cron_secret() = repeat('ab', 32))::text);

  -- ===========================================================================
  -- S15 — nada mais muda
  -- ===========================================================================
  PERFORM pg_temp.afirma('S15','S15a EncaixaRH intocada', (SELECT encaixa FROM _s_antes),
    concat_ws('|',
      (SELECT count(*) FROM public.contacts      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
      (SELECT count(*) FROM public.conversations WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
      (SELECT count(*) FROM public.messages      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
      (SELECT count(*) FROM public.notifications WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
      (SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) FROM public.whatsapp_instances w
        WHERE w.tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a')));
  PERFORM pg_temp.afirma('S15','S15b instâncias de fora da fixture intocadas', (SELECT instancias FROM _s_antes),
    (SELECT md5(string_agg(w::text, '|' ORDER BY w.id)) FROM public.whatsapp_instances w
      WHERE w.id::text NOT LIKE 'b9b9b9b9-%'));
  PERFORM pg_temp.afirma('S15','S15c triggers de mensagens/contatos/conversas/instâncias iguais', (SELECT triggers FROM _s_antes),
    (SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname))
       FROM pg_trigger t
      WHERE NOT t.tgisinternal
        AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass,
                          'public.conversations'::regclass, 'public.whatsapp_instances'::regclass)));
  PERFORM pg_temp.afirma('S15','S15d funções de entrada, saída e cofre iguais', (SELECT funcoes FROM _s_antes),
    (SELECT md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY p.oid::regprocedure::text))
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public'
        AND p.proname IN ('process_instagram_message', 'process_incoming_message', 'update_conversation_on_message',
                          'handle_message_conversation', 'set_instance_meta_token', 'get_instance_meta_token',
                          'response_rule_admin_user_ids', 'delete_whatsapp_instance')));
END
$bateria$;

-- -----------------------------------------------------------------------------
-- 4. Placar (uma consulta só: o conector devolve a última)
-- -----------------------------------------------------------------------------
SELECT seq, grupo, check_kind, expected, actual, status,
       count(*) FILTER (WHERE status = 'ok')   OVER () AS ok,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS fail,
       CASE WHEN count(*) FILTER (WHERE status = 'FAIL') OVER () = 0
            THEN 'VERDE' ELSE 'VERMELHO' END           AS placar
  FROM _s_results
 ORDER BY (status = 'ok'), seq;

ROLLBACK;
