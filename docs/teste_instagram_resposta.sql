-- =============================================================================
-- teste_instagram_resposta.sql — rede de segurança da migração
-- 20260923000002_instagram_reply (fatia 3/5 do Instagram: responder).
--
-- O QUE FAZ
--   Semeia UMA Conta falsa com uma instância de Instagram, uma de WhatsApp, a
--   Gerente (quem responde) e o Gestor (outro usuário da mesma Conta). Cada
--   cenário usa um cliente próprio (IGSID próprio), para um não contaminar o
--   outro. "O navegador" é simulado como no app: INSERT e UPDATE com o papel
--   authenticated e o JWT da Gerente — as triggers de autor e de participante
--   rodam de verdade, e a RLS vale.
--
--   R0  Estrutura e permissões: tabela de casamentos sem acesso para
--       authenticated; janela e reconciliação executáveis por authenticated,
--       não por anon; process_instagram_message só service_role.
--   R1  UPDATE do navegador antes do eco, ids IGUAIS  → 1 linha, autor.
--   R2  UPDATE antes do eco, ids DIFERENTES          → 1 linha, autor.
--   R3  Eco antes do UPDATE, ids IGUAIS              → 1 linha, autor.
--   R4  Eco antes do UPDATE, ids DIFERENTES          → 1 linha, autor.
--   R5  Eco antes, SEM casar (texto diferente), ids iguais → o UPDATE bate no
--       índice único e o conflito é resolvido por reconcile_instagram_send.
--   R6  A API não ecoa                               → 1 linha.
--   R7  Só casa quando casa: texto diferente, linha velha, outro contato,
--       linha já casada, eco do celular, linha 'failed', linha do WhatsApp —
--       nenhuma é tomada.
--   R8  Duas respostas iguais seguidas, dois ecos    → cada eco casa uma.
--   R9  reconcile_instagram_send: só o autor; mid de outra linha não é tomado;
--       idempotente.
--   R10 Janela de 24 h por contato: sem mensagem, 23 h, 25 h, a última vale,
--       eco não abre janela, RLS de outra Conta.
--   R11 Nada muda para o WhatsApp: is_within_service_window,
--       process_incoming_message e as triggers de messages/contacts/
--       conversations com o mesmo md5 de antes da migração.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo b8b8b8b8-.
--   Guarda de colisão antes de semear. O token de fixture vai para o Vault e
--   sai no ROLLBACK.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o conector de escrita), o arquivo inteiro
--   de uma vez. O placar é a ÚLTIMA consulta: cada linha é uma afirmação, e
--   as colunas ok/fail/placar repetem o total em todas as linhas.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM logo abaixo da semeadura: ele desliga o
--   casamento do eco (troca o LIMIT 1 da busca por LIMIT 0), dentro da
--   transação. Medido em 2026-09-23 — exatamente 12 FAIL:
--     R2b R2c R2e R2f   (ids diferentes, UPDATE antes: 2 linhas)
--     R3a R3b R3c       (eco antes: não casa; o UPDATE bate no índice e a
--                        reconciliação FUNDE — R3d segue com UMA linha)
--     R4a R4c R4e       (ids diferentes, eco antes: 2 linhas)
--     R8a R8b           (dois ecos, dois envios iguais: 4 linhas)
--   R3d verde de propósito: é a rede reconcile_instagram_send funcionando
--   sozinha quando os ids são iguais. R7 inteiro verde de propósito: ele prova
--   que o casamento NÃO acontece onde não deve, e a sabotagem só tira casamento.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guarda de colisão
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants  WHERE id::text LIKE 'b8b8b8b8-%')
  OR EXISTS (SELECT 1 FROM public.whatsapp_instances
              WHERE connection_config ->> 'igAccountId' = '17841400000000301') THEN
    RAISE EXCEPTION 'ABORTADO: já existe fixture b8b8b8b8- ou a conta de Instagram de fixture. Limpe antes.';
  END IF;
  IF to_regprocedure('public.reconcile_instagram_send(uuid,text)') IS NULL
  OR to_regprocedure('public.instagram_reply_window(uuid)') IS NULL
  OR to_regclass('public.instagram_echo_claims') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260923000002 não está aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('b8b8b8b8-0000-4000-8000-00000000000a','authenticated','authenticated','fix-r-gerente@fixture.invalid', now(), now()),
  ('b8b8b8b8-0000-4000-8000-00000000000b','authenticated','authenticated','fix-r-gestor@fixture.invalid',  now(), now()),
  ('b8b8b8b8-0000-4000-8000-00000000000c','authenticated','authenticated','fix-r-outra@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('b8b8b8b8-0000-4000-8000-000000000001','FIXTURE Conta R','fixture-conta-r','account', NULL,'active','active','{}'),
  ('b8b8b8b8-0000-4000-8000-000000000009','FIXTURE Outra R','fixture-outra-r','account', NULL,'active','active','{}');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('b8b8b8b8-0000-4000-8000-0000000000fa','b8b8b8b8-0000-4000-8000-00000000000a','b8b8b8b8-0000-4000-8000-000000000001','gerente', NULL,'active','FIX','Gerente','2026-01-01 10:00+00'),
  ('b8b8b8b8-0000-4000-8000-0000000000fb','b8b8b8b8-0000-4000-8000-00000000000b','b8b8b8b8-0000-4000-8000-000000000001','gestor','b8b8b8b8-0000-4000-8000-0000000000fa','active','FIX','Gestor','2026-01-01 10:01+00'),
  ('b8b8b8b8-0000-4000-8000-0000000000fc','b8b8b8b8-0000-4000-8000-00000000000c','b8b8b8b8-0000-4000-8000-000000000009','gerente', NULL,'active','FIX','Outra','2026-01-01 10:02+00');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('b8b8b8b8-aaaa-4000-8000-000000000001','b8b8b8b8-0000-4000-8000-000000000001','FIX instancia WA R','fix-key-r-wa');

SET LOCAL session_replication_role = origin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- SABOTAGEM (MODO AUTO-TESTE) — descomente o bloco inteiro: desliga o
-- casamento do eco dentro da transação. O ROLLBACK desfaz.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- DO $sab$
-- DECLARE
--   v_def text := pg_get_functiondef('public.process_instagram_message(text,text,text,text,text,boolean)'::regprocedure);
--   v_old constant text := E'LIMIT 1\n     FOR UPDATE OF m;';
-- BEGIN
--   IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
--     RAISE EXCEPTION 'SABOTAGEM: âncora não encontrada exatamente uma vez.';
--   END IF;
--   EXECUTE replace(v_def, v_old, E'LIMIT 0\n     FOR UPDATE OF m;');
-- END
-- $sab$;

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _r_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _r_results TO authenticated;
GRANT USAGE ON SEQUENCE _r_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _r_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;
-- Volta a "ninguém logado" — é como o webhook roda (service_role, sem sub).
-- Sem isto o JWT da Gerente sobra na transação e o eco simulado ganharia
-- autor, o que em produção nunca acontece.
CREATE FUNCTION pg_temp.ninguem() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '', true);
$f$;

