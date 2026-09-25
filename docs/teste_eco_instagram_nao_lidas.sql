-- =============================================================================
-- teste_eco_instagram_nao_lidas.sql — rede de segurança da migração
-- 20260925000004_instagram_echo_clears_unread (o eco zera as não lidas).
--
-- O QUE FAZ
--   Semeia UMA Loja falsa com uma conta de Instagram, uma instância de
--   WhatsApp e a Gerente (quem responde pelo inbox). Cada cenário usa um
--   cliente próprio (IGSID próprio). "A Meta" é a RPC chamada como o
--   instagram-webhook chama, com o horário da Meta em p_meta_ts; "o navegador"
--   é INSERT/UPDATE como authenticated com o JWT da Gerente.
--
--   Horários: pg_temp.ts(k) = now() - 1 h + k segundos. Dentro da transação
--   now() é constante, então toda mensagem nasce com created_at = now(); os
--   cenários de linha antiga recuam o created_at na mão.
--
--   E0  Estrutura e permissões: uma função só, com p_meta_ts DEFAULT NULL;
--       guarda e tabela fora do alcance de anon/authenticated.
--   E1  Resposta pelo app do celular zera; horário gravado em toda mensagem.
--   E2  Cliente escreveu DEPOIS da resposta e isso chegou ANTES do eco:
--       continua não lida (inclui empate no mesmo milissegundo).
--   E3  Cliente escreveu depois e isso chegou DEPOIS do eco: o eco zera, a
--       mensagem nova volta a contar.
--   E4  Linhas sem horário da Meta: eco sem horário nunca zera; horário
--       implausível vira NULL; linha antiga que chegou bem antes do eco é
--       zerada; linha sem horário que chegou perto ou depois do eco segura a
--       conversa; a borda de 5 min; reentrega completa o horário.
--   E5  Eco da resposta do inbox: casado por mid, por casamento (enviada e
--       pendente), e reentregas — todos passam pela guarda.
--   E6  WhatsApp intocado: conversa de WhatsApp da mesma Loja não muda, a
--       guarda recusa conversa de WhatsApp, a não lida do WhatsApp continua
--       subindo, funções/triggers do WhatsApp com o md5 de antes.
--   E7  EncaixaRH: nenhuma linha dela na tabela nova.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo e5e5e5e5-.
--   Guarda de colisão antes de semear. O token de fixture vai para o Vault e
--   sai no ROLLBACK.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o conector de escrita), o arquivo inteiro
--   de uma vez. O placar é a ÚLTIMA consulta.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM logo abaixo da semeadura: ele tira da guarda
--   a comparação de horários (`t.meta_ts >= p_echo_meta_ts OR `), dentro da
--   transação; sobra só a regra das linhas sem horário. O resultado medido
--   está no runbook docs/RUNBOOK_instagram_eco_nao_lidas.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guarda de colisão
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'e5e5e5e5-%')
  OR EXISTS (SELECT 1 FROM public.whatsapp_instances
              WHERE connection_config ->> 'igAccountId' = '17841400000000501') THEN
    RAISE EXCEPTION 'ABORTADO: já existe fixture e5e5e5e5- ou a conta de Instagram de fixture. Limpe antes.';
  END IF;
  IF to_regprocedure('public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)') IS NULL
  OR to_regprocedure('public.instagram_echo_mark_read(uuid,timestamptz)') IS NULL
  OR to_regclass('public.instagram_message_meta_times') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260925000004 não está aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('e5e5e5e5-0000-4000-8000-00000000000a','authenticated','authenticated','fix-e-gerente@fixture.invalid', now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('e5e5e5e5-0000-4000-8000-000000000001','FIXTURE Loja E','fixture-loja-e','store', NULL,'active','active','{}');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('e5e5e5e5-0000-4000-8000-0000000000fa','e5e5e5e5-0000-4000-8000-00000000000a','e5e5e5e5-0000-4000-8000-000000000001','gerente', NULL,'active','FIX','Gerente','2026-01-01 10:00+00');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('e5e5e5e5-aaaa-4000-8000-000000000001','e5e5e5e5-0000-4000-8000-000000000001','FIX instancia WA E','fix-key-e-wa');

SET LOCAL session_replication_role = origin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- SABOTAGEM (MODO AUTO-TESTE) — descomente o bloco inteiro: a guarda deixa de
-- comparar o horário da Meta. O ROLLBACK desfaz.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- DO $sab$
-- DECLARE
--   v_def text := pg_get_functiondef('public.instagram_echo_mark_read(uuid,timestamptz)'::regprocedure);
--   v_old constant text := 't.meta_ts >= p_echo_meta_ts OR ';
-- BEGIN
--   IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
--     RAISE EXCEPTION 'SABOTAGEM: âncora não encontrada exatamente uma vez.';
--   END IF;
--   EXECUTE replace(v_def, v_old, '');
-- END
-- $sab$;

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _e_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _e_results TO authenticated;
GRANT USAGE ON SEQUENCE _e_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _e_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;
-- Volta a "ninguém logado" — é como o webhook roda. Sem isto o eco simulado
-- ganharia autor (trg_set_message_sender), o que em produção nunca acontece.
CREATE FUNCTION pg_temp.ninguem() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '', true);
$f$;

