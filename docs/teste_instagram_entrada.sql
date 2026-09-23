-- =============================================================================
-- teste_instagram_entrada.sql — rede de segurança da migração
-- 20260923000001_instagram_inbound (fatia 2/5 do Instagram: receber).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta I + Loja I) com TUDO LIGADO — rodízio,
--   regra de tempo de resposta, um bot v1 que casa qualquer mensagem, um
--   webhook de saída assinando todos os eventos — e põe lado a lado uma
--   instância de WhatsApp e uma de Instagram. O controle é o WhatsApp: na
--   MESMA Loja, ele aciona cada uma das coisas que o Instagram não pode acionar.
--   Sem o controle, "não disparou" poderia significar só "a fixture não
--   dispara nada".
--
--   I0  Estrutura: messages.channel existe; as 8 triggers têm o gate de canal
--       e estão habilitadas; o rodízio segue o ÚLTIMO AFTER INSERT; o sweep tem
--       o predicado; toda mensagem REAL é 'whatsapp'.
--   I1  create_instagram_instance: cria provider='instagram', status
--       'connected' (nunca 'open'), igAccountId no connection_config, token no
--       Vault (lido de volta), validade = emissão + 60 dias; recusa conta
--       repetida e id malformado.
--   I2  Inbound do Instagram: contato (canal instagram, phone NULL,
--       external_id = IGSID), conversa (canal instagram), mensagem (canal
--       instagram, inbound, mid em evolution_message_id, status received),
--       unread 1, last_message_direction inbound.
--   I3  Idempotência: o MESMO mid duas vezes = UMA linha, unread não sobe, nada
--       de contato novo. Mid diferente do mesmo cliente = mesma conversa.
--   I4  Eco: grava outbound/sent, NÃO sobe unread, NÃO toca
--       last_interaction_at do contato, NUNCA cria contato (nem para a própria
--       conta, nem para quem nunca escreveu); eco repetido = duplicate.
--   I5  Conta desconhecida, instância inativa, campo vazio: nada é escrito
--       (contagem global de contacts/conversations/messages idêntica).
--   I6  NADA dispara para o Instagram, com tudo ligado: rodízio (conversa sem
--       dono), automações (zero pedido HTTP ao automation-processor), webhooks
--       de saída (zero entrega), bot (zero job, zero sessão), reset da regra de
--       tempo (contador intocado pelo eco), sweep da regra (conversa atribuída
--       à mão e esperando não é transferida).
--   I7  CONTROLE — WhatsApp na mesma Loja, pelo caminho de sempre
--       (process_incoming_message): retorno no formato de sempre, canal
--       whatsapp, unread 1, rodízio ATRIBUI, automação ENFILEIRA, webhook
--       ENTREGA, bot ENFILEIRA job, reset da regra ZERA, sweep TRANSFERE.
--   I8  Permissões: process_instagram_message só service_role;
--       create_instagram_instance só postgres; resolve_contact_by_channel não
--       é mais executável por authenticated (buraco da fatia 1).
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo b7b7b7b7-.
--   Guarda de colisão antes de semear. Nenhuma Conta real tem rodízio nem regra
--   ligados (conferido em 2026-09-23), então o sweep chamado aqui não acha
--   nada real — e o ROLLBACK desfaz de qualquer forma. Os pedidos HTTP que as
--   automações enfileiram em net.http_request_queue também somem no ROLLBACK:
--   o pg_net só lê a fila depois do COMMIT.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o conector de escrita), o arquivo inteiro
--   de uma vez. O placar sai no fim.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM logo abaixo da semeadura: ele tira TODOS os
--   gates (as 8 triggers e o predicado do sweep), dentro da transação.
--   Esperado: exatamente I0b, I0d, I6a, I6b, I6c, I6d, I6h e I6i viram FAIL —
--   cada garantia de "não dispara" tem uma afirmação que a sabotagem derruba.
--   I6e/I6f (bot) seguem verdes de propósito: nenhuma trigger chama o bot, e o
--   que elas provam é que a RPC do Instagram não chama.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guarda de colisão
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants  WHERE id::text LIKE 'b7b7b7b7-%')
  OR EXISTS (SELECT 1 FROM public.contacts WHERE id::text LIKE 'b7b7b7b7-%')
  OR EXISTS (SELECT 1 FROM public.whatsapp_instances
              WHERE connection_config ->> 'igAccountId' IN ('17841400000000001', '17841400000000999')) THEN
    RAISE EXCEPTION 'ABORTADO: já existe fixture b7b7b7b7- ou conta de Instagram de fixture. Limpe antes.';
  END IF;
  IF to_regprocedure('public.process_instagram_message(text,text,text,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260923000001 não está aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('b7b7b7b7-0000-4000-8000-00000000000a','authenticated','authenticated','fix-i-gerente@fixture.invalid', now(), now()),
  ('b7b7b7b7-0000-4000-8000-00000000000b','authenticated','authenticated','fix-i-gestor@fixture.invalid',  now(), now()),
  ('b7b7b7b7-0000-4000-8000-00000000000c','authenticated','authenticated','fix-i-ana@fixture.invalid',     now(), now()),
  ('b7b7b7b7-0000-4000-8000-00000000000d','authenticated','authenticated','fix-i-bruno@fixture.invalid',   now(), now());

-- Tudo ligado na Loja I: rodízio imediato + regra de 5 min (o mínimo aceito).
INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('b7b7b7b7-0000-4000-8000-000000000001','FIXTURE Conta I','fixture-conta-i','account', NULL,'active','active','{}'),
  ('b7b7b7b7-0000-4000-8000-000000000002','FIXTURE Loja I', 'fixture-loja-i', 'store','b7b7b7b7-0000-4000-8000-000000000001','active',NULL,
   '{"rotation_enabled": true, "rotation_timing": "immediate", "response_rule_enabled": true, "response_rule_minutes": 5, "response_rule_max_transfers": 3}');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('b7b7b7b7-0000-4000-8000-0000000000fa','b7b7b7b7-0000-4000-8000-00000000000a','b7b7b7b7-0000-4000-8000-000000000001','gerente',   NULL,'active','FIX','Gerente','2026-01-01 10:00+00'),
  ('b7b7b7b7-0000-4000-8000-0000000000fb','b7b7b7b7-0000-4000-8000-00000000000b','b7b7b7b7-0000-4000-8000-000000000002','gestor',   'b7b7b7b7-0000-4000-8000-0000000000fa','active','FIX','Gestor','2026-01-01 10:01+00'),
  ('b7b7b7b7-0000-4000-8000-0000000000fc','b7b7b7b7-0000-4000-8000-00000000000c','b7b7b7b7-0000-4000-8000-000000000002','atendente','b7b7b7b7-0000-4000-8000-0000000000fb','active','FIX','Ana','2026-01-01 10:02+00'),
  ('b7b7b7b7-0000-4000-8000-0000000000fd','b7b7b7b7-0000-4000-8000-00000000000d','b7b7b7b7-0000-4000-8000-000000000002','atendente','b7b7b7b7-0000-4000-8000-0000000000fb','active','FIX','Bruno','2026-01-01 10:03+00');

-- Sem linha em conversation_rotation o rodízio não tem para quem dar (e o
-- sweep escala em vez de transferir). Ana 50 / Bruno 50: o controle I7c/I7h
-- precisa que o rodízio FUNCIONE, senão I6a/I6i não provariam nada.
INSERT INTO public.conversation_rotation (tenant_id, profile_id, percent, credit) VALUES
  ('b7b7b7b7-0000-4000-8000-000000000002','b7b7b7b7-0000-4000-8000-0000000000fc', 50, 0),
  ('b7b7b7b7-0000-4000-8000-000000000002','b7b7b7b7-0000-4000-8000-0000000000fd', 50, 0);

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('b7b7b7b7-aaaa-4000-8000-000000000001','b7b7b7b7-0000-4000-8000-000000000002','FIX instancia WA I','fix-key-i-wa');

-- Bot v1 que casa QUALQUER mensagem, de qualquer instância da Loja.
INSERT INTO public.chatbots (id, tenant_id, whatsapp_instance_id, name, trigger_type, is_active, is_published, builder_version) VALUES
  ('b7b7b7b7-bbbb-4000-8000-000000000001','b7b7b7b7-0000-4000-8000-000000000002', NULL,'FIX bot I','all', true, true, 1);

-- Webhook de saída assinando tudo.
INSERT INTO public.webhooks (id, tenant_id, name, url, events, is_active) VALUES
  ('b7b7b7b7-eeee-4000-8000-000000000001','b7b7b7b7-0000-4000-8000-000000000002','FIX hook I','https://fixture.invalid/hook',
   ARRAY['message.received','message.sent','contact.created','contact.updated'], true);

SET LOCAL session_replication_role = origin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- SABOTAGEM (MODO AUTO-TESTE) — descomente o bloco inteiro: tira TODOS os gates
-- (as 8 triggers voltam à definição de antes e o sweep perde o predicado),
-- dentro da transação. O ROLLBACK desfaz.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- DO $sab$
-- BEGIN
--   DROP TRIGGER trg_automation_message_received ON public.messages;
--   CREATE TRIGGER trg_automation_message_received AFTER INSERT ON public.messages
--     FOR EACH ROW EXECUTE FUNCTION public.tg_automation_message_received();
--   DROP TRIGGER trg_webhook_messages ON public.messages;
--   CREATE TRIGGER trg_webhook_messages AFTER INSERT ON public.messages
--     FOR EACH ROW EXECUTE FUNCTION public.tg_webhook_messages();
--   DROP TRIGGER trg_response_rule_reset_on_human_reply ON public.messages;
--   CREATE TRIGGER trg_response_rule_reset_on_human_reply AFTER INSERT ON public.messages
--     FOR EACH ROW WHEN (NEW.direction = 'outbound' AND NEW.is_from_bot IS NOT TRUE AND NEW.source IS NULL AND NEW.conversation_id IS NOT NULL)
--     EXECUTE FUNCTION public.tg_response_rule_reset_on_human_reply();
--   DROP TRIGGER zz_rotation_assign_on_inbound ON public.messages;
--   CREATE TRIGGER zz_rotation_assign_on_inbound AFTER INSERT ON public.messages
--     FOR EACH ROW WHEN (NEW.direction = ANY (ARRAY['inbound','incoming']) AND NEW.conversation_id IS NOT NULL)
--     EXECUTE FUNCTION public.tg_rotation_assign_on_inbound();
--   DROP TRIGGER trg_automation_contact_created ON public.contacts;
--   CREATE TRIGGER trg_automation_contact_created AFTER INSERT ON public.contacts
--     FOR EACH ROW EXECUTE FUNCTION public.tg_automation_contact_created();
--   DROP TRIGGER trg_webhook_contact_created ON public.contacts;
--   CREATE TRIGGER trg_webhook_contact_created AFTER INSERT ON public.contacts
--     FOR EACH ROW EXECUTE FUNCTION public.tg_webhook_contact_created();
--   DROP TRIGGER trg_webhook_contact_updated ON public.contacts;
--   CREATE TRIGGER trg_webhook_contact_updated AFTER UPDATE ON public.contacts
--     FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.tg_webhook_contact_updated();
--   EXECUTE replace(pg_get_functiondef('public.response_rule_sweep(timestamptz)'::regprocedure),
--                   E'\n       AND c.channel = ''whatsapp''', '');
-- END
-- $sab$;

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _i_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _i_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, coalesce(p_actual, '<null>'),
          CASE WHEN p_expected = coalesce(p_actual, '<null>') THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.estado(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN '-';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$f$;

-- Pedidos HTTP enfileirados para o automation-processor que citam este contato.
CREATE FUNCTION pg_temp.automacoes(p_contact uuid) RETURNS bigint LANGUAGE sql AS $f$
  SELECT count(*) FROM net.http_request_queue q
   WHERE q.url LIKE '%/automation-processor'
     AND convert_from(q.body, 'UTF8') LIKE '%' || p_contact::text || '%';
$f$;

-- Entregas de webhook de saída da Loja I que citam este contato.
CREATE FUNCTION pg_temp.entregas(p_contact uuid) RETURNS bigint LANGUAGE sql AS $f$
  SELECT count(*) FROM public.webhook_deliveries d
   WHERE d.tenant_id = 'b7b7b7b7-0000-4000-8000-000000000002'
     AND d.payload::text LIKE '%' || p_contact::text || '%';
$f$;

-- Jobs do bot v1 para este contato.
CREATE FUNCTION pg_temp.jobs_bot(p_contact uuid) RETURNS bigint LANGUAGE sql AS $f$
  SELECT count(*) FROM public.job_queue j
   WHERE j.tenant_id = 'b7b7b7b7-0000-4000-8000-000000000002'
     AND j.job_type = 'chatbot_response'
     AND j.job_data ->> 'contactId' = p_contact::text;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA    constant uuid := 'b7b7b7b7-0000-4000-8000-000000000002';
  WA_INST constant uuid := 'b7b7b7b7-aaaa-4000-8000-000000000001';
  P_ANA   constant uuid := 'b7b7b7b7-0000-4000-8000-0000000000fc';
  ACC     constant text := '17841400000000001';   -- a conta profissional (entry.id)
  IGSID   constant text := '9990000000000001';    -- o cliente
  IGSID2  constant text := '9990000000000002';    -- alguém que nunca escreveu
  TOKEN   constant text := 'IGFIXTUREtoken0123456789';
  ig_inst uuid;
  r       jsonb;
  c_ig    uuid;
  conv_ig uuid;
  c_wa    uuid;
  conv_wa uuid;
  n       bigint;
  n2      bigint;
  n3      bigint;
  txt     text;
  ts      timestamptz;
  ts2     timestamptz;
BEGIN
  -- ===========================================================================
  -- I0 — estrutura
  -- ===========================================================================
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'channel'
     AND is_nullable = 'NO' AND column_default LIKE '''whatsapp''%';
  PERFORM pg_temp.afirma('I0','I0a messages.channel NOT NULL DEFAULT whatsapp','1', n::text);

  SELECT count(*) INTO n FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgenabled = 'O'
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass)
     AND t.tgname IN ('trg_automation_message_received','trg_webhook_messages',
                      'trg_response_rule_reset_on_human_reply','zz_rotation_assign_on_inbound',
                      'trg_automation_contact_created','trg_webhook_contact_created',
                      'trg_webhook_contact_updated','trg_automation_funnel_stage_changed')
     AND pg_get_triggerdef(t.oid) LIKE '%channel = ''whatsapp''%';
  PERFORM pg_temp.afirma('I0','I0b os 8 gates de canal presentes e habilitados','8', n::text);

  SELECT tgname INTO txt FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal
     AND tgtype & 1 = 1 AND tgtype & 4 = 4 AND tgtype & 2 = 0
   ORDER BY tgname DESC LIMIT 1;
  PERFORM pg_temp.afirma('I0','I0c o rodizio continua o ULTIMO AFTER INSERT','zz_rotation_assign_on_inbound', txt);

  SELECT (position('c.channel = ''whatsapp''' IN pg_get_functiondef('public.response_rule_sweep(timestamptz)'::regprocedure)) > 0)::text INTO txt;
  PERFORM pg_temp.afirma('I0','I0d o sweep da regra so varre conversas de WhatsApp','true', txt);

  SELECT count(*) INTO n FROM public.messages
   WHERE channel <> 'whatsapp' AND tenant_id::text NOT LIKE 'b7b7b7b7-%';
  PERFORM pg_temp.afirma('I0','I0e nenhuma mensagem REAL fora do canal whatsapp (antes do teste)','0', n::text);

  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal AND tgenabled = 'O'
     AND tgname = 'trg_messages_set_channel';
  PERFORM pg_temp.afirma('I0','I0f trigger de derivacao do canal da mensagem existe','1', n::text);

  -- ===========================================================================
  -- I1 — a instância
  -- ===========================================================================
  r := public.create_instagram_instance(LOJA, 'FIX Instagram I', ACC, '@fix_loja_i', TOKEN,
                                        '2026-09-23 12:00+00');
  ig_inst := (r ->> 'instance_id')::uuid;
  PERFORM pg_temp.afirma('I1','I1a devolve instance_id','true', (ig_inst IS NOT NULL)::text);

  SELECT provider || '|' || status || '|' || instance_key || '|' || (connection_config ->> 'igAccountId')
         || '|' || (connection_config ->> 'igUsername') || '|' || coalesce(is_active::text,'<null>')
    INTO txt FROM public.whatsapp_instances WHERE id = ig_inst;
  PERFORM pg_temp.afirma('I1','I1b provider/status/key/conta/usuario/ativa',
    'instagram|connected|instagram_' || ACC || '|' || ACC || '|fix_loja_i|true', txt);

  PERFORM pg_temp.afirma('I1','I1c token guardado no Vault e lido de volta', TOKEN,
    public.get_instance_meta_token(ig_inst));

  SELECT count(*) INTO n FROM public.whatsapp_instances
   WHERE id = ig_inst AND connection_config::text LIKE '%' || TOKEN || '%';
  PERFORM pg_temp.afirma('I1','I1d token NAO fica na tabela de instancias','0', n::text);

  SELECT (connection_config ->> 'tokenExpiresAt')::timestamptz INTO ts FROM public.whatsapp_instances WHERE id = ig_inst;
  PERFORM pg_temp.afirma('I1','I1e validade = emissao + 60 dias','2026-11-22 12:00:00+00',
    to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '+00');

  PERFORM pg_temp.afirma('I1','I1f mesma conta de novo e recusada (P0001)','P0001',
    pg_temp.estado(format('SELECT public.create_instagram_instance(%L, %L, %L, NULL, %L)', LOJA, 'dup', ACC, TOKEN)));
  PERFORM pg_temp.afirma('I1','I1g id de conta malformado e recusado (P0001)','P0001',
    pg_temp.estado(format('SELECT public.create_instagram_instance(%L, %L, %L, NULL, %L)', LOJA, 'x', 'abc', TOKEN)));
  PERFORM pg_temp.afirma('I1','I1h instancia instagram SEM igAccountId e recusada (23514)','23514',
    pg_temp.estado(format($q$INSERT INTO public.whatsapp_instances (tenant_id, name, instance_key, provider)
                           VALUES (%L, 'x', 'fix-i-sem-conta', 'instagram')$q$, LOJA)));

  -- ===========================================================================
  -- I2 — inbound
  -- ===========================================================================
  r := public.process_instagram_message(ACC, IGSID, ACC, 'fix-i-mid-1', 'oi, quero saber o preço', false);
  PERFORM pg_temp.afirma('I2','I2a outcome stored / inbound','stored|inbound', (r->>'outcome') || '|' || (r->>'direction'));

  c_ig    := (r ->> 'contact_id')::uuid;
  conv_ig := (r ->> 'conversation_id')::uuid;

  SELECT channel || '|' || coalesce(phone, '<null>') || '|' || external_id || '|' || tenant_id::text
    INTO txt FROM public.contacts WHERE id = c_ig;
  PERFORM pg_temp.afirma('I2','I2b contato: canal/telefone/identificador/Loja',
    'instagram|<null>|' || IGSID || '|' || LOJA::text, txt);

  SELECT channel || '|' || contact_id::text || '|' || whatsapp_instance_id::text
    INTO txt FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I2','I2c conversa: canal/contato/instancia',
    'instagram|' || c_ig::text || '|' || ig_inst::text, txt);

  SELECT channel || '|' || direction || '|' || status || '|' || message_type || '|' || content || '|'
         || coalesce(sender_profile_id::text, '<null>') || '|' || is_from_bot::text || '|' || coalesce(source, '<null>')
    INTO txt FROM public.messages WHERE evolution_message_id = 'fix-i-mid-1';
  PERFORM pg_temp.afirma('I2','I2d mensagem: canal/direcao/status/tipo/texto/autor/bot/origem',
    'instagram|inbound|received|text|oi, quero saber o preço|<null>|false|<null>', txt);

  SELECT unread_count || '|' || last_message_direction || '|' || last_message_content
    INTO txt FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I2','I2e conversa: nao lida 1, direcao inbound, previa',
    '1|inbound|oi, quero saber o preço', txt);

  -- ===========================================================================
  -- I3 — idempotência
  -- ===========================================================================
  r := public.process_instagram_message(ACC, IGSID, ACC, 'fix-i-mid-1', 'oi, quero saber o preço', false);
  PERFORM pg_temp.afirma('I3','I3a mesmo mid: duplicate','duplicate', r->>'outcome');

  SELECT count(*) INTO n FROM public.messages WHERE evolution_message_id = 'fix-i-mid-1';
  PERFORM pg_temp.afirma('I3','I3b mesmo mid: UMA linha','1', n::text);

  SELECT count(*) INTO n FROM public.contacts WHERE tenant_id = LOJA AND channel = 'instagram';
  PERFORM pg_temp.afirma('I3','I3c mesmo mid: nenhum contato novo','1', n::text);

  SELECT unread_count INTO n FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I3','I3d mesmo mid: nao lida continua 1','1', n::text);

  r := public.process_instagram_message(ACC, IGSID, ACC, 'fix-i-mid-2', 'alô?', false);
  PERFORM pg_temp.afirma('I3','I3e mid novo do mesmo cliente: mesma conversa e mesmo contato',
    conv_ig::text || '|' || c_ig::text, (r->>'conversation_id') || '|' || (r->>'contact_id'));
  SELECT unread_count INTO n FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I3','I3f mid novo: nao lida vai a 2','2', n::text);

  -- ===========================================================================
  -- I4 — eco
  -- ===========================================================================
  SELECT last_interaction_at INTO ts FROM public.contacts WHERE id = c_ig;

  r := public.process_instagram_message(ACC, ACC, IGSID, 'fix-i-mid-eco-1', 'respondi pelo celular', true);
  PERFORM pg_temp.afirma('I4','I4a eco: stored / outbound, na conversa do cliente',
    'stored|outbound|' || conv_ig::text, (r->>'outcome') || '|' || (r->>'direction') || '|' || (r->>'conversation_id'));

  SELECT channel || '|' || direction || '|' || status || '|' || coalesce(sender_profile_id::text, '<null>') || '|' || is_from_bot::text
    INTO txt FROM public.messages WHERE evolution_message_id = 'fix-i-mid-eco-1';
  PERFORM pg_temp.afirma('I4','I4b eco gravado como outbound/sent sem autor',
    'instagram|outbound|sent|<null>|false', txt);

  SELECT unread_count || '|' || last_message_direction INTO txt FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I4','I4c eco NAO sobe nao lida; conversa passa a outbound','2|outbound', txt);

  SELECT last_interaction_at INTO ts2 FROM public.contacts WHERE id = c_ig;
  PERFORM pg_temp.afirma('I4','I4d eco NAO toca last_interaction_at do contato','true', (ts IS NOT DISTINCT FROM ts2)::text);

  SELECT count(*) INTO n FROM public.contacts WHERE external_id = ACC;
  PERFORM pg_temp.afirma('I4','I4e nenhum contato para a propria conta','0', n::text);

  r := public.process_instagram_message(ACC, ACC, IGSID, 'fix-i-mid-eco-1', 'respondi pelo celular', true);
  PERFORM pg_temp.afirma('I4','I4f eco repetido: duplicate','duplicate', r->>'outcome');

  SELECT count(*) INTO n FROM public.contacts WHERE tenant_id = LOJA;
  r := public.process_instagram_message(ACC, ACC, IGSID2, 'fix-i-mid-eco-2', 'oi, vi seu perfil', true);
  PERFORM pg_temp.afirma('I4','I4g eco para quem nunca escreveu: echo_without_contact','echo_without_contact', r->>'outcome');
  SELECT count(*) INTO n2 FROM public.contacts WHERE tenant_id = LOJA;
  SELECT count(*) INTO n3 FROM public.messages WHERE evolution_message_id = 'fix-i-mid-eco-2';
  PERFORM pg_temp.afirma('I4','I4h ...e nao cria contato nem mensagem','0|0', (n2 - n)::text || '|' || n3::text);

  r := public.process_instagram_message(ACC, ACC, ACC, 'fix-i-mid-self', 'eu comigo', false);
  PERFORM pg_temp.afirma('I4','I4i inbound cujo remetente e a propria conta: own_account','own_account', r->>'outcome');
  SELECT count(*) INTO n FROM public.contacts WHERE external_id = ACC;
  PERFORM pg_temp.afirma('I4','I4j ...e continua sem contato para a propria conta','0', n::text);

  -- ===========================================================================
  -- I5 — nada é escrito quando não deve
  -- ===========================================================================
  SELECT (SELECT count(*) FROM public.contacts) + (SELECT count(*) FROM public.conversations)
       + (SELECT count(*) FROM public.messages) INTO n;

  r := public.process_instagram_message('17841400000000999', IGSID, '17841400000000999', 'fix-i-mid-x', 'oi', false);
  PERFORM pg_temp.afirma('I5','I5a conta desconhecida: unknown_account','unknown_account', r->>'outcome');

  UPDATE public.whatsapp_instances SET is_active = false WHERE id = ig_inst;
  r := public.process_instagram_message(ACC, IGSID, ACC, 'fix-i-mid-inativa', 'oi', false);
  PERFORM pg_temp.afirma('I5','I5b instancia inativa: inactive_instance','inactive_instance', r->>'outcome');
  UPDATE public.whatsapp_instances SET is_active = true WHERE id = ig_inst;

  r := public.process_instagram_message(ACC, IGSID, ACC, 'fix-i-mid-vazio', '   ', false);
  PERFORM pg_temp.afirma('I5','I5c texto vazio: invalid','invalid', r->>'outcome');
  r := public.process_instagram_message(ACC, IGSID, ACC, NULL, 'oi', false);
  PERFORM pg_temp.afirma('I5','I5d mid ausente: invalid','invalid', r->>'outcome');

  SELECT (SELECT count(*) FROM public.contacts) + (SELECT count(*) FROM public.conversations)
       + (SELECT count(*) FROM public.messages) INTO n2;
  PERFORM pg_temp.afirma('I5','I5e nenhuma linha nova em contacts/conversations/messages','0', (n2 - n)::text);

  -- ===========================================================================
  -- I6 — nada dispara para o Instagram, com tudo ligado
  -- ===========================================================================
  SELECT coalesce(assigned_profile_id::text, '<null>') INTO txt FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I6','I6a rodizio: conversa de Instagram continua sem dono','<null>', txt);

  PERFORM pg_temp.afirma('I6','I6b automacoes: nenhum pedido ao automation-processor citando o contato',
    '0', pg_temp.automacoes(c_ig)::text);
  -- I6c é o alvo da sabotagem: o mesmo número, pela trigger de mensagem.
  SELECT count(*) INTO n FROM net.http_request_queue q
   WHERE q.url LIKE '%/automation-processor'
     AND convert_from(q.body, 'UTF8') LIKE '%message_received%'
     AND convert_from(q.body, 'UTF8') LIKE '%' || c_ig::text || '%';
  PERFORM pg_temp.afirma('I6','I6c automacoes: message_received nao enfileirou nada','0', n::text);

  PERFORM pg_temp.afirma('I6','I6d webhooks de saida: zero entregas (mensagem, eco, contato criado/atualizado)',
    '0', pg_temp.entregas(c_ig)::text);

  PERFORM pg_temp.afirma('I6','I6e bot: nenhum job de chatbot','0', pg_temp.jobs_bot(c_ig)::text);
  SELECT count(*) INTO n FROM public.chatbot_sessions WHERE contact_id = c_ig;
  PERFORM pg_temp.afirma('I6','I6f bot: nenhuma sessao de chatbot','0', n::text);

  SELECT count(*) INTO n FROM public.conversation_participants WHERE conversation_id = conv_ig;
  PERFORM pg_temp.afirma('I6','I6g nenhum participante registrado pelo eco','0', n::text);

  -- Reset da regra: o eco é outbound/humano; no WhatsApp ele ZERARIA o contador.
  UPDATE public.conversations SET auto_transfer_count = 2 WHERE id = conv_ig;
  r := public.process_instagram_message(ACC, ACC, IGSID, 'fix-i-mid-eco-3', 'mais uma pelo celular', true);
  SELECT auto_transfer_count INTO n FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I6','I6h reset da regra: eco NAO zera o contador','2', n::text);
  UPDATE public.conversations SET auto_transfer_count = 0 WHERE id = conv_ig;

  -- Sweep da regra: cliente escreve de novo (a última palavra é dele), alguém
  -- atribui a conversa à Ana na mão (UPDATE sem pessoa logada = caminho de
  -- sistema), e o relógio anda um dia. No WhatsApp isto TRANSFERE (ver I7h).
  r := public.process_instagram_message(ACC, IGSID, ACC, 'fix-i-mid-3', 'ninguém responde?', false);
  -- Dentro de UMA transação now() é constante: eco e inbound nasceriam no mesmo
  -- instante, response_rule_turn_start não acharia turno aberto e o sweep
  -- pularia a conversa por esse motivo — não pelo gate. Recuar os ecos 1 h põe
  -- a última palavra, de fato, com o cliente.
  UPDATE public.messages SET created_at = now() - interval '1 hour'
   WHERE evolution_message_id LIKE 'fix-i-mid-eco-%';
  UPDATE public.conversations
     SET assigned_profile_id = P_ANA, assigned_at = now() - interval '2 hours'
   WHERE id = conv_ig;

  PERFORM public.response_rule_sweep(now() + interval '1 day');
  SELECT assigned_profile_id::text || '|' || auto_transfer_count || '|' || coalesce(response_rule_escalated_at::text, '<null>')
    INTO txt FROM public.conversations WHERE id = conv_ig;
  PERFORM pg_temp.afirma('I6','I6i sweep da regra: conversa de Instagram NAO e transferida nem escalada',
    P_ANA::text || '|0|<null>', txt);

  SELECT count(*) INTO n FROM public.messages
   WHERE conversation_id = conv_ig AND channel <> 'instagram';
  PERFORM pg_temp.afirma('I6','I6j toda mensagem da conversa de Instagram e canal instagram','0', n::text);

  -- ===========================================================================
  -- I7 — CONTROLE: WhatsApp, mesma Loja, caminho de sempre
  -- ===========================================================================
  r := public.process_incoming_message('5551900000001', 'oi pelo zap', WA_INST, 'fix-i-wamid-1');
  PERFORM pg_temp.afirma('I7','I7a retorno no formato de sempre','true|true|true|true',
    (r->>'success') || '|' || ((r->>'contact_id') IS NOT NULL)::text || '|'
    || ((r->>'message_id') IS NOT NULL)::text || '|' || ((r->'chatbot_response'->>'matched'))::text);

  c_wa := (r ->> 'contact_id')::uuid;
  SELECT id INTO conv_wa FROM public.conversations WHERE contact_id = c_wa;

  SELECT m.channel || '|' || c.channel || '|' || ct.channel || '|' || ct.phone || '|' || c.unread_count
    INTO txt
    FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
    JOIN public.contacts ct ON ct.id = m.contact_id
   WHERE m.evolution_message_id = 'fix-i-wamid-1';
  PERFORM pg_temp.afirma('I7','I7b canal whatsapp em mensagem/conversa/contato, telefone, nao lida 1',
    'whatsapp|whatsapp|whatsapp|5551900000001|1', txt);

  SELECT (assigned_profile_id IS NOT NULL)::text INTO txt FROM public.conversations WHERE id = conv_wa;
  PERFORM pg_temp.afirma('I7','I7c rodizio ATRIBUI a conversa de WhatsApp','true', txt);

  PERFORM pg_temp.afirma('I7','I7d automacoes ENFILEIRAM (contact_created + message_received)',
    '2', pg_temp.automacoes(c_wa)::text);

  PERFORM pg_temp.afirma('I7','I7e webhooks de saida ENTREGAM (contact.created + message.received + contact.updated)',
    'true', (pg_temp.entregas(c_wa) >= 2)::text);

  PERFORM pg_temp.afirma('I7','I7f bot v1 ENFILEIRA um job','1', pg_temp.jobs_bot(c_wa)::text);

  -- Reset da regra: resposta humana zera o contador.
  UPDATE public.conversations SET auto_transfer_count = 2 WHERE id = conv_wa;
  -- 1 h atrás pelo mesmo motivo de I6i: now() é constante na transação.
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, created_at)
  VALUES (LOJA, WA_INST, c_wa, 'outbound', 'text', 'FIX resposta humana', 'sent', now() - interval '1 hour');
  SELECT auto_transfer_count INTO n FROM public.conversations WHERE id = conv_wa;
  PERFORM pg_temp.afirma('I7','I7g reset da regra: resposta humana ZERA o contador','0', n::text);

  -- Sweep: cliente escreve de novo, conversa com a Ana há 2 h, relógio +1 dia.
  PERFORM public.process_incoming_message('5551900000001', 'e aí?', WA_INST, 'fix-i-wamid-2');
  UPDATE public.conversations
     SET assigned_profile_id = P_ANA, assigned_at = now() - interval '2 hours'
   WHERE id = conv_wa;

  PERFORM public.response_rule_sweep(now() + interval '1 day');
  SELECT (assigned_profile_id IS DISTINCT FROM P_ANA)::text || '|' || auto_transfer_count
    INTO txt FROM public.conversations WHERE id = conv_wa;
  PERFORM pg_temp.afirma('I7','I7h sweep TRANSFERE a conversa de WhatsApp (sai da Ana, contador 1)','true|1', txt);

  -- ===========================================================================
  -- I8 — permissões
  -- ===========================================================================
  PERFORM pg_temp.afirma('I8','I8a process_instagram_message: anon/authenticated/service_role','false|false|true',
    has_function_privilege('anon', 'public.process_instagram_message(text,text,text,text,text,boolean)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.process_instagram_message(text,text,text,text,text,boolean)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.process_instagram_message(text,text,text,text,text,boolean)', 'EXECUTE')::text);

  PERFORM pg_temp.afirma('I8','I8b create_instagram_instance: anon/authenticated/service_role','false|false|false',
    has_function_privilege('anon', 'public.create_instagram_instance(uuid,text,text,text,text,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.create_instagram_instance(uuid,text,text,text,text,timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.create_instagram_instance(uuid,text,text,text,text,timestamptz)', 'EXECUTE')::text);

  PERFORM pg_temp.afirma('I8','I8c resolve_contact_by_channel: anon/authenticated/service_role','false|false|true',
    has_function_privilege('anon', 'public.resolve_contact_by_channel(uuid,text,text,text,uuid,text)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.resolve_contact_by_channel(uuid,text,text,text,uuid,text)', 'EXECUTE')::text || '|' ||
    has_function_privilege('service_role', 'public.resolve_contact_by_channel(uuid,text,text,text,uuid,text)', 'EXECUTE')::text);
END
$bateria$;

-- -----------------------------------------------------------------------------
-- 4. Placar
-- -----------------------------------------------------------------------------
SELECT seq, grupo, check_kind, expected, actual, status FROM _i_results ORDER BY seq;

SELECT
  count(*) FILTER (WHERE status = 'ok')   AS ok,
  count(*) FILTER (WHERE status = 'FAIL') AS fail,
  count(*)                                AS total,
  CASE WHEN count(*) FILTER (WHERE status = 'FAIL') = 0
       THEN 'VERDE' ELSE 'VERMELHO' END   AS placar
FROM _i_results;

ROLLBACK;
