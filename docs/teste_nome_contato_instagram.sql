-- =============================================================================
-- teste_nome_contato_instagram.sql — rede de segurança da migração
-- 20260925000001_instagram_contact_profile (fatia 4a: o nome do cliente).
--
--   N0  Permissões: reservar e gravar só service_role; status fora da lista barrado.
--   N1  Reserva: pega o nunca tentado; ignora WhatsApp, ok, unavailable, retry
--       recente, pending recente; pega retry velho (> 6 h) e pending esquecido
--       (> 10 min). Marca 'pending' com a hora.
--   N2  Reserva só com a conexão atendendo: conta inativa, acesso vencido e
--       "precisa reconectar" do acesso atual ficam de fora; "precisa
--       reconectar" de um acesso JÁ trocado não segura nada.
--   N3  Reservar de novo logo em seguida não pega ninguém (duas abas).
--   N4  Gravar ok: @ sem arroba, nome só se o contato não tinha; nome digitado
--       nunca é sobrescrito. Gravar de novo: not_pending.
--   N5  unavailable, retry, release (volta a NULL, sem data).
--   N6  Mais de 50 por vez e status inválido levantam.
--   N7  Nada mais muda: contatos de fora da fixture e EncaixaRH.
--
-- SEGURANÇA: BEGIN ... ROLLBACK incondicional; fixture com prefixo c1c1c1c1-.
-- COMO RODAR: papel postgres, o arquivo inteiro; o placar é a última consulta.
-- =============================================================================

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'c1c1c1c1-%') THEN
    RAISE EXCEPTION 'ABORTADO: já existe fixture c1c1c1c1-. Limpe antes.';
  END IF;
  IF to_regprocedure('public.instagram_contact_profile_claim(uuid[],timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260925000001 não está aplicada.';
  END IF;
END
$guard$;

CREATE TEMP TABLE _n_antes ON COMMIT DROP AS
SELECT
  (SELECT md5(string_agg(c.id::text || '|' || coalesce(c.updated_at::text, '') || '|' || coalesce(c.name, ''), ',' ORDER BY c.id))
     FROM public.contacts c) AS contatos,
  (SELECT concat_ws('|',
     (SELECT count(*) FROM public.contacts      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
     (SELECT count(*) FROM public.conversations WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
     (SELECT count(*) FROM public.messages      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'))) AS encaixa;

SET LOCAL session_replication_role = replica;

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('c1c1c1c1-0000-4000-8000-000000000001','FIXTURE Loja N','fixture-loja-n','store', NULL,'active','active','{}');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, provider, status, is_active, connection_config) VALUES
  -- OK: acesso válido
  ('c1c1c1c1-aaaa-4000-8000-000000000001','c1c1c1c1-0000-4000-8000-000000000001','FIX IG ok','instagram_17841400000000601','instagram','connected',true,
   jsonb_build_object('igAccountId','17841400000000601','tokenIssuedAt','2026-09-25T00:00:00+00:00','tokenExpiresAt','2026-11-24T00:00:00+00:00')),
  -- inativa
  ('c1c1c1c1-aaaa-4000-8000-000000000002','c1c1c1c1-0000-4000-8000-000000000001','FIX IG inativa','instagram_17841400000000602','instagram','connected',false,
   jsonb_build_object('igAccountId','17841400000000602','tokenIssuedAt','2026-09-25T00:00:00+00:00','tokenExpiresAt','2026-11-24T00:00:00+00:00')),
  -- vencida
  ('c1c1c1c1-aaaa-4000-8000-000000000003','c1c1c1c1-0000-4000-8000-000000000001','FIX IG vencida','instagram_17841400000000603','instagram','connected',true,
   jsonb_build_object('igAccountId','17841400000000603','tokenIssuedAt','2026-01-01T00:00:00+00:00','tokenExpiresAt','2026-03-01T00:00:00+00:00')),
  -- precisa reconectar, do acesso ATUAL
  ('c1c1c1c1-aaaa-4000-8000-000000000004','c1c1c1c1-0000-4000-8000-000000000001','FIX IG reconectar','instagram_17841400000000604','instagram','connected',true,
   jsonb_build_object('igAccountId','17841400000000604','tokenIssuedAt','T1','tokenExpiresAt','2026-11-24T00:00:00+00:00',
                      'renewal', jsonb_build_object('status','needs_reconnect','forTokenIssuedAt','T1'))),
  -- precisa reconectar de um acesso JÁ trocado (não vale mais)
  ('c1c1c1c1-aaaa-4000-8000-000000000005','c1c1c1c1-0000-4000-8000-000000000001','FIX IG trocado','instagram_17841400000000605','instagram','connected',true,
   jsonb_build_object('igAccountId','17841400000000605','tokenIssuedAt','T2','tokenExpiresAt','2026-11-24T00:00:00+00:00',
                      'renewal', jsonb_build_object('status','needs_reconnect','forTokenIssuedAt','T1'))),
  -- WhatsApp
  ('c1c1c1c1-aaaa-4000-8000-000000000006','c1c1c1c1-0000-4000-8000-000000000001','FIX WA','fix-key-n-wa','official','open',true,'{}');

-- Contatos (NOW da suíte = 2026-09-25 15:00 UTC)
INSERT INTO public.contacts (id, tenant_id, channel, external_id, phone, name, whatsapp_instance_id, profile_status, profile_checked_at) VALUES
  ('c1c1c1c1-cccc-4000-8000-000000000001','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000001',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000001',NULL,NULL),
  ('c1c1c1c1-cccc-4000-8000-000000000002','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000002',NULL,'Nome Digitado','c1c1c1c1-aaaa-4000-8000-000000000001',NULL,NULL),
  ('c1c1c1c1-cccc-4000-8000-000000000003','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000003',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000001','ok','2026-09-01 00:00+00'),
  ('c1c1c1c1-cccc-4000-8000-000000000004','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000004',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000001','unavailable','2026-09-01 00:00+00'),
  ('c1c1c1c1-cccc-4000-8000-000000000005','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000005',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000001','retry','2026-09-25 10:00+00'),
  ('c1c1c1c1-cccc-4000-8000-000000000006','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000006',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000001','retry','2026-09-25 08:00+00'),
  ('c1c1c1c1-cccc-4000-8000-000000000007','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000007',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000001','pending','2026-09-25 14:55+00'),
  ('c1c1c1c1-cccc-4000-8000-000000000008','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000008',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000001','pending','2026-09-25 14:40+00'),
  ('c1c1c1c1-cccc-4000-8000-000000000009','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000009',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000002',NULL,NULL),
  ('c1c1c1c1-cccc-4000-8000-00000000000a','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000010',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000003',NULL,NULL),
  ('c1c1c1c1-cccc-4000-8000-00000000000b','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000011',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000004',NULL,NULL),
  ('c1c1c1c1-cccc-4000-8000-00000000000c','c1c1c1c1-0000-4000-8000-000000000001','instagram','900000000000012',NULL,NULL,        'c1c1c1c1-aaaa-4000-8000-000000000005',NULL,NULL),
  ('c1c1c1c1-cccc-4000-8000-00000000000d','c1c1c1c1-0000-4000-8000-000000000001','whatsapp','5511900000001','5511900000001',NULL,'c1c1c1c1-aaaa-4000-8000-000000000006',NULL,NULL);

SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE _n_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _n_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.st(p uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(profile_status, '<null>') || '|' || coalesce(profile_checked_at::text, '<null>')
    FROM public.contacts WHERE id = p;
$f$;

DO $bateria$
DECLARE
  NOW1 constant timestamptz := '2026-09-25 15:00:00+00';
  todos uuid[] := ARRAY(SELECT id FROM public.contacts WHERE id::text LIKE 'c1c1c1c1-cccc-%' ORDER BY id);
  pegos text;
  txt text;
BEGIN
  -- N0 --------------------------------------------------------------------
  PERFORM pg_temp.afirma('N0','N0a reservar e gravar: só service_role',
    'false|false|true|false|false|true',
    has_function_privilege('anon', 'public.instagram_contact_profile_claim(uuid[],timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.instagram_contact_profile_claim(uuid[],timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_contact_profile_claim(uuid[],timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('anon', 'public.instagram_contact_profile_record(uuid,text,text,text,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.instagram_contact_profile_record(uuid,text,text,text,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_contact_profile_record(uuid,text,text,text,timestamptz)', 'EXECUTE')::text);
  BEGIN
    UPDATE public.contacts SET profile_status = 'qualquer' WHERE id = 'c1c1c1c1-cccc-4000-8000-000000000001';
    txt := 'aceitou';
  EXCEPTION WHEN check_violation THEN
    txt := 'barrou';
  END;
  PERFORM pg_temp.afirma('N0','N0b profile_status fora da lista é barrado','barrou', txt);

  -- N1 + N2 ---------------------------------------------------------------
  SELECT string_agg(right(contact_id::text, 2) || ':' || igsid, ',' ORDER BY contact_id) INTO pegos
    FROM public.instagram_contact_profile_claim(todos, NOW1);
  -- 01 nunca tentado; 02 nunca tentado (tem nome, mas o @ ainda não);
  -- 06 retry de 7 h; 08 pending de 20 min; 0c reconectar de acesso já trocado.
  PERFORM pg_temp.afirma('N1','N1a pega exatamente os que estão na hora e com a conexão atendendo',
    '01:900000000000001,02:900000000000002,06:900000000000006,08:900000000000008,0c:900000000000012', pegos);
  PERFORM pg_temp.afirma('N1','N1b marca pending com a hora','pending|2026-09-25 15:00:00+00',
    pg_temp.st('c1c1c1c1-cccc-4000-8000-000000000001'));
  PERFORM pg_temp.afirma('N1','N1c ok/unavailable/retry recente/pending recente: intocados',
    'ok|unavailable|retry|pending',
    (SELECT profile_status FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000003') || '|' ||
    (SELECT profile_status FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000004') || '|' ||
    (SELECT profile_status FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000005') || '|' ||
    (SELECT profile_status || (CASE WHEN profile_checked_at = '2026-09-25 14:55+00' THEN '' ELSE '(mudou)' END)
       FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000007'));
  PERFORM pg_temp.afirma('N2','N2a conta inativa, acesso vencido, reconectar do acesso atual e WhatsApp: sem marca',
    '<null>|<null>|<null>|<null>|<null>|<null>|<null>|<null>',
    pg_temp.st('c1c1c1c1-cccc-4000-8000-000000000009') || '|' || pg_temp.st('c1c1c1c1-cccc-4000-8000-00000000000a') || '|' ||
    pg_temp.st('c1c1c1c1-cccc-4000-8000-00000000000b') || '|' || pg_temp.st('c1c1c1c1-cccc-4000-8000-00000000000d'));

  -- N3 --------------------------------------------------------------------
  SELECT count(*)::text INTO txt FROM public.instagram_contact_profile_claim(todos, NOW1 + interval '1 minute');
  PERFORM pg_temp.afirma('N3','N3a reservar de novo logo depois: ninguém (a outra aba já pegou)','0', txt);

  -- N4 --------------------------------------------------------------------
  txt := public.instagram_contact_profile_record('c1c1c1c1-cccc-4000-8000-000000000001', 'ok', 'Yuri Saldanha', '@yuri.s', NOW1);
  PERFORM pg_temp.afirma('N4','N4a ok: nome e @ sem arroba','recorded|Yuri Saldanha|yuri.s|ok',
    txt || '|' || (SELECT name || '|' || username || '|' || profile_status FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000001'));
  txt := public.instagram_contact_profile_record('c1c1c1c1-cccc-4000-8000-000000000002', 'ok', 'Nome do Instagram', 'fulano', NOW1);
  PERFORM pg_temp.afirma('N4','N4b nome digitado NÃO é sobrescrito; o @ entra','Nome Digitado|fulano',
    (SELECT name || '|' || username FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000002'));
  txt := public.instagram_contact_profile_record('c1c1c1c1-cccc-4000-8000-000000000001', 'ok', 'Outro', 'outro', NOW1);
  PERFORM pg_temp.afirma('N4','N4c gravar de novo (sem marca pending): not_pending, nada muda','not_pending|Yuri Saldanha|yuri.s',
    txt || '|' || (SELECT name || '|' || username FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000001'));

  -- N5 --------------------------------------------------------------------
  PERFORM public.instagram_contact_profile_record('c1c1c1c1-cccc-4000-8000-000000000006', 'unavailable', NULL, NULL, NOW1);
  PERFORM public.instagram_contact_profile_record('c1c1c1c1-cccc-4000-8000-000000000008', 'retry', NULL, NULL, NOW1);
  PERFORM public.instagram_contact_profile_record('c1c1c1c1-cccc-4000-8000-00000000000c', 'release', NULL, NULL, NOW1);
  PERFORM pg_temp.afirma('N5','N5a unavailable / retry com a hora / release volta a nada',
    'unavailable|2026-09-25 15:00:00+00|retry|2026-09-25 15:00:00+00|<null>|<null>',
    pg_temp.st('c1c1c1c1-cccc-4000-8000-000000000006') || '|' || pg_temp.st('c1c1c1c1-cccc-4000-8000-000000000008') || '|' ||
    pg_temp.st('c1c1c1c1-cccc-4000-8000-00000000000c'));
  PERFORM pg_temp.afirma('N5','N5b retry/unavailable/release não gravam nome nem @','<null>|<null>',
    (SELECT coalesce(name, '<null>') || '|' || coalesce(username, '<null>') FROM public.contacts WHERE id='c1c1c1c1-cccc-4000-8000-000000000006'));

  -- N6 --------------------------------------------------------------------
  BEGIN
    PERFORM public.instagram_contact_profile_record('c1c1c1c1-cccc-4000-8000-000000000001', 'talvez', NULL, NULL, NOW1);
    txt := 'não levantou';
  EXCEPTION WHEN OTHERS THEN txt := 'levantou';
  END;
  PERFORM pg_temp.afirma('N6','N6a status inválido levanta','levantou', txt);
  BEGIN
    PERFORM public.instagram_contact_profile_claim(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 51)), NOW1);
    txt := 'não levantou';
  EXCEPTION WHEN OTHERS THEN txt := 'levantou';
  END;
  PERFORM pg_temp.afirma('N6','N6b mais de 50 por vez levanta','levantou', txt);

  -- N7 --------------------------------------------------------------------
  PERFORM pg_temp.afirma('N7','N7a contatos de fora da fixture intocados', (SELECT contatos FROM _n_antes),
    (SELECT md5(string_agg(c.id::text || '|' || coalesce(c.updated_at::text, '') || '|' || coalesce(c.name, ''), ',' ORDER BY c.id))
       FROM public.contacts c WHERE c.id::text NOT LIKE 'c1c1c1c1-%'));
  PERFORM pg_temp.afirma('N7','N7b EncaixaRH intocada', (SELECT encaixa FROM _n_antes),
    concat_ws('|',
      (SELECT count(*) FROM public.contacts      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
      (SELECT count(*) FROM public.conversations WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a'),
      (SELECT count(*) FROM public.messages      WHERE tenant_id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a')));
END
$bateria$;

SELECT seq, grupo, check_kind, expected, actual, status,
       count(*) FILTER (WHERE status = 'ok')   OVER () AS ok,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS fail,
       CASE WHEN count(*) FILTER (WHERE status = 'FAIL') OVER () = 0
            THEN 'VERDE' ELSE 'VERMELHO' END           AS placar
  FROM _n_results
 ORDER BY (status = 'ok'), seq;

ROLLBACK;