-- Horário da Meta de fixture: now() - 1 h + k segundos.
CREATE FUNCTION pg_temp.ts(k int) RETURNS timestamptz LANGUAGE sql AS $f$
  SELECT now() - interval '1 hour' + make_interval(secs => k);
$f$;

-- A Meta: mensagem do cliente e eco, pelo mesmo caminho do instagram-webhook.
CREATE FUNCTION pg_temp.entra(p_igsid text, p_mid text, p_text text, k int) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT public.process_instagram_message('17841400000000501', p_igsid, '17841400000000501', p_mid, p_text, false, pg_temp.ts(k));
$f$;
CREATE FUNCTION pg_temp.eco(p_igsid text, p_mid text, p_text text, k int) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT public.process_instagram_message('17841400000000501', '17841400000000501', p_igsid, p_mid, p_text, true, pg_temp.ts(k));
$f$;

CREATE FUNCTION pg_temp.contato(p_igsid text) RETURNS uuid LANGUAGE sql AS $f$
  SELECT id FROM public.contacts
   WHERE tenant_id = 'e5e5e5e5-0000-4000-8000-000000000001' AND channel = 'instagram' AND external_id = p_igsid;
$f$;

-- Estado da conversa: "não lidas|última direção|aguardando". "aguardando" é a
-- regra da pílula e do selo (isAwaitingReplyRow / AWAITING_REPLY_FILTER).
CREATE FUNCTION pg_temp.conversa(p_contact uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT c.unread_count::text || '|' || coalesce(c.last_message_direction, '<null>') || '|' ||
         (coalesce(c.unread_count, 0) > 0
          OR c.last_message_direction IS NULL
          OR c.last_message_direction IN ('inbound', 'incoming'))::text
    FROM public.conversations c WHERE c.contact_id = p_contact;
$f$;

-- Horário gravado de uma mensagem: '<sem linha>', '<null>' ou 'ts(k)'.
CREATE FUNCTION pg_temp.hora_id(p_msg uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.instagram_message_meta_times t WHERE t.message_id = p_msg) THEN '<sem linha>'
    ELSE coalesce((SELECT 'ts(' || extract(epoch FROM (t.meta_ts - pg_temp.ts(0)))::int::text || ')'
                     FROM public.instagram_message_meta_times t WHERE t.message_id = p_msg), '<null>')
  END;
$f$;
CREATE FUNCTION pg_temp.hora(p_mid text) RETURNS text LANGUAGE sql AS $f$
  SELECT pg_temp.hora_id((SELECT id FROM public.messages WHERE evolution_message_id = p_mid));
$f$;

-- "Mensagem de antes desta mudança": sem linha de horário e com a chegada
-- recuada para p_chegada.
CREATE FUNCTION pg_temp.envelhece(p_mid text, p_chegada timestamptz) RETURNS void LANGUAGE sql AS $f$
  DELETE FROM public.instagram_message_meta_times
   WHERE message_id = (SELECT id FROM public.messages WHERE evolution_message_id = p_mid);
  UPDATE public.messages SET created_at = p_chegada WHERE evolution_message_id = p_mid;
$f$;

-- O navegador grava a resposta ('pending', sem mid) e depois o UPDATE do envio.
CREATE FUNCTION pg_temp.navegador_insere(p_tenant uuid, p_inst uuid, p_contact uuid, p_text text)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction,
                               message_type, content, status, is_from_bot)
  VALUES (p_tenant, p_inst, p_contact, 'outbound', 'text', p_text, 'pending', false)
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;
CREATE FUNCTION pg_temp.navegador_update(p_id uuid, p_mid text)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  BEGIN
    UPDATE public.messages SET status = 'sent', evolution_message_id = p_mid WHERE id = p_id;
    RETURN 'updated';
  EXCEPTION WHEN unique_violation THEN
    r := public.reconcile_instagram_send(p_id, p_mid);
    RETURN 'conflito:' || (r ->> 'outcome');
  END;
