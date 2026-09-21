-- =============================================================================
-- teste_autor_mensagem.sql — rede de segurança do autor da mensagem
-- (migração 20260921000004, 2026-09-21): messages.sender_profile_id.
--
-- O QUE PROVA
--   E1–E4. Os QUATRO caminhos do navegador, com a carga EXATA que cada um
--          manda, continuam inserindo — e saem com o autor certo:
--            E1 texto otimista (status 'pending' + UPDATE de status depois)
--            E2 mídia (media_url, status 'sent')
--            E3 template (registro local depois do envio pela Meta)
--            E4 nova conversa (NewConversationModal: sem is_from_bot, sem
--               created_at; a conversa nasce no BEFORE INSERT)
--          e o participante é gravado UMA vez por pessoa/conversa;
--   E5.    gerente respondendo numa Loja filha: autor = o perfil da Conta;
--   E6.    FORJAR NO INSERT: cliente manda sender_profile_id de outra pessoa
--          → sobrescrito com quem está logado;
--   E7.    FORJAR NO UPDATE: trocar por outro ou zerar → revertido;
--   E8.    autor numa linha não-humana (source) → 23514 (CHECK);
--   E9.    HISTÓRICO IMPORTADO (source = 'history_sync', a carga exata do
--          chatHistorySyncService): sem autor E sem participante — quem
--          sincronizou não vira dono de nada;
--   E10.   caminhos com service role (auth NULL): outbound sem source
--          (send.message do Evolution, job-worker), campanha, follow-up,
--          chatbot → todos NULL, nenhum participante;
--   E11.   inbound (webhook e importado) não ganha autor;
--   E12.   SABOTAGEM DO TRIGGER: com uma versão que NÃO sobrescreve, o forjado
--          de E6 passa — é a prova de que E6 pega a regressão. Restaura e
--          confere que E6 volta a passar;
--   E13.   FALHA NA RESOLUÇÃO: com uma versão que estoura antes de resolver
--          (mesmo bloco EXCEPTION do trigger real), o INSERT entra com autor
--          NULL — registro nunca derruba envio. Restaura.
--
-- SEGURANÇA — BEGIN ... ROLLBACK incondicional. UUIDs com prefixo e1e1e1e1-.
--   As sabotagens (E12/E13) são CREATE OR REPLACE do trigger DENTRO da
--   transação, restauradas antes do fim — e o ROLLBACK desfaz tudo de
--   qualquer jeito.
--
-- COMO RODAR — papel `postgres` (SQL Editor ou o MCP de escrita).
-- =============================================================================

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE 'e1e1e1e1-%')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'e1e1e1e1-%')
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id::text LIKE 'e1e1e1e1-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com dado real. Nada foi feito.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'sender_profile_id')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_message_sender')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_keep_message_sender') THEN
    RAISE EXCEPTION 'ABORTADO: migração 20260921000004 ausente.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('e1e1e1e1-0000-4000-8000-00000000000a','authenticated','authenticated','fix-e-gerente@fixture.invalid', now(), now()),
  ('e1e1e1e1-0000-4000-8000-00000000000b','authenticated','authenticated','fix-e-gestor@fixture.invalid',  now(), now()),
  ('e1e1e1e1-0000-4000-8000-00000000000c','authenticated','authenticated','fix-e-ana@fixture.invalid',     now(), now()),
  ('e1e1e1e1-0000-4000-8000-00000000000d','authenticated','authenticated','fix-e-bruno@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status, settings) VALUES
  ('e1e1e1e1-0000-4000-8000-000000000001','FIXTURE Conta E','fixture-conta-e','account', NULL,'active','active','{}'),
  ('e1e1e1e1-0000-4000-8000-000000000002','FIXTURE Loja E', 'fixture-loja-e', 'store','e1e1e1e1-0000-4000-8000-000000000001','active',NULL,'{}');

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name) VALUES
  ('e1e1e1e1-0000-4000-8000-0000000000fa','e1e1e1e1-0000-4000-8000-00000000000a','e1e1e1e1-0000-4000-8000-000000000001','gerente',    NULL,'active','FIX','Gerente'),
  ('e1e1e1e1-0000-4000-8000-0000000000fb','e1e1e1e1-0000-4000-8000-00000000000b','e1e1e1e1-0000-4000-8000-000000000002','gestor',   'e1e1e1e1-0000-4000-8000-0000000000fa','active','FIX','Gestor'),
  ('e1e1e1e1-0000-4000-8000-0000000000fc','e1e1e1e1-0000-4000-8000-00000000000c','e1e1e1e1-0000-4000-8000-000000000002','atendente','e1e1e1e1-0000-4000-8000-0000000000fb','active','FIX','Ana'),
  ('e1e1e1e1-0000-4000-8000-0000000000fd','e1e1e1e1-0000-4000-8000-00000000000d','e1e1e1e1-0000-4000-8000-000000000002','atendente','e1e1e1e1-0000-4000-8000-0000000000fb','active','FIX','Bruno');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('e1e1e1e1-aaaa-4000-8000-000000000002','e1e1e1e1-0000-4000-8000-000000000002','FIX instancia E','fix-key-e');