-- O navegador grava a resposta: 'pending', sem mid, created_at do BANCO (é o
-- que o caminho do Instagram no ChatWindow faz). Roda como authenticated.
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

-- O navegador depois do envio: UPDATE status + mid; em 23505, chama a
-- reconciliação — exatamente o que sendInstagramReply faz.
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

-- Resumo das saídas de um contato: "n|mid|status|autor" da(s) linha(s) outbound.
CREATE FUNCTION pg_temp.saidas(p_contact uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
  SELECT count(*)::text FROM public.messages m WHERE m.contact_id = p_contact AND m.direction = 'outbound';
$f$;
CREATE FUNCTION pg_temp.linha(p_msg uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
  SELECT coalesce(m.evolution_message_id, '-') || '|' || coalesce(m.status, '-') || '|' ||
         coalesce(p.last_name, '-')
    FROM public.messages m LEFT JOIN public.profiles p ON p.id = m.sender_profile_id
   WHERE m.id = p_msg;
$f$;
CREATE FUNCTION pg_temp.casamento(p_mid text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
  SELECT coalesce((SELECT c.kind || '>' || c.message_id::text FROM public.instagram_echo_claims c WHERE c.mid = p_mid), '-');
$f$;
CREATE FUNCTION pg_temp.participantes(p_contact uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
  SELECT coalesce(string_agg(p.last_name, ',' ORDER BY p.last_name), '-')
    FROM public.conversation_participants cp
    JOIN public.conversations cv ON cv.id = cp.conversation_id
    JOIN public.profiles p ON p.id = cp.profile_id
   WHERE cv.contact_id = p_contact;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  CONTA   constant uuid := 'b8b8b8b8-0000-4000-8000-000000000001';
  WA_INST constant uuid := 'b8b8b8b8-aaaa-4000-8000-000000000001';
  U_GER   constant uuid := 'b8b8b8b8-0000-4000-8000-00000000000a';
  U_GES   constant uuid := 'b8b8b8b8-0000-4000-8000-00000000000b';
  U_OUTRA constant uuid := 'b8b8b8b8-0000-4000-8000-00000000000c';
  ACC     constant text := '17841400000000301';
  ig      uuid;
  c       uuid;
  c2      uuid;
  r1      uuid;
  r2      uuid;
  wa_c    uuid;
  wa_m    uuid;
  res     jsonb;
  txt     text;
  n       bigint;
BEGIN
  -- Instância de Instagram pelo procedimento de operador da fatia 2.
  res := public.create_instagram_instance(CONTA, 'FIX IG R', ACC, 'fixture_r', 'IGFIXTUREtokenR0123456789');
  ig := (res ->> 'instance_id')::uuid;

  -- ===========================================================================
  -- R0 — estrutura e permissões
  -- ===========================================================================
  PERFORM pg_temp.afirma('R0','R0a instagram_echo_claims: authenticated SELECT/INSERT','false|false',
    has_table_privilege('authenticated', 'public.instagram_echo_claims', 'SELECT')::text || '|' ||
    has_table_privilege('authenticated', 'public.instagram_echo_claims', 'INSERT')::text);
  PERFORM pg_temp.afirma('R0','R0b instagram_reply_window: anon/authenticated/service_role','false|true|true',
    has_function_privilege('anon', 'public.instagram_reply_window(uuid)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.instagram_reply_window(uuid)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.instagram_reply_window(uuid)', 'EXECUTE')::text);
  PERFORM pg_temp.afirma('R0','R0c reconcile_instagram_send: anon/authenticated','false|true',
    has_function_privilege('anon', 'public.reconcile_instagram_send(uuid,text)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.reconcile_instagram_send(uuid,text)', 'EXECUTE')::text);
  PERFORM pg_temp.afirma('R0','R0d process_instagram_message: anon/authenticated/service_role','false|false|true',
    has_function_privilege('anon', 'public.process_instagram_message(text,text,text,text,text,boolean)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.process_instagram_message(text,text,text,text,text,boolean)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.process_instagram_message(text,text,text,text,text,boolean)', 'EXECUTE')::text);
  SELECT relrowsecurity::text INTO txt FROM pg_class WHERE oid = 'public.instagram_echo_claims'::regclass;
  PERFORM pg_temp.afirma('R0','R0e instagram_echo_claims com RLS ligada','true', txt);

  -- ===========================================================================
  -- R1 — UPDATE do navegador ANTES do eco, ids IGUAIS
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000301', ACC, 'mid-r1-in', 'oi, quero saber o preço', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000301';

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'Custa R$ 100');
  txt := pg_temp.navegador_update(r1, 'mid-r1-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R1','R1a UPDATE do navegador sem conflito','updated', txt);

  res := public.process_instagram_message(ACC, ACC, '9990000000000301', 'mid-r1-X', 'Custa R$ 100', true);
  PERFORM pg_temp.afirma('R1','R1b eco = duplicate, casado por mid','duplicate|mid_match', (res->>'outcome') || '|' || (res->>'reconciled'));
  PERFORM pg_temp.afirma('R1','R1c exatamente 1 linha de saída','1', pg_temp.saidas(c));
  PERFORM pg_temp.afirma('R1','R1d a linha: mid X, sent, autor Gerente','mid-r1-X|sent|Gerente', pg_temp.linha(r1));
  PERFORM pg_temp.afirma('R1','R1e participante registrado','Gerente', pg_temp.participantes(c));

  res := public.process_instagram_message(ACC, ACC, '9990000000000301', 'mid-r1-X', 'Custa R$ 100', true);
  PERFORM pg_temp.afirma('R1','R1f eco reentregue: continua 1 linha','duplicate|1', (res->>'outcome') || '|' || pg_temp.saidas(c));

  -- ===========================================================================
  -- R2 — UPDATE ANTES do eco, ids DIFERENTES
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000302', ACC, 'mid-r2-in', 'bom dia', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000302';

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'Bom dia! Como posso ajudar?');
  txt := pg_temp.navegador_update(r1, 'mid-r2-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R2','R2a UPDATE do navegador sem conflito','updated', txt);

  res := public.process_instagram_message(ACC, ACC, '9990000000000302', 'mid-r2-Y', 'Bom dia! Como posso ajudar?', true);
  PERFORM pg_temp.afirma('R2','R2b eco casou a linha já enviada','duplicate|claimed_sent', (res->>'outcome') || '|' || coalesce(res->>'reconciled','-'));
  PERFORM pg_temp.afirma('R2','R2c exatamente 1 linha de saída','1', pg_temp.saidas(c));
  PERFORM pg_temp.afirma('R2','R2d a linha: mid X (do envio), sent, autor Gerente','mid-r2-X|sent|Gerente', pg_temp.linha(r1));
  PERFORM pg_temp.afirma('R2','R2e o casamento guarda o mid do eco','claimed_sent>' || r1::text, pg_temp.casamento('mid-r2-Y'));
  res := public.process_instagram_message(ACC, ACC, '9990000000000302', 'mid-r2-Y', 'Bom dia! Como posso ajudar?', true);
  PERFORM pg_temp.afirma('R2','R2f eco reentregue: duplicate, continua 1 linha','duplicate|1', (res->>'outcome') || '|' || pg_temp.saidas(c));

  -- ===========================================================================
  -- R3 — eco ANTES do UPDATE, ids IGUAIS
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000303', ACC, 'mid-r3-in', 'tem vaga?', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000303';

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'Tem sim!');
  RESET ROLE; PERFORM pg_temp.ninguem();

  res := public.process_instagram_message(ACC, ACC, '9990000000000303', 'mid-r3-XY', 'Tem sim!', true);
  PERFORM pg_temp.afirma('R3','R3a eco casou a linha pendente','duplicate|claimed_pending', (res->>'outcome') || '|' || coalesce(res->>'reconciled','-'));
  PERFORM pg_temp.afirma('R3','R3b a linha já tem o mid e virou sent','mid-r3-XY|sent|Gerente', pg_temp.linha(r1));

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  txt := pg_temp.navegador_update(r1, 'mid-r3-XY');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R3','R3c UPDATE com o MESMO mid na MESMA linha: sem conflito','updated', txt);
  PERFORM pg_temp.afirma('R3','R3d exatamente 1 linha de saída','1', pg_temp.saidas(c));
  PERFORM pg_temp.afirma('R3','R3e autor e participante','mid-r3-XY|sent|Gerente|Gerente', pg_temp.linha(r1) || '|' || pg_temp.participantes(c));

  -- ===========================================================================
  -- R4 — eco ANTES do UPDATE, ids DIFERENTES
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000304', ACC, 'mid-r4-in', 'aceita cartão?', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000304';

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'Aceitamos, em até 3x.');
  RESET ROLE; PERFORM pg_temp.ninguem();

  res := public.process_instagram_message(ACC, ACC, '9990000000000304', 'mid-r4-Y', 'Aceitamos, em até 3x.', true);
  PERFORM pg_temp.afirma('R4','R4a eco casou a linha pendente','duplicate|claimed_pending', (res->>'outcome') || '|' || coalesce(res->>'reconciled','-'));

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  txt := pg_temp.navegador_update(r1, 'mid-r4-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R4','R4b UPDATE troca Y por X sem conflito','updated', txt);
  PERFORM pg_temp.afirma('R4','R4c exatamente 1 linha de saída','1', pg_temp.saidas(c));
  PERFORM pg_temp.afirma('R4','R4d a linha: mid X, sent, autor Gerente','mid-r4-X|sent|Gerente', pg_temp.linha(r1));
  res := public.process_instagram_message(ACC, ACC, '9990000000000304', 'mid-r4-Y', 'Aceitamos, em até 3x.', true);
  PERFORM pg_temp.afirma('R4','R4e eco Y reentregue depois da troca: duplicate, 1 linha','duplicate|already_claimed|1',
    (res->>'outcome') || '|' || coalesce(res->>'reconciled','-') || '|' || pg_temp.saidas(c));

  -- ===========================================================================
  -- R5 — eco antes, SEM casar (texto diferente), ids iguais → 23505 tratado
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000305', ACC, 'mid-r5-in', 'entregam?', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000305';

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'Entregamos sim');
  RESET ROLE; PERFORM pg_temp.ninguem();

  -- A Meta devolve o texto diferente (hipótese): o casamento NÃO pode acontecer.
  res := public.process_instagram_message(ACC, ACC, '9990000000000305', 'mid-r5-XY', 'Entregamos sim 🙂', true);
  PERFORM pg_temp.afirma('R5','R5a texto diferente: o eco NÃO casa, grava a linha dele','stored|2', (res->>'outcome') || '|' || pg_temp.saidas(c));

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  txt := pg_temp.navegador_update(r1, 'mid-r5-XY');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R5','R5b o UPDATE bateu no índice e a reconciliação fundiu','conflito:merged', txt);
  PERFORM pg_temp.afirma('R5','R5c exatamente 1 linha de saída','1', pg_temp.saidas(c));
  PERFORM pg_temp.afirma('R5','R5d sobrou a do navegador: mid, sent, autor Gerente','mid-r5-XY|sent|Gerente', pg_temp.linha(r1));
  PERFORM pg_temp.afirma('R5','R5e casamento registrado como fusão','merged_by_browser>' || r1::text, pg_temp.casamento('mid-r5-XY'));
  res := public.process_instagram_message(ACC, ACC, '9990000000000305', 'mid-r5-XY', 'Entregamos sim 🙂', true);
  PERFORM pg_temp.afirma('R5','R5f eco reentregue: duplicate, 1 linha','duplicate|1', (res->>'outcome') || '|' || pg_temp.saidas(c));

  -- ===========================================================================
  -- R6 — a API não ecoa
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000306', ACC, 'mid-r6-in', 'oi', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000306';
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'Olá!');
  txt := pg_temp.navegador_update(r1, 'mid-r6-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R6','R6a sem eco: 1 linha, mid X, autor','1|mid-r6-X|sent|Gerente', pg_temp.saidas(c) || '|' || pg_temp.linha(r1));

  -- ===========================================================================
  -- R7 — só casa quando casa
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000307', ACC, 'mid-r7-in', 'olá', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000307';

  -- (a) linha pendente VELHA (3 min) não é tomada
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'velha');
  RESET ROLE; PERFORM pg_temp.ninguem();
  UPDATE public.messages SET created_at = now() - interval '3 minutes' WHERE id = r1;
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7a', 'velha', true);
  PERFORM pg_temp.afirma('R7','R7a pendente de 3 min atrás não é tomada','stored|-|pending|Gerente', (res->>'outcome') || '|' || pg_temp.linha(r1));

  -- (b) pendente de OUTRO contato, mesmo texto, não é tomada
  PERFORM public.process_instagram_message(ACC, '9990000000000308', ACC, 'mid-r7b-in', 'oi', false);
  SELECT id INTO c2 FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000308';
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r2 := pg_temp.navegador_insere(CONTA, ig, c2, 'mesmo texto');
  RESET ROLE; PERFORM pg_temp.ninguem();
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7b', 'mesmo texto', true);
  PERFORM pg_temp.afirma('R7','R7b pendente de outro contato não é tomada','stored|-|pending|Gerente', (res->>'outcome') || '|' || pg_temp.linha(r2));

  -- (c) linha JÁ casada não é tomada de novo (o celular manda o mesmo texto)
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'ok');
  txt := pg_temp.navegador_update(r1, 'mid-r7c-X');
  RESET ROLE; PERFORM pg_temp.ninguem();
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7c-X', 'ok', true);   -- o eco dela
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7c-cel', 'ok', true); -- "ok" pelo celular
  PERFORM pg_temp.afirma('R7','R7c o "ok" do celular vira linha própria','stored', res->>'outcome');
  SELECT count(*) INTO n FROM public.messages WHERE contact_id = c AND content = 'ok' AND direction = 'outbound';
  PERFORM pg_temp.afirma('R7','R7d duas mensagens "ok" reais = duas linhas','2', n::text);

  -- (d) eco do celular (sem autor) não é casável por outro eco
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7d-1', 'pelo celular', true);
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7d-2', 'pelo celular', true);
  SELECT count(*) INTO n FROM public.messages WHERE contact_id = c AND content = 'pelo celular';
  PERFORM pg_temp.afirma('R7','R7e dois ecos do celular = duas linhas','stored|2', (res->>'outcome') || '|' || n::text);

  -- (e) linha 'failed' não é tomada
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'falhou');
  UPDATE public.messages SET status = 'failed' WHERE id = r1 AND evolution_message_id IS NULL;
  RESET ROLE; PERFORM pg_temp.ninguem();
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7e', 'falhou', true);
  PERFORM pg_temp.afirma('R7','R7f linha failed não é tomada','stored|-|failed|Gerente', (res->>'outcome') || '|' || pg_temp.linha(r1));

  -- (f) linha pendente do WHATSAPP com o mesmo texto: intocada
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.contacts (id, tenant_id, name, phone, channel, external_id)
  VALUES ('b8b8b8b8-cccc-4000-8000-000000000001', CONTA, 'FIX WA', '5511999990301', 'whatsapp', '5511999990301')
  RETURNING id INTO wa_c;
  SET LOCAL session_replication_role = origin;
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  wa_m := pg_temp.navegador_insere(CONTA, WA_INST, wa_c, 'texto do whatsapp');
  RESET ROLE; PERFORM pg_temp.ninguem();
  res := public.process_instagram_message(ACC, ACC, '9990000000000307', 'mid-r7f', 'texto do whatsapp', true);
  PERFORM pg_temp.afirma('R7','R7g pendente do WhatsApp intocada (e canal whatsapp)','stored|-|pending|Gerente|whatsapp',
    (res->>'outcome') || '|' || pg_temp.linha(wa_m) || '|' || (SELECT channel FROM public.messages WHERE id = wa_m));

  -- ===========================================================================
  -- R8 — duas respostas iguais seguidas, dois ecos
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000309', ACC, 'mid-r8-in', 'obrigado', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000309';
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'De nada!');
  r2 := pg_temp.navegador_insere(CONTA, ig, c, 'De nada!');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM public.process_instagram_message(ACC, ACC, '9990000000000309', 'mid-r8-1', 'De nada!', true);
  PERFORM public.process_instagram_message(ACC, ACC, '9990000000000309', 'mid-r8-2', 'De nada!', true);
  PERFORM pg_temp.afirma('R8','R8a cada eco casou uma linha','2|claimed_pending|claimed_pending',
    pg_temp.saidas(c) || '|' || split_part(pg_temp.casamento('mid-r8-1'), '>', 1) || '|' || split_part(pg_temp.casamento('mid-r8-2'), '>', 1));
  SELECT count(DISTINCT c2.message_id)::text INTO txt FROM public.instagram_echo_claims c2 WHERE c2.mid IN ('mid-r8-1','mid-r8-2');
  PERFORM pg_temp.afirma('R8','R8b os dois casamentos apontam para linhas diferentes','2', txt);

  -- ===========================================================================
  -- R9 — reconcile_instagram_send: autoria, mid alheio, idempotência
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000310', ACC, 'mid-r9-in', 'e aí', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000310';
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  r1 := pg_temp.navegador_insere(CONTA, ig, c, 'Oi!');
  RESET ROLE; PERFORM pg_temp.ninguem();

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GES);
  res := public.reconcile_instagram_send(r1, 'mid-r9-x');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R9','R9a outro usuário da Conta não reconcilia a linha da Gerente','not_author|-|pending|Gerente',
    (res->>'outcome') || '|' || pg_temp.linha(r1));

  -- mid que é de uma mensagem RECEBIDA: não é o eco dela, nada é tocado
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  res := public.reconcile_instagram_send(r1, 'mid-r9-in');
  RESET ROLE; PERFORM pg_temp.ninguem();
  SELECT count(*) INTO n FROM public.messages WHERE evolution_message_id = 'mid-r9-in';
  PERFORM pg_temp.afirma('R9','R9b mid de outra linha (recebida): conflict_foreign, nada apagado','conflict_foreign|1|-|pending|Gerente',
    (res->>'outcome') || '|' || n::text || '|' || pg_temp.linha(r1));

  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  res := public.reconcile_instagram_send(r1, 'mid-r9-livre');
  txt := res->>'outcome';
  res := public.reconcile_instagram_send(r1, 'mid-r9-livre');
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R9','R9c mid livre: attached, depois already','attached|already|mid-r9-livre|sent|Gerente',
    txt || '|' || (res->>'outcome') || '|' || pg_temp.linha(r1));

  -- ===========================================================================
  -- R10 — janela de 24 h por contato
  -- ===========================================================================
  PERFORM public.process_instagram_message(ACC, '9990000000000311', ACC, 'mid-r10-in1', 'primeira', false);
  SELECT id INTO c FROM public.contacts WHERE tenant_id = CONTA AND channel = 'instagram' AND external_id = '9990000000000311';

  -- contato sem nenhuma mensagem recebida (criado à mão)
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.contacts (id, tenant_id, name, phone, channel, external_id)
  VALUES ('b8b8b8b8-cccc-4000-8000-000000000002', CONTA, NULL, NULL, 'instagram', '9990000000000312')
  RETURNING id INTO c2;
  SET LOCAL session_replication_role = origin;
  res := public.instagram_reply_window(c2);
  PERFORM pg_temp.afirma('R10','R10a sem mensagem do cliente: fechada, sem data','false|<null>',
    (res->>'open') || '|' || coalesce(res->>'last_inbound_at', '<null>'));

  UPDATE public.messages SET created_at = now() - interval '23 hours' WHERE evolution_message_id = 'mid-r10-in1';
  res := public.instagram_reply_window(c);
  PERFORM pg_temp.afirma('R10','R10b última do cliente há 23 h: aberta, fecha em +1 h','true|true',
    (res->>'open') || '|' || ((res->>'closes_at')::timestamptz = now() + interval '1 hour')::text);

  UPDATE public.messages SET created_at = now() - interval '25 hours' WHERE evolution_message_id = 'mid-r10-in1';
  res := public.instagram_reply_window(c);
  PERFORM pg_temp.afirma('R10','R10c última do cliente há 25 h: fechada','false', res->>'open');

  -- eco (resposta do negócio) há 1 min NÃO reabre
  PERFORM public.process_instagram_message(ACC, ACC, '9990000000000311', 'mid-r10-eco', 'resposta pelo celular', true);
  res := public.instagram_reply_window(c);
  PERFORM pg_temp.afirma('R10','R10d resposta do negócio não abre a janela','false', res->>'open');

  -- o cliente escreve de novo: a ÚLTIMA vale
  PERFORM public.process_instagram_message(ACC, '9990000000000311', ACC, 'mid-r10-in2', 'segunda', false);
  res := public.instagram_reply_window(c);
  PERFORM pg_temp.afirma('R10','R10e o cliente escreveu de novo: aberta','true', res->>'open');

  -- na sessão de quem responde (RLS): a Gerente vê aberta; a de OUTRA Conta, fechada
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GER);
  res := public.instagram_reply_window(c);
  txt := res->>'open';
  PERFORM pg_temp.como(U_OUTRA);
  res := public.instagram_reply_window(c);
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma('R10','R10f Gerente vê aberta; usuário de outra Conta vê fechada (RLS)','true|false', txt || '|' || (res->>'open'));

  -- ===========================================================================
  -- R11 — nada muda para o WhatsApp (md5 medidos ANTES da migração, 2026-09-23)
  -- ===========================================================================
  PERFORM pg_temp.afirma('R11','R11a is_within_service_window idêntica','e9404b551da89e5c0806d6596455b465',
    md5(pg_get_functiondef('public.is_within_service_window(uuid,text)'::regprocedure)));
  SELECT md5(string_agg(pg_get_functiondef(p.oid), '|' ORDER BY pg_get_function_identity_arguments(p.oid))) INTO txt
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'process_incoming_message';
  PERFORM pg_temp.afirma('R11','R11b process_incoming_message idêntica','f833183e5f0d71dea10a8a0aa7351011', txt);
  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO txt
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);
  PERFORM pg_temp.afirma('R11','R11c triggers de messages/contacts/conversations idênticas','40a03ecff1f2fcb49c84b288787edc4b', txt);
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
  FROM _r_results
 ORDER BY (status = 'ok'), seq;

ROLLBACK;