END $f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA    constant uuid := 'e5e5e5e5-0000-4000-8000-000000000001';
  WA_INST constant uuid := 'e5e5e5e5-aaaa-4000-8000-000000000001';
  U_GER   constant uuid := 'e5e5e5e5-0000-4000-8000-00000000000a';
  ACC     constant text := '17841400000000501';
  ENCAIXA constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  ig      uuid;
  c       uuid;
  r1      uuid;
  wa_c    uuid;
  wa_conv uuid;
  wa_row  text;
  res     jsonb;
  txt     text;
  n       bigint;
BEGIN
  res := public.create_instagram_instance(LOJA, 'FIX IG E', ACC, 'fixture_e', 'IGFIXTUREtokenE0123456789');
  ig := (res ->> 'instance_id')::uuid;

  -- WhatsApp da MESMA Loja, pelo caminho de sempre, antes de tudo: 2 não lidas.
  res := public.process_incoming_message('5551900000501', 'oi pelo zap', WA_INST, 'fix-e-wamid-1');
  wa_c := (res ->> 'contact_id')::uuid;
  PERFORM public.process_incoming_message('5551900000501', 'alguém?', WA_INST, 'fix-e-wamid-2');
  SELECT id, c0::text INTO wa_conv, wa_row FROM public.conversations c0 WHERE c0.contact_id = wa_c;

  -- ===========================================================================
  -- E0 — estrutura e permissões
  -- ===========================================================================
  SELECT count(*)::text || '|' ||
         bool_or(pg_get_function_arguments(p.oid) LIKE '%p_meta_ts timestamp with time zone DEFAULT NULL%')::text
    INTO txt
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'process_instagram_message';
  PERFORM pg_temp.afirma('E0','E0a uma process_instagram_message só, com p_meta_ts DEFAULT NULL','1|true', txt);
  PERFORM pg_temp.afirma('E0','E0b process_instagram_message: anon/authenticated/service_role','false|false|true',
    has_function_privilege('anon', 'public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)', 'EXECUTE')::text);
  PERFORM pg_temp.afirma('E0','E0c instagram_echo_mark_read: anon/authenticated/service_role','false|false|false',
    has_function_privilege('anon', 'public.instagram_echo_mark_read(uuid,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.instagram_echo_mark_read(uuid,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_echo_mark_read(uuid,timestamptz)', 'EXECUTE')::text);
  SELECT relrowsecurity::text INTO txt FROM pg_class WHERE oid = 'public.instagram_message_meta_times'::regclass;
  PERFORM pg_temp.afirma('E0','E0d tabela de horários: RLS ligada; authenticated/anon sem SELECT nem INSERT','true|false|false|false|false',
    txt || '|' ||
    has_table_privilege('authenticated', 'public.instagram_message_meta_times', 'SELECT')::text || '|' ||
    has_table_privilege('authenticated', 'public.instagram_message_meta_times', 'INSERT')::text || '|' ||
    has_table_privilege('anon', 'public.instagram_message_meta_times', 'SELECT')::text || '|' ||
    has_table_privilege('anon', 'public.instagram_message_meta_times', 'INSERT')::text);
  SELECT (a.attnotnull = false)::text INTO txt FROM pg_attribute a
   WHERE a.attrelid = 'public.instagram_message_meta_times'::regclass AND a.attname = 'meta_ts';
  PERFORM pg_temp.afirma('E0','E0e meta_ts é anulável','true', txt);

  -- ===========================================================================
  -- E1 — resposta pelo app do celular zera as não lidas
  -- ===========================================================================
  PERFORM pg_temp.entra('9990000000000501', 'e1-in-1', 'oi', 100);
  PERFORM pg_temp.entra('9990000000000501', 'e1-in-2', 'tem desconto?', 110);
  c := pg_temp.contato('9990000000000501');
  PERFORM pg_temp.afirma('E1','E1a antes do eco: 2 não lidas, aguardando','2|inbound|true', pg_temp.conversa(c));

  res := pg_temp.eco('9990000000000501', 'e1-eco', 'Tem sim, 10%', 200);
  PERFORM pg_temp.afirma('E1','E1b eco do celular: gravado e zerou','stored|outbound|cleared',
    (res->>'outcome') || '|' || (res->>'direction') || '|' || coalesce(res->>'unread', '-'));
  PERFORM pg_temp.afirma('E1','E1c depois: 0 não lidas, última nossa, fora de Aguardando','0|outbound|false', pg_temp.conversa(c));
  PERFORM pg_temp.afirma('E1','E1d horário da Meta gravado nas 3 (entrada e eco)','ts(100)|ts(110)|ts(200)',
    pg_temp.hora('e1-in-1') || '|' || pg_temp.hora('e1-in-2') || '|' || pg_temp.hora('e1-eco'));
  SELECT (updated_at = now())::text INTO txt FROM public.conversations WHERE contact_id = c;
  PERFORM pg_temp.afirma('E1','E1e updated_at da conversa = agora','true', txt);

  res := pg_temp.eco('9990000000000501', 'e1-eco-2', 'Qualquer dúvida, chama', 210);
  PERFORM pg_temp.afirma('E1','E1f segundo eco com nada a zerar: nothing_unread','stored|nothing_unread',
    (res->>'outcome') || '|' || coalesce(res->>'unread', '-'));

  PERFORM pg_temp.entra('9990000000000501', 'e1-in-3', 'ok obrigado', 220);
  PERFORM pg_temp.afirma('E1','E1g inbound normal: não lida sobe de novo (trigger intocada)','1|inbound|true', pg_temp.conversa(c));
  res := pg_temp.entra('9990000000000501', 'e1-in-4', 'mais uma', 230);
  PERFORM pg_temp.afirma('E1','E1h mensagem do cliente: stored, sem a chave unread (só eco passa pela guarda)','stored|false',
    (res->>'outcome') || '|' || (res ? 'unread')::text);

  -- ===========================================================================
  -- E2 — cliente escreveu DEPOIS da resposta; chegou ANTES do eco
  -- ===========================================================================
  PERFORM pg_temp.entra('9990000000000502', 'e2-in-1', 'oi', 100);
  PERFORM pg_temp.entra('9990000000000502', 'e2-in-2', 'ainda está aí?', 300);  -- depois da resposta (200)
  c := pg_temp.contato('9990000000000502');
  res := pg_temp.eco('9990000000000502', 'e2-eco', 'Estou sim!', 200);
  PERFORM pg_temp.afirma('E2','E2a eco gravado mas NÃO zera: later_inbound','stored|later_inbound',
    (res->>'outcome') || '|' || coalesce(res->>'unread', '-'));
  PERFORM pg_temp.afirma('E2','E2b continua 2 não lidas, em Aguardando','2|outbound|true', pg_temp.conversa(c));

  -- Empate no milissegundo: não dá para saber a ordem, então segura.
  PERFORM pg_temp.entra('9990000000000503', 'e2t-in-1', 'oi', 100);
  PERFORM pg_temp.entra('9990000000000503', 'e2t-in-2', 'mesmo instante', 200);
  c := pg_temp.contato('9990000000000503');
  res := pg_temp.eco('9990000000000503', 'e2t-eco', 'resposta', 200);
  PERFORM pg_temp.afirma('E2','E2c empate de horário com a mensagem do cliente: não zera','later_inbound|2|outbound|true',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- ===========================================================================
  -- E3 — cliente escreveu depois; chegou DEPOIS do eco
  -- ===========================================================================
  PERFORM pg_temp.entra('9990000000000504', 'e3-in-1', 'oi', 100);
  c := pg_temp.contato('9990000000000504');
  res := pg_temp.eco('9990000000000504', 'e3-eco', 'Olá!', 200);
  PERFORM pg_temp.afirma('E3','E3a eco zera','cleared|0|outbound|false', coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));
  PERFORM pg_temp.entra('9990000000000504', 'e3-in-2', 'quanto custa?', 300);
  PERFORM pg_temp.afirma('E3','E3b a mensagem nova fica não lida e volta a Aguardando','1|inbound|true', pg_temp.conversa(c));

  -- Entrega atrasada: escrita ANTES da resposta (150), chegou depois do eco.
  -- Fica não lida: é o lado seguro (quem respondeu pelo celular pode não ter visto).
  PERFORM pg_temp.entra('9990000000000505', 'e3d-in-1', 'oi', 100);
  c := pg_temp.contato('9990000000000505');
  PERFORM pg_temp.eco('9990000000000505', 'e3d-eco', 'Olá!', 200);
  PERFORM pg_temp.entra('9990000000000505', 'e3d-in-2', 'atrasada', 150);
  PERFORM pg_temp.afirma('E3','E3c entrega atrasada (escrita antes, chegou depois do eco): não lida','1|inbound|true', pg_temp.conversa(c));

  -- ===========================================================================
  -- E4 — linhas sem horário da Meta
  -- ===========================================================================
  -- a) eco sem horário (o webhook antigo chamava com 6 argumentos)
  PERFORM pg_temp.entra('9990000000000506', 'e4a-in', 'oi', 100);
  c := pg_temp.contato('9990000000000506');
  res := public.process_instagram_message(ACC, ACC, '9990000000000506', 'e4a-eco', 'resposta', true);
  PERFORM pg_temp.afirma('E4','E4a eco SEM horário (6 argumentos): gravado, não zera','stored|no_meta_time|1|outbound|true',
    (res->>'outcome') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));
  PERFORM pg_temp.afirma('E4','E4b ...e a linha de horário existe com NULL','<null>', pg_temp.hora('e4a-eco'));

  -- b) horário implausível (1970, ou 2 dias no futuro) vira NULL
  PERFORM pg_temp.entra('9990000000000507', 'e4b-in', 'oi', 100);
  c := pg_temp.contato('9990000000000507');
  res := public.process_instagram_message(ACC, ACC, '9990000000000507', 'e4b-eco-1', 'r1', true, timestamptz '1970-01-21 10:00:00+00');
  txt := coalesce(res->>'unread', '-');
  res := public.process_instagram_message(ACC, ACC, '9990000000000507', 'e4b-eco-2', 'r2', true, now() + interval '2 days');
  PERFORM pg_temp.afirma('E4','E4c horário de 1970 e de 2 dias à frente: não zera, gravado NULL',
    'no_meta_time|no_meta_time|<null>|<null>|1|outbound|true',
    txt || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.hora('e4b-eco-1') || '|' || pg_temp.hora('e4b-eco-2')
    || '|' || pg_temp.conversa(c));

  -- c) linha de ANTES desta mudança (sem linha de horário), que chegou bem
  --    antes da resposta: a resposta nova zera — é a pendência que ela responde.
  PERFORM public.process_instagram_message(ACC, '9990000000000508', ACC, 'e4c-in', 'oi, alguém?', false);
  PERFORM pg_temp.envelhece('e4c-in', now() - interval '3 hours');
  c := pg_temp.contato('9990000000000508');
  PERFORM pg_temp.afirma('E4','E4d linha antiga: sem linha de horário, 1 não lida','<sem linha>|1|inbound|true',
    pg_temp.hora('e4c-in') || '|' || pg_temp.conversa(c));
  res := pg_temp.eco('9990000000000508', 'e4c-eco', 'Oi! Desculpe a demora', 200);
  PERFORM pg_temp.afirma('E4','E4e linha antiga, chegou 2 h antes do eco: zera','cleared|0|outbound|false',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- d) linha sem linha de horário que chegou DEPOIS do horário do eco: segura
  PERFORM public.process_instagram_message(ACC, '9990000000000509', ACC, 'e4d-in', 'oi', false);
  PERFORM pg_temp.envelhece('e4d-in', now());
  c := pg_temp.contato('9990000000000509');
  res := pg_temp.eco('9990000000000509', 'e4d-eco', 'resposta', 200);
  PERFORM pg_temp.afirma('E4','E4f sem linha de horário, chegou depois do eco: NÃO zera','later_inbound|1|outbound|true',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- e) linha de horário com NULL (entrega sem horário), recente: segura
  PERFORM public.process_instagram_message(ACC, '9990000000000510', ACC, 'e4e-in', 'oi', false);
  c := pg_temp.contato('9990000000000510');
  res := pg_temp.eco('9990000000000510', 'e4e-eco', 'resposta', 200);
  PERFORM pg_temp.afirma('E4','E4g horário NULL, chegou depois do eco: NÃO zera','<null>|later_inbound|1|outbound|true',
    pg_temp.hora('e4e-in') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- f) uma antiga (provada antes) + uma sem horário recente: a recente segura
  PERFORM public.process_instagram_message(ACC, '9990000000000511', ACC, 'e4f-in-1', 'oi', false);
  PERFORM pg_temp.envelhece('e4f-in-1', now() - interval '3 hours');
  PERFORM public.process_instagram_message(ACC, '9990000000000511', ACC, 'e4f-in-2', 'e aí?', false);
  c := pg_temp.contato('9990000000000511');
  res := pg_temp.eco('9990000000000511', 'e4f-eco', 'resposta', 200);
  PERFORM pg_temp.afirma('E4','E4h antiga + recente sem horário: NÃO zera','later_inbound|2|outbound|true',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- g) a borda de 5 min, para linha sem horário: 6 min antes do eco zera,
  --    4 min antes segura (pode ser diferença de relógio Meta x banco).
  PERFORM public.process_instagram_message(ACC, '9990000000000512', ACC, 'e4g-in', 'oi', false);
  PERFORM pg_temp.envelhece('e4g-in', pg_temp.ts(200) - interval '6 minutes');
  c := pg_temp.contato('9990000000000512');
  res := pg_temp.eco('9990000000000512', 'e4g-eco', 'resposta', 200);
  PERFORM pg_temp.afirma('E4','E4i sem horário, chegou 6 min antes do eco: zera','cleared|0|outbound|false',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));
  PERFORM public.process_instagram_message(ACC, '9990000000000513', ACC, 'e4h-in', 'oi', false);
  PERFORM pg_temp.envelhece('e4h-in', pg_temp.ts(200) - interval '4 minutes');
  c := pg_temp.contato('9990000000000513');
  res := pg_temp.eco('9990000000000513', 'e4h-eco', 'resposta', 200);
  PERFORM pg_temp.afirma('E4','E4j sem horário, chegou 4 min antes do eco: NÃO zera','later_inbound|1|outbound|true',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- h) mensagem COM horário posterior ao eco, com a chegada recuada 3 h (só
  --    com relógio do banco atrasado): o horário manda, não a chegada
  PERFORM pg_temp.entra('9990000000000514', 'e4i-in', 'oi', 300);
  UPDATE public.messages SET created_at = now() - interval '3 hours' WHERE evolution_message_id = 'e4i-in';
  c := pg_temp.contato('9990000000000514');
  res := pg_temp.eco('9990000000000514', 'e4i-eco', 'resposta', 200);
  PERFORM pg_temp.afirma('E4','E4k horário do cliente posterior ao eco, chegada antiga: NÃO zera','later_inbound|1|outbound|true',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- i) reentrega completa o horário que faltou, e não troca o que já existe
  PERFORM public.process_instagram_message(ACC, '9990000000000515', ACC, 'e4j-in', 'oi', false);
  PERFORM pg_temp.afirma('E4','E4l primeira entrega sem horário','<null>', pg_temp.hora('e4j-in'));
  res := pg_temp.entra('9990000000000515', 'e4j-in', 'oi', 100);
  PERFORM pg_temp.afirma('E4','E4m reentrega com horário: duplicate e completa','duplicate|ts(100)',
    (res->>'outcome') || '|' || pg_temp.hora('e4j-in'));
  PERFORM pg_temp.entra('9990000000000515', 'e4j-in', 'oi', 999);
  PERFORM pg_temp.afirma('E4','E4n nova reentrega não troca o horário','ts(100)', pg_temp.hora('e4j-in'));

  -- ===========================================================================
  -- E5 — eco da resposta do INBOX
  -- ===========================================================================
  -- a) casado por mid (UPDATE do navegador antes, ids iguais)
  PERFORM pg_temp.entra('9990000000000520', 'e5a-in', 'quanto custa?', 100);
  c := pg_temp.contato('9990000000000520');
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(LOJA, ig, c, 'Custa R$ 100');
  txt := pg_temp.navegador_update(r1, 'e5a-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('E5','E5a resposta do inbox gravada; não lida ainda 1 (não abriu)','updated|1|outbound|true',
    txt || '|' || pg_temp.conversa(c));
  res := pg_temp.eco('9990000000000520', 'e5a-X', 'Custa R$ 100', 200);
  PERFORM pg_temp.afirma('E5','E5b eco casado por mid: zera','duplicate|mid_match|cleared|0|outbound|false',
    (res->>'outcome') || '|' || coalesce(res->>'reconciled', '-') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));
  PERFORM pg_temp.afirma('E5','E5c a linha do navegador recebe o horário do eco','ts(200)', pg_temp.hora_id(r1));

  -- b) casamento com a linha já enviada (ids diferentes)
  PERFORM pg_temp.entra('9990000000000521', 'e5b-in', 'bom dia', 100);
  c := pg_temp.contato('9990000000000521');
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(LOJA, ig, c, 'Bom dia!');
  PERFORM pg_temp.navegador_update(r1, 'e5b-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  res := pg_temp.eco('9990000000000521', 'e5b-Y', 'Bom dia!', 200);
  PERFORM pg_temp.afirma('E5','E5d eco casado com a linha enviada: zera','duplicate|claimed_sent|cleared|0|outbound|false',
    (res->>'outcome') || '|' || coalesce(res->>'reconciled', '-') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- reentrega do mesmo eco depois que o cliente escreveu de novo: não zera
  PERFORM pg_temp.entra('9990000000000521', 'e5b-in-2', 'obrigado!', 300);
  res := pg_temp.eco('9990000000000521', 'e5b-Y', 'Bom dia!', 200);
  PERFORM pg_temp.afirma('E5','E5e reentrega do eco casado, cliente escreveu depois: não zera',
    'already_claimed|customer_spoke_last|1|inbound|true',
    coalesce(res->>'reconciled', '-') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- c) casamento com a linha pendente (eco antes do UPDATE)
  PERFORM pg_temp.entra('9990000000000522', 'e5c-in', 'tem vaga?', 100);
  c := pg_temp.contato('9990000000000522');
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(LOJA, ig, c, 'Tem sim!');
  RESET ROLE; PERFORM pg_temp.ninguem();
  res := pg_temp.eco('9990000000000522', 'e5c-XY', 'Tem sim!', 200);
  PERFORM pg_temp.afirma('E5','E5f eco casado com a linha pendente: zera','duplicate|claimed_pending|cleared|0|outbound|false',
    (res->>'outcome') || '|' || coalesce(res->>'reconciled', '-') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  txt := pg_temp.navegador_update(r1, 'e5c-XY');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('E5','E5g o UPDATE do navegador depois não muda nada','updated|0|outbound|false',
    txt || '|' || pg_temp.conversa(c));

  -- d) mensagem do cliente chegou depois da linha do navegador e antes do eco
  --    (escrita depois da resposta): a conversa é do cliente; não zera
  PERFORM pg_temp.entra('9990000000000523', 'e5d-in', 'oi', 100);
  c := pg_temp.contato('9990000000000523');
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(LOJA, ig, c, 'Olá!');
  PERFORM pg_temp.navegador_update(r1, 'e5d-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.entra('9990000000000523', 'e5d-in-2', 'e o preço?', 300);
  res := pg_temp.eco('9990000000000523', 'e5d-X', 'Olá!', 200);
  PERFORM pg_temp.afirma('E5','E5h cliente falou depois da resposta do inbox: não zera',
    'mid_match|customer_spoke_last|2|inbound|true',
    coalesce(res->>'reconciled', '-') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- e) o mesmo, com a mensagem do cliente escrita ANTES da resposta mas chegando
  --    depois da linha do navegador: a última chegada é do cliente; não zera
  --    (decisão: zerar deixaria "0 não lidas" com a conversa em Aguardando).
  PERFORM pg_temp.entra('9990000000000524', 'e5e-in', 'oi', 100);
  c := pg_temp.contato('9990000000000524');
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(LOJA, ig, c, 'Olá!');
  PERFORM pg_temp.navegador_update(r1, 'e5e-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.entra('9990000000000524', 'e5e-in-2', 'cruzou', 150);
  res := pg_temp.eco('9990000000000524', 'e5e-X', 'Olá!', 200);
  PERFORM pg_temp.afirma('E5','E5i mensagem cruzou com a resposta do inbox: não zera','customer_spoke_last|2|inbound|true',
    coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- f) defensivo: horário do cliente posterior ao do eco, mesmo com a linha do
  --    navegador sendo a última chegada (só com relógio torto) — o horário segura
  PERFORM pg_temp.entra('9990000000000525', 'e5f-in', 'oi', 300);
  c := pg_temp.contato('9990000000000525');
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(LOJA, ig, c, 'Olá!');
  PERFORM pg_temp.navegador_update(r1, 'e5f-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  res := pg_temp.eco('9990000000000525', 'e5f-X', 'Olá!', 200);
  PERFORM pg_temp.afirma('E5','E5j eco do inbox com mensagem do cliente de horário posterior: não zera',
    'mid_match|later_inbound|1|outbound|true',
    coalesce(res->>'reconciled', '-') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(c));

  -- g) reentrega do eco do CELULAR depois que o cliente escreveu de novo
  res := pg_temp.eco('9990000000000501', 'e1-eco', 'Tem sim, 10%', 200);
  PERFORM pg_temp.afirma('E5','E5k reentrega do eco do celular (E1), cliente escreveu depois: não zera',
    'duplicate|customer_spoke_last|2|inbound|true',
    (res->>'outcome') || '|' || coalesce(res->>'unread', '-') || '|' || pg_temp.conversa(pg_temp.contato('9990000000000501')));

  -- ===========================================================================
  -- E6 — WhatsApp intocado
  -- ===========================================================================
  SELECT c0::text INTO txt FROM public.conversations c0 WHERE c0.id = wa_conv;
  PERFORM pg_temp.afirma('E6','E6a conversa de WhatsApp da mesma Loja: idêntica depois de todos os ecos','true',
    (txt = wa_row)::text);
  PERFORM pg_temp.afirma('E6','E6b guarda chamada com conversa de WhatsApp: recusa','not_instagram',
    public.instagram_echo_mark_read(wa_conv, now()));
  SELECT c0::text INTO txt FROM public.conversations c0 WHERE c0.id = wa_conv;
  PERFORM pg_temp.afirma('E6','E6c ...e a conversa segue idêntica','true', (txt = wa_row)::text);
  PERFORM public.process_incoming_message('5551900000501', 'terceira', WA_INST, 'fix-e-wamid-3');
  SELECT unread_count || '|' || last_message_direction INTO txt FROM public.conversations WHERE id = wa_conv;
  PERFORM pg_temp.afirma('E6','E6d WhatsApp: não lida continua subindo pelo caminho de sempre','3|inbound', txt);
  SELECT count(*) INTO n FROM public.instagram_message_meta_times t JOIN public.messages m ON m.id = t.message_id
   WHERE m.channel IS DISTINCT FROM 'instagram';
  PERFORM pg_temp.afirma('E6','E6e nenhuma mensagem de WhatsApp na tabela de horários','0', n::text);
  SELECT md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY pg_get_function_identity_arguments(p.oid))) INTO txt
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'process_incoming_message';
  PERFORM pg_temp.afirma('E6','E6f process_incoming_message idêntica','f833183e5f0d71dea10a8a0aa7351011', txt);
  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO txt
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);
  PERFORM pg_temp.afirma('E6','E6g triggers de messages/contacts/conversations idênticas','40a03ecff1f2fcb49c84b288787edc4b', txt);
  PERFORM pg_temp.afirma('E6','E6h update_conversation_on_message idêntica','579f76a3f4b93cbfff742b2b59b8ce65',
    md5(pg_get_functiondef('public.update_conversation_on_message()'::regprocedure)));
  PERFORM pg_temp.afirma('E6','E6i reconcile_instagram_send idêntica','3af589bf9a34e49933c34d2bfb75a5ca',
    md5(pg_get_functiondef('public.reconcile_instagram_send(uuid,text)'::regprocedure)));

  -- ===========================================================================
  -- E7 — EncaixaRH
  -- ===========================================================================
  SELECT count(*) INTO n FROM public.instagram_message_meta_times t JOIN public.messages m ON m.id = t.message_id
   WHERE m.tenant_id = ENCAIXA;
  PERFORM pg_temp.afirma('E7','E7a nenhuma mensagem da EncaixaRH na tabela de horários','0', n::text);
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
  FROM _e_results
 ORDER BY (status = 'ok'), seq;

ROLLBACK;