INSERT INTO public.contacts (id, tenant_id, phone, name) VALUES
  ('e1e1e1e1-cccc-4000-8000-000000000001','e1e1e1e1-0000-4000-8000-000000000002','5511960000001','FIX e1 chat'),
  ('e1e1e1e1-cccc-4000-8000-000000000002','e1e1e1e1-0000-4000-8000-000000000002','5511960000002','FIX e2 gerente'),
  ('e1e1e1e1-cccc-4000-8000-000000000003','e1e1e1e1-0000-4000-8000-000000000002','5511960000003','FIX e3 historico'),
  ('e1e1e1e1-cccc-4000-8000-000000000004','e1e1e1e1-0000-4000-8000-000000000002','5511960000004','FIX e4 service'),
  ('e1e1e1e1-cccc-4000-8000-000000000005','e1e1e1e1-0000-4000-8000-000000000002','5511960000005','FIX e5 nova conversa');

-- Conversas existentes para c1..c4. c5 NÃO tem: nasce em E4.
INSERT INTO public.conversations (id, tenant_id, contact_id, whatsapp_instance_id, unread_count, last_message_at) VALUES
  ('e1e1e1e1-dddd-4000-8000-000000000001','e1e1e1e1-0000-4000-8000-000000000002','e1e1e1e1-cccc-4000-8000-000000000001','e1e1e1e1-aaaa-4000-8000-000000000002',0,now()),
  ('e1e1e1e1-dddd-4000-8000-000000000002','e1e1e1e1-0000-4000-8000-000000000002','e1e1e1e1-cccc-4000-8000-000000000002','e1e1e1e1-aaaa-4000-8000-000000000002',0,now()),
  ('e1e1e1e1-dddd-4000-8000-000000000003','e1e1e1e1-0000-4000-8000-000000000002','e1e1e1e1-cccc-4000-8000-000000000003','e1e1e1e1-aaaa-4000-8000-000000000002',0,now()),
  ('e1e1e1e1-dddd-4000-8000-000000000004','e1e1e1e1-0000-4000-8000-000000000002','e1e1e1e1-cccc-4000-8000-000000000004','e1e1e1e1-aaaa-4000-8000-000000000002',0,now());

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _e_results (
  seq serial, grupo text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _e_results TO authenticated;
GRANT ALL ON SEQUENCE _e_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_grupo text, p_check text, p_expected text, p_actual text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _e_results(grupo, check_kind, expected, actual, status)
  VALUES (p_grupo, p_check, p_expected, p_actual, CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;
CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;
CREATE FUNCTION pg_temp.ninguem() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '', true);
$f$;
-- Nome do autor de uma mensagem ('-' = NULL).
CREATE FUNCTION pg_temp.autor(p_msg uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
  SELECT coalesce((SELECT p.last_name FROM public.messages m LEFT JOIN public.profiles p ON p.id = m.sender_profile_id WHERE m.id = p_msg), '-');
$f$;
-- Participantes de uma conversa: "Ana,Gerente" ('-' = nenhum).
CREATE FUNCTION pg_temp.participantes(p_conv uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
  SELECT coalesce(string_agg(p.last_name, ',' ORDER BY p.last_name), '-')
    FROM public.conversation_participants cp JOIN public.profiles p ON p.id = cp.profile_id
   WHERE cp.conversation_id = p_conv;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
DO $bateria$
DECLARE
  LOJA    constant uuid := 'e1e1e1e1-0000-4000-8000-000000000002';
  INST    constant uuid := 'e1e1e1e1-aaaa-4000-8000-000000000002';
  GER     constant uuid := 'e1e1e1e1-0000-4000-8000-00000000000a';
  ANA     constant uuid := 'e1e1e1e1-0000-4000-8000-00000000000c';
  P_ANA   constant uuid := 'e1e1e1e1-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := 'e1e1e1e1-0000-4000-8000-0000000000fd';
  CT1     constant uuid := 'e1e1e1e1-cccc-4000-8000-000000000001';
  CT2     constant uuid := 'e1e1e1e1-cccc-4000-8000-000000000002';
  CT3     constant uuid := 'e1e1e1e1-cccc-4000-8000-000000000003';
  CT4     constant uuid := 'e1e1e1e1-cccc-4000-8000-000000000004';
  CT5     constant uuid := 'e1e1e1e1-cccc-4000-8000-000000000005';
  C1      constant uuid := 'e1e1e1e1-dddd-4000-8000-000000000001';
  C2      constant uuid := 'e1e1e1e1-dddd-4000-8000-000000000002';
  C3      constant uuid := 'e1e1e1e1-dddd-4000-8000-000000000003';
  C4      constant uuid := 'e1e1e1e1-dddd-4000-8000-000000000004';
  m uuid; conv uuid; n int; erro text; txt text;
BEGIN
  -- ===== E1. texto otimista: ChatWindow.tsx:662 (useSendMessage acrescenta tenant_id e created_at) =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at)
  VALUES (CT1, INST, 'FIX texto', 'outbound', 'text', 'pending', false, LOJA, now())
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E1', 'texto pending: autor = Ana', 'Ana', pg_temp.autor(m));
  -- ...e o UPDATE de status que vem depois do envio (ChatWindow.tsx:685)
  UPDATE public.messages SET status = 'sent', evolution_message_id = 'wamid.FIX1' WHERE id = m;
  PERFORM pg_temp.afirma('E1', 'UPDATE de status depois do envio: autor continua Ana', 'Ana', pg_temp.autor(m));
  SELECT status INTO txt FROM public.messages WHERE id = m;
  PERFORM pg_temp.afirma('E1', 'status virou sent', 'sent', txt);
  PERFORM pg_temp.afirma('E1', 'participante gravado', 'Ana', pg_temp.participantes(C1));

  -- ===== E2. mídia: ChatWindow.tsx:606 =====
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, media_url, status, evolution_message_id, is_from_bot, tenant_id, created_at)
  VALUES (CT1, INST, 'legenda', 'outbound', 'image', 'https://x/y.jpg', 'sent', 'wamid.FIX2', false, LOJA, now())
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E2', 'mídia: autor = Ana', 'Ana', pg_temp.autor(m));

  -- ===== E3. template: ChatWindow.tsx:724 =====
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at)
  VALUES (CT1, INST, 'Template: boas_vindas', 'outbound', 'text', 'sent', false, LOJA, now())
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E3', 'template: autor = Ana', 'Ana', pg_temp.autor(m));
  PERFORM pg_temp.afirma('E3', 'participante continua UM (ON CONFLICT DO NOTHING)', 'Ana', pg_temp.participantes(C1));

  -- ===== E4. nova conversa: NewConversationModal.tsx:150 (sem is_from_bot, sem created_at; conversa não existe) =====
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, status)
  VALUES (CT5, LOJA, INST, 'outbound', 'text', 'FIX primeira', 'sent')
  RETURNING id, conversation_id INTO m, conv;
  PERFORM pg_temp.afirma('E4', 'nova conversa: a conversa nasceu no BEFORE INSERT', 'sim', CASE WHEN conv IS NOT NULL THEN 'sim' ELSE 'não' END);
  PERFORM pg_temp.afirma('E4', 'nova conversa: autor = Ana', 'Ana', pg_temp.autor(m));
  PERFORM pg_temp.afirma('E4', 'nova conversa: participante = Ana', 'Ana', pg_temp.participantes(conv));
  RESET ROLE;

  -- ===== E5. gerente da Conta responde na Loja filha =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(GER);
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at)
  VALUES (CT2, INST, 'FIX gerente', 'outbound', 'text', 'pending', false, LOJA, now())
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E5', 'gerente na Loja filha: autor = perfil da Conta (Gerente)', 'Gerente', pg_temp.autor(m));
  PERFORM pg_temp.afirma('E5', 'participante = Gerente', 'Gerente', pg_temp.participantes(C2));
  RESET ROLE;

  -- ===== E6. FORJAR NO INSERT =====
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at, sender_profile_id)
  VALUES (CT1, INST, 'FIX forjada', 'outbound', 'text', 'sent', false, LOJA, now(), P_BRUNO)
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E6', 'cliente mandou Bruno; gravado = Ana (sobrescrito)', 'Ana', pg_temp.autor(m));
  PERFORM pg_temp.afirma('E6', 'Bruno NÃO virou participante', 'Ana', pg_temp.participantes(C1));

  -- ===== E7. FORJAR NO UPDATE =====
  UPDATE public.messages SET sender_profile_id = P_BRUNO WHERE id = m;
  PERFORM pg_temp.afirma('E7', 'UPDATE para Bruno: continua Ana', 'Ana', pg_temp.autor(m));
  UPDATE public.messages SET sender_profile_id = NULL WHERE id = m;
  PERFORM pg_temp.afirma('E7', 'UPDATE para NULL: continua Ana', 'Ana', pg_temp.autor(m));

  -- ===== E8. autor numa linha com source → 23514 =====
  BEGIN
    INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, source, sender_profile_id)
    VALUES (CT1, INST, 'FIX', 'outbound', 'text', 'sent', false, LOJA, 'campaign', P_ANA);
    erro := 'entrou';
  EXCEPTION WHEN check_violation THEN
    erro := '23514';
  END;
  PERFORM pg_temp.afirma('E8', 'autor em linha com source: CHECK recusa (23514)', '23514', erro);

  -- ===== E9. HISTÓRICO IMPORTADO (chatHistorySyncService, sob a sessão da Ana) =====
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, evolution_message_id, status, is_from_bot, source, created_at)
  VALUES (CT3, LOJA, INST, 'outbound', 'text', 'FIX antiga fromMe', 'HIST1', 'sent', false, 'history_sync', now() - interval '30 days')
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E9', 'importada fromMe: SEM autor', '-', pg_temp.autor(m));
  PERFORM pg_temp.afirma('E9', 'importada fromMe: SEM participante (quem sincronizou não é dono de nada)', '-', pg_temp.participantes(C3));
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, evolution_message_id, status, is_from_bot, source, created_at)
  VALUES (CT3, LOJA, INST, 'inbound', 'text', 'FIX antiga cliente', 'HIST2', 'received', false, 'history_sync', now() - interval '29 days')
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E9', 'importada inbound: sem autor', '-', pg_temp.autor(m));
  -- Sem a origem (a carga ANTES deste commit) a sessão viraria autor: é o que a exclusão evita.
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, evolution_message_id, status, is_from_bot, created_at)
  VALUES (CT3, LOJA, INST, 'outbound', 'text', 'FIX antiga SEM origem', 'HIST3', 'sent', false, now() - interval '28 days')
  RETURNING id INTO m;
  PERFORM pg_temp.afirma('E9', 'controle: a mesma linha SEM source ganharia a Ana como autora (por isso o source existe)', 'Ana', pg_temp.autor(m));
  RESET ROLE;

  -- ===== E10. service role (auth NULL) =====
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, evolution_message_id, status)
  VALUES (CT4, LOJA, INST, 'outbound', 'text', 'FIX digitada no celular (send.message)', 'EVO1', 'sent') RETURNING id INTO m;
  PERFORM pg_temp.afirma('E10', 'evolution send.message / job-worker (source NULL, sem sessão): autor NULL', '-', pg_temp.autor(m));
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, status, source, is_from_bot)
  VALUES (CT4, LOJA, INST, 'outbound', 'text', 'FIX campanha', 'sent', 'campaign', false) RETURNING id INTO m;
  PERFORM pg_temp.afirma('E10', 'campanha: NULL', '-', pg_temp.autor(m));
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, status, source, is_from_bot)
  VALUES (CT4, LOJA, INST, 'outbound', 'text', 'FIX follow-up', 'sent', 'followup', false) RETURNING id INTO m;
  PERFORM pg_temp.afirma('E10', 'follow-up: NULL', '-', pg_temp.autor(m));
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, status, source, is_from_bot)
  VALUES (CT4, LOJA, INST, 'outbound', 'text', 'FIX bot', 'sent', 'chatbot', true) RETURNING id INTO m;
  PERFORM pg_temp.afirma('E10', 'chatbot: NULL', '-', pg_temp.autor(m));
  PERFORM pg_temp.afirma('E10', 'nenhum participante pela service role', '-', pg_temp.participantes(C4));

  -- ===== E11. inbound =====
  INSERT INTO public.messages (contact_id, tenant_id, whatsapp_instance_id, direction, message_type, content, evolution_message_id, status)
  VALUES (CT4, LOJA, INST, 'inbound', 'text', 'FIX cliente', 'IN1', 'received') RETURNING id INTO m;
  PERFORM pg_temp.afirma('E11', 'inbound do webhook: sem autor', '-', pg_temp.autor(m));
  SELECT count(*) INTO n FROM public.messages WHERE conversation_id = C4;
  PERFORM pg_temp.afirma('E11', 'as 5 linhas do caminho sem sessão entraram', '5', n::text);

  -- ===== E12. SABOTAGEM: trigger que NÃO sobrescreve — E6 tem de pegar =====
  CREATE OR REPLACE FUNCTION public.tg_set_message_sender() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $sab$
  DECLARE v_profile uuid;
  BEGIN
    IF NEW.sender_profile_id IS NOT NULL THEN RETURN NEW; END IF; -- "confia" no cliente (a regressão)
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT p.id INTO v_profile FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
    NEW.sender_profile_id := v_profile;
    RETURN NEW;
  END; $sab$;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at, sender_profile_id)
  VALUES (CT1, INST, 'FIX forjada sob sabotagem', 'outbound', 'text', 'sent', false, LOJA, now(), P_BRUNO)
  RETURNING id INTO m;
  RESET ROLE;
  PERFORM pg_temp.afirma('E12', 'sabotado: o forjado PASSA (Bruno) — logo a checagem E6 pegaria a regressão', 'Bruno', pg_temp.autor(m));
  -- Restaura o trigger real (texto de 20260921000004).
  CREATE OR REPLACE FUNCTION public.tg_set_message_sender() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
  DECLARE v_profile uuid;
  BEGIN
    NEW.sender_profile_id := NULL;
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT p.id INTO v_profile FROM public.profiles p WHERE p.user_id = auth.uid()
     ORDER BY (p.tenant_id = NEW.tenant_id) DESC NULLS LAST LIMIT 1;
    NEW.sender_profile_id := v_profile;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_set_message_sender falhou: % [%]', SQLERRM, SQLSTATE;
    NEW.sender_profile_id := NULL;
    RETURN NEW;
  END; $function$;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at, sender_profile_id)
  VALUES (CT1, INST, 'FIX forjada de novo', 'outbound', 'text', 'sent', false, LOJA, now(), P_BRUNO)
  RETURNING id INTO m;
  RESET ROLE;
  PERFORM pg_temp.afirma('E12', 'restaurado: o forjado volta a ser sobrescrito (Ana)', 'Ana', pg_temp.autor(m));

  -- ===== E13. FALHA NA RESOLUÇÃO: estoura antes de resolver; o INSERT entra =====
  CREATE OR REPLACE FUNCTION public.tg_set_message_sender() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $sab$
  DECLARE v_profile uuid;
  BEGIN
    NEW.sender_profile_id := NULL;
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    PERFORM 1 / 0; -- a resolução "falhou"
    NEW.sender_profile_id := 'e1e1e1e1-0000-4000-8000-0000000000fd'::uuid;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_set_message_sender falhou: % [%]', SQLERRM, SQLSTATE;
    NEW.sender_profile_id := NULL;
    RETURN NEW;
  END; $sab$;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  SELECT count(*) INTO n FROM public.messages WHERE conversation_id = C1;
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at)
  VALUES (CT1, INST, 'FIX com a resolução quebrada', 'outbound', 'text', 'pending', false, LOJA, now())
  RETURNING id INTO m;
  RESET ROLE;
  PERFORM pg_temp.afirma('E13', 'resolução falhou: a mensagem ENTROU', (n + 1)::text, (SELECT count(*) FROM public.messages WHERE conversation_id = C1)::text);
  PERFORM pg_temp.afirma('E13', 'resolução falhou: autor NULL', '-', pg_temp.autor(m));
  -- Restaura de novo (idêntico ao bloco de E12).
  CREATE OR REPLACE FUNCTION public.tg_set_message_sender() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
  DECLARE v_profile uuid;
  BEGIN
    NEW.sender_profile_id := NULL;
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT p.id INTO v_profile FROM public.profiles p WHERE p.user_id = auth.uid()
     ORDER BY (p.tenant_id = NEW.tenant_id) DESC NULLS LAST LIMIT 1;
    NEW.sender_profile_id := v_profile;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_set_message_sender falhou: % [%]', SQLERRM, SQLSTATE;
    NEW.sender_profile_id := NULL;
    RETURN NEW;
  END; $function$;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.como(ANA);
  INSERT INTO public.messages (contact_id, whatsapp_instance_id, content, direction, message_type, status, is_from_bot, tenant_id, created_at)
  VALUES (CT1, INST, 'FIX depois de restaurar', 'outbound', 'text', 'pending', false, LOJA, now())
  RETURNING id INTO m;
  RESET ROLE;
  PERFORM pg_temp.afirma('E13', 'restaurado: autor = Ana', 'Ana', pg_temp.autor(m));
END
$bateria$;

-- -----------------------------------------------------------------------------
-- 4. Placar
-- -----------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(grupo || ' / ' || check_kind
                           || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _e_results;

ROLLBACK;
