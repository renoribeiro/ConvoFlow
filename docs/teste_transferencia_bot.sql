-- =============================================================================
-- teste_transferencia_bot.sql — rede de segurança do nó "Transferir para
-- Atendente" com pessoa nomeada (supabase/functions/_shared/chatbot-engine.ts,
-- assignConversationToTransferTarget — mudança de 2026-09-15).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta B, Loja B e Loja B2) com gerente,
--   gestor, Ana e Bruno (atendentes ativos da Loja B), Carla (atendente
--   SUSPENSA da Loja B), Dani (atendente ativa da Loja B2), uma instância, um
--   bot v2 e 40 contatos. Reproduz as escritas do MOTOR — como service_role,
--   auth.uid() NULL, na mesma ordem do código: mensagem do bot → atribuição
--   guardada → aviso → sessão 'transferred' — e afirma, cenário a cenário:
--
--   B0  conversa SEM responsável + pessoa elegível: recebe. assigned_at = o
--       instante da entrega, assigned_by NULL, UM aviso no sino (o do motor,
--       com tenant_id), e o trigger tg_notify_conversation_assigned fica MUDO.
--   B1  o fim da sessão logo depois NÃO reatribui: com rodízio after_bot ligado
--       e Bruno em 100 %, a conversa continua com a Ana nomeada. E Ana em 0 %
--       recebe mesmo assim — 0 % não é inelegibilidade.
--   B2  conversa que JÁ TEM responsável (transferência humana anterior): o nó
--       não toca — dono, assigned_at e assigned_by intactos; ninguém avisado.
--   B3  rodízio 'immediate': a conversa chegou com dono antes de o bot rodar;
--       o nó nomeando outra pessoa não troca e não avisa.
--   B4  pessoa inelegível — suspensa, de outra Loja, id inexistente, gerente —
--       não recebe: sem rodízio fica sem dono; com rodízio after_bot o fim da
--       sessão entrega ao rodízio. A inelegível nunca é avisada.
--   B5  guarda no WHERE: alguém atribui ENTRE a checagem e o UPDATE (a
--       próxima mensagem do cliente, na vida real) → zero linhas, o dono da
--       corrida fica, ninguém é avisado.
--   B6  "Qualquer atendente": o motor só encerra a sessão — e o rodízio
--       after_bot entrega; sem rodízio fica sem dono. Nada muda em relação a
--       antes.
--   B7  referência da regra de tempo: espera começou 09:30, bot entregou à Ana
--       às 10:00 (assigned_at = fim da sessão = 10:00). Varredura às 10:58 não
--       transfere; às 11:00 transfere para o próximo (Bruno). É o
--       GREATEST(início da espera, assigned_at, fim do bot) documentado.
--
-- POR QUE O MOTOR É ESPELHADO EM SQL
--   O motor roda em Deno, fora do banco. Esta suíte prova como o BANCO reage às
--   escritas dele (triggers de sessão, sino, rodízio, regra de tempo). A lógica
--   do TypeScript em si (tradução user_id → profiles.id, elegibilidade, guarda)
--   está coberta em src/lib/chatbot/transferTarget.test.ts. Os dois têm de
--   contar a mesma história: a função pg_temp.motor_transfere abaixo segue o
--   código linha a linha — ao mudar um, mude o outro.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo 88888888-.
--   Guarda de colisão antes de semear. Relógio injetado (p_at): nada espera
--   cron. A sabotagem da seção 5 redefine só uma função pg_temp, que morre com
--   a sessão — e o ROLLBACK desfaz tudo de qualquer jeito.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita), o arquivo inteiro de
--   uma vez. O placar sai no fim.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM da seção 5: tira o guarda "sem responsável"
--   do motor espelhado. Medido em 2026-09-15 contra produção: fase 1 = 48/48
--   verde; fase 2 = 12 vermelhos, exatamente B2a–B2e, B3b–B3e e B5a–B5c (o nó
--   passa a roubar conversa de quem já a tem e a avisar a Ana); o resto verde.
-- =============================================================================

BEGIN;

-- Fatia 1 do Instagram (20260922000002): contacts.external_id virou NOT NULL e
-- quem preenche é a trigger trg_contacts_set_external_id. Sob
-- session_replication_role = replica ela NÃO dispara, e a semeadura morria com
-- 23502. ENABLE ALWAYS liga SÓ essa trigger, SÓ dentro desta transação (o
-- ROLLBACK desfaz) — a semeadura passa a obedecer a mesma regra da produção.
ALTER TABLE public.contacts ENABLE ALWAYS TRIGGER trg_contacts_set_external_id;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE '88888888-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '88888888-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com usuário real do Auth. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.rotation_assign_conversation(uuid)') IS NULL
     OR to_regprocedure('public.tg_rotation_assign_on_session_end()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260915000001 (rodízio) ainda não foi aplicada.';
  END IF;
  IF to_regprocedure('public.response_rule_sweep(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260916000001 (regra de tempo) ainda não foi aplicada.';
  END IF;
  IF to_regprocedure('public.tg_notify_conversation_assigned()') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: o sino de transferência (20260913000001) não existe.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('88888888-0000-4000-8000-00000000000a','authenticated','authenticated','fix-b-gerente@fixture.invalid', now(), now()),
  ('88888888-0000-4000-8000-00000000000b','authenticated','authenticated','fix-b-gestor@fixture.invalid',  now(), now()),
  ('88888888-0000-4000-8000-00000000000c','authenticated','authenticated','fix-b-ana@fixture.invalid',     now(), now()),
  ('88888888-0000-4000-8000-00000000000d','authenticated','authenticated','fix-b-bruno@fixture.invalid',   now(), now()),
  ('88888888-0000-4000-8000-00000000000e','authenticated','authenticated','fix-b-carla@fixture.invalid',   now(), now()),
  ('88888888-0000-4000-8000-00000000000f','authenticated','authenticated','fix-b-dani@fixture.invalid',    now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('88888888-0000-4000-8000-000000000001','FIXTURE Conta B','fixture-conta-b','account', NULL,'active','active'),
  ('88888888-0000-4000-8000-000000000002','FIXTURE Loja B', 'fixture-loja-b', 'store','88888888-0000-4000-8000-000000000001','active',NULL),
  ('88888888-0000-4000-8000-000000000003','FIXTURE Loja B2','fixture-loja-b2','store','88888888-0000-4000-8000-000000000001','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('88888888-0000-4000-8000-0000000000fa','88888888-0000-4000-8000-00000000000a','88888888-0000-4000-8000-000000000001','gerente',   NULL,'active','FIX','Gerente','2026-01-01 10:00+00'),
  ('88888888-0000-4000-8000-0000000000fb','88888888-0000-4000-8000-00000000000b','88888888-0000-4000-8000-000000000002','gestor',   '88888888-0000-4000-8000-0000000000fa','active','FIX','Gestor','2026-01-01 10:01+00'),
  ('88888888-0000-4000-8000-0000000000fc','88888888-0000-4000-8000-00000000000c','88888888-0000-4000-8000-000000000002','atendente','88888888-0000-4000-8000-0000000000fb','active','FIX','Ana','2026-01-01 10:02+00'),
  ('88888888-0000-4000-8000-0000000000fd','88888888-0000-4000-8000-00000000000d','88888888-0000-4000-8000-000000000002','atendente','88888888-0000-4000-8000-0000000000fb','active','FIX','Bruno','2026-01-01 10:03+00'),
  ('88888888-0000-4000-8000-0000000000fe','88888888-0000-4000-8000-00000000000e','88888888-0000-4000-8000-000000000002','atendente','88888888-0000-4000-8000-0000000000fb','suspended','FIX','Carla','2026-01-01 10:04+00'),
  ('88888888-0000-4000-8000-0000000000ff','88888888-0000-4000-8000-00000000000f','88888888-0000-4000-8000-000000000003','atendente',NULL,'active','FIX','Dani','2026-01-01 10:05+00');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('88888888-aaaa-4000-8000-000000000002','88888888-0000-4000-8000-000000000002','FIX instancia B','fix-key-b');

-- Bot v2 publicado: é a condição de rotation_bot_pending esperar na 1ª mensagem.
INSERT INTO public.chatbots (id, tenant_id, whatsapp_instance_id, name, is_active, is_published, builder_version) VALUES
  ('88888888-bbbb-4000-8000-000000000001','88888888-0000-4000-8000-000000000002','88888888-aaaa-4000-8000-000000000002','FIX bot B', true, true, 2);

INSERT INTO public.contacts (id, tenant_id, whatsapp_instance_id, phone, name)
SELECT ('88888888-cccc-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       '88888888-0000-4000-8000-000000000002',
       '88888888-aaaa-4000-8000-000000000002',
       '55539' || lpad(n::text, 8, '0'),
       'FIX contato ' || n
  FROM generate_series(1, 40) n;

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _tb_results (
  seq serial, phase text, cenario text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.afirma(p_phase text, p_cenario text, p_check text, p_expected text, p_actual text) RETURNS void
LANGUAGE sql AS $f$
  INSERT INTO _tb_results(phase, cenario, check_kind, expected, actual, status)
  VALUES (p_phase, p_cenario, p_check, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

-- Vira ninguém (webhook, motor, cron): auth.uid() NULL.
CREATE FUNCTION pg_temp.ninguem() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '', true);
$f$;

CREATE FUNCTION pg_temp.contato(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('88888888-cccc-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid;
$f$;

-- Preferências da Loja B: rodízio e regra de tempo juntos. NULL em tudo = {}.
CREATE FUNCTION pg_temp.prefs(p_rot boolean, p_timing text DEFAULT 'after_bot', p_rule boolean DEFAULT NULL, p_minutes int DEFAULT 60) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.tenants
     SET settings = jsonb_strip_nulls(jsonb_build_object(
           'rotation_enabled', p_rot,
           'rotation_timing', CASE WHEN p_rot IS NULL THEN NULL ELSE p_timing END,
           'rotation_includes_gestor', CASE WHEN p_rot IS NULL THEN NULL ELSE false END,
           'response_rule_enabled', p_rule,
           'response_rule_minutes', CASE WHEN p_rule IS NULL THEN NULL ELSE p_minutes END,
           'response_rule_max_transfers', CASE WHEN p_rule IS NULL THEN NULL ELSE 3 END))
   WHERE id = '88888888-0000-4000-8000-000000000002';
END;
$f$;

-- Porcentagens direto (papel postgres): Ana / Bruno.
CREATE FUNCTION pg_temp.pct(p_ana int, p_bruno int) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.conversation_rotation SET percent = p_ana,   credit = 0 WHERE tenant_id = '88888888-0000-4000-8000-000000000002' AND profile_id = '88888888-0000-4000-8000-0000000000fc';
  UPDATE public.conversation_rotation SET percent = p_bruno, credit = 0 WHERE tenant_id = '88888888-0000-4000-8000-000000000002' AND profile_id = '88888888-0000-4000-8000-0000000000fd';
END;
$f$;

-- O webhook: inbound do contato N em p_at, sem pessoa logada. Devolve a conversa.
CREATE FUNCTION pg_temp.chega(p_n int, p_at timestamptz, p_content text DEFAULT 'FIX inbound') RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_conv uuid;
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, created_at)
  VALUES ('88888888-0000-4000-8000-000000000002', '88888888-aaaa-4000-8000-000000000002', pg_temp.contato(p_n), 'inbound', 'text', p_content, 'received', p_at)
  RETURNING conversation_id INTO v_conv;
  RETURN v_conv;
END;
$f$;

-- Resposta do BOT (outbound, is_from_bot true, source chatbot) em p_at — o sendBotMessage.
CREATE FUNCTION pg_temp.bot(p_n int, p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot, source, created_at)
  VALUES ('88888888-0000-4000-8000-000000000002', '88888888-aaaa-4000-8000-000000000002', pg_temp.contato(p_n), 'outbound', 'text', 'FIX bot: vou te transferir', 'sent', true, 'chatbot', p_at);
END;
$f$;

-- Resposta HUMANA em p_at (fecha a espera da regra de tempo).
CREATE FUNCTION pg_temp.humano(p_n int, p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot, source, created_at)
  VALUES ('88888888-0000-4000-8000-000000000002', '88888888-aaaa-4000-8000-000000000002', pg_temp.contato(p_n), 'outbound', 'text', 'FIX humano', 'sent', false, NULL, p_at);
END;
$f$;

-- Sessão ATIVA do bot com o contato N (o motor abriu; started_at = p_at).
CREATE FUNCTION pg_temp.sessao(p_n int, p_at timestamptz) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := ('88888888-eeee-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid;
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.chatbot_sessions (id, chatbot_id, contact_id, tenant_id, whatsapp_instance_id, status, started_at, last_activity_at)
  VALUES (v_id, '88888888-bbbb-4000-8000-000000000001', pg_temp.contato(p_n), '88888888-0000-4000-8000-000000000002', '88888888-aaaa-4000-8000-000000000002', 'active', p_at, p_at);
  RETURN v_id;
END;
$f$;

-- Transferência HUMANA (gestor passa ao Bruno): assigned_by = gestor.
CREATE FUNCTION pg_temp.gestor_transfere(p_n int, p_para uuid, p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM pg_temp.ninguem();
  UPDATE public.conversations
     SET assigned_profile_id = p_para, assigned_at = p_at, assigned_by = '88888888-0000-4000-8000-0000000000fb'
   WHERE tenant_id = '88888888-0000-4000-8000-000000000002' AND contact_id = pg_temp.contato(p_n);
END;
$f$;

-- O MOTOR, nó transfer_agent com "Atendente específico" (p_user = user_id do
-- nó), na ordem do código: (1) mensagem do bot, (2) resolveTransferTarget +
-- assignConversationToTransferTarget, (3) aviso só se atribuiu, (4) sessão
-- 'transferred'. p_race simula alguém atribuindo ENTRE a checagem e o UPDATE.
-- Devolve o outcome do motor.
CREATE FUNCTION pg_temp.motor_transfere(p_n int, p_user uuid, p_at timestamptz, p_race uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  LOJA constant uuid := '88888888-0000-4000-8000-000000000002';
  v_prof uuid; v_conv uuid; v_owner uuid; v_n int; v_out text;
BEGIN
  PERFORM pg_temp.ninguem();
  -- (1) sendBotMessage
  PERFORM pg_temp.bot(p_n, p_at);

  -- (2a) resolveTransferTarget: perfil da Loja do bot, ativo, cargo que atende.
  --      (0 % no rodízio NÃO entra aqui, de propósito.)
  SELECT p.id INTO v_prof
    FROM public.profiles p
   WHERE p.user_id = p_user
     AND p.tenant_id = LOJA
     AND p.status = 'active'
     AND p.role IN ('atendente'::public.user_role, 'gestor'::public.user_role);

  IF v_prof IS NULL THEN
    v_out := 'ineligible';
  ELSE
    -- (2b) conversa por (tenant_id, contact_id) — a UNIQUE.
    SELECT c.id, c.assigned_profile_id INTO v_conv, v_owner
      FROM public.conversations c
     WHERE c.tenant_id = LOJA AND c.contact_id = pg_temp.contato(p_n);
    IF v_conv IS NULL THEN
      v_out := 'no_conversation';
    ELSIF v_owner IS NOT NULL THEN
      v_out := 'already_owned';
    ELSE
      IF p_race IS NOT NULL THEN
        UPDATE public.conversations SET assigned_profile_id = p_race, assigned_at = p_at, assigned_by = NULL WHERE id = v_conv;
      END IF;
      -- (2c) o UPDATE guardado — o guarda vai no WHERE.
      UPDATE public.conversations
         SET assigned_profile_id = v_prof, assigned_at = p_at, assigned_by = NULL
       WHERE id = v_conv AND assigned_profile_id IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        v_out := 'lost_race';
      ELSE
        v_out := 'assigned';
        -- (3) createTransferNotification — só quem recebeu.
        INSERT INTO public.notifications (tenant_id, user_id, title, message, type, action_url, action_label, metadata)
        VALUES (LOJA, p_user, 'Conversa transferida', 'Uma conversa foi transferida para você (contato: 5553900000000).', 'info',
                '/dashboard/conversations?contact=' || pg_temp.contato(p_n)::text, 'Ver conversa',
                jsonb_build_object('conversation_id', v_conv, 'session_id', ('88888888-eeee-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid,
                                   'contact_id', pg_temp.contato(p_n), 'chatbot_id', '88888888-bbbb-4000-8000-000000000001', 'assigned_by', NULL));
      END IF;
    END IF;
  END IF;

  -- (4) updateSession: status 'transferred' — é o que dispara trg_rotation_assign_on_session_end.
  UPDATE public.chatbot_sessions
     SET status = 'transferred', ended_at = p_at, updated_at = p_at, awaiting_input = false, last_activity_at = p_at
   WHERE contact_id = pg_temp.contato(p_n) AND status = 'active';
  RETURN v_out;
END;
$f$;

-- O MOTOR, nó transfer_agent com "Qualquer atendente": só mensagem + fim da sessão.
CREATE FUNCTION pg_temp.motor_any(p_n int, p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM pg_temp.ninguem();
  PERFORM pg_temp.bot(p_n, p_at);
  UPDATE public.chatbot_sessions
     SET status = 'transferred', ended_at = p_at, updated_at = p_at, awaiting_input = false, last_activity_at = p_at
   WHERE contact_id = pg_temp.contato(p_n) AND status = 'active';
END;
$f$;

-- Quem está com a conversa do contato N: sobrenome, ou '<null>'.
CREATE FUNCTION pg_temp.dono(p_n int) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((SELECT p.last_name FROM public.profiles p WHERE p.id = c.assigned_profile_id), '<null>')
    FROM public.conversations c
   WHERE c.tenant_id = '88888888-0000-4000-8000-000000000002' AND c.contact_id = pg_temp.contato(p_n);
$f$;

-- assigned_at / assigned_by da conversa N, como texto.
CREATE FUNCTION pg_temp.desde(p_n int) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(to_char(c.assigned_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'), '<null>')
    FROM public.conversations c
   WHERE c.tenant_id = '88888888-0000-4000-8000-000000000002' AND c.contact_id = pg_temp.contato(p_n);
$f$;
CREATE FUNCTION pg_temp.por(p_n int) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((SELECT p.last_name FROM public.profiles p WHERE p.id = c.assigned_by), '<null>')
    FROM public.conversations c
   WHERE c.tenant_id = '88888888-0000-4000-8000-000000000002' AND c.contact_id = pg_temp.contato(p_n);
$f$;

-- Avisos "Conversa transferida" para o user N: total, os do motor (metadata
-- tem session_id) e os do sino trigger (não tem). "2|2|0" = dois do motor, zero do sino.
CREATE FUNCTION pg_temp.sino(p_user uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT count(*)::text || '|' ||
         count(*) FILTER (WHERE n.metadata ? 'session_id')::text || '|' ||
         count(*) FILTER (WHERE NOT (n.metadata ? 'session_id'))::text
    FROM public.notifications n
   WHERE n.user_id = p_user AND n.title = 'Conversa transferida';
$f$;

CREATE FUNCTION pg_temp.limpa_sino() RETURNS void LANGUAGE sql AS $f$
  DELETE FROM public.notifications WHERE user_id::text LIKE '88888888-%';
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.bateria(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  LOJA    constant uuid := '88888888-0000-4000-8000-000000000002';
  U_GER   constant uuid := '88888888-0000-4000-8000-00000000000a';
  U_ANA   constant uuid := '88888888-0000-4000-8000-00000000000c';
  U_BRUNO constant uuid := '88888888-0000-4000-8000-00000000000d';
  U_CARLA constant uuid := '88888888-0000-4000-8000-00000000000e';
  U_DANI  constant uuid := '88888888-0000-4000-8000-00000000000f';
  P_ANA   constant uuid := '88888888-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := '88888888-0000-4000-8000-0000000000fd';
  MON     constant timestamptz := '2026-09-21 00:00-03';   -- segunda-feira
  n int; v_txt text; v_antes text; v_conv uuid; v_sess uuid;
BEGIN
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM public.rotation_rebalance(LOJA);   -- Ana 50 / Bruno 50 (Carla suspensa fica fora)

  -- ===================== B0. Sem dono + elegível: recebe =====================
  PERFORM pg_temp.prefs(NULL);                                     -- rodízio e regra desligados
  PERFORM pg_temp.limpa_sino();
  v_sess := pg_temp.sessao(1, MON + interval '9 hours 30 minutes');
  v_conv := pg_temp.chega(1, MON + interval '9 hours 30 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0a. antes do nó: sem responsável', '<null>', pg_temp.dono(1));
  v_txt := pg_temp.motor_transfere(1, U_ANA, MON + interval '10 hours');
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0b. outcome do motor', 'assigned', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0c. a conversa é da Ana (profiles.id, traduzido do user_id do nó)', 'Ana', pg_temp.dono(1));
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0d. assigned_at = instante da entrega (10:00), nunca velho', '2026-09-21 10:00', pg_temp.desde(1));
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0e. assigned_by NULL (ninguém passou; automático)', '<null>', pg_temp.por(1));
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0f. UM aviso para a Ana: o do motor; o sino-trigger ficou mudo', '1|1|0', pg_temp.sino(U_ANA));
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = U_ANA AND tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0g. ...com tenant_id preenchido', '1', n::text);
  SELECT status::text INTO v_txt FROM public.chatbot_sessions WHERE id = v_sess;
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0h. sessão terminou (transferred)', 'transferred', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B0', 'B0i. o fim da sessão (rodízio desligado) não mexeu no dono', 'Ana', pg_temp.dono(1));
  PERFORM pg_temp.humano(1, MON + interval '60 days');

  -- ===================== B1. Fim da sessão não reatribui; 0 % recebe =====================
  PERFORM pg_temp.prefs(true, 'after_bot');
  PERFORM pg_temp.pct(0, 100);                                     -- Ana 0 %, Bruno 100 %
  PERFORM pg_temp.limpa_sino();
  v_sess := pg_temp.sessao(2, MON + interval '9 hours');
  v_conv := pg_temp.chega(2, MON + interval '9 hours');
  PERFORM pg_temp.afirma(p_phase, 'B1', 'B1a. after_bot com sessão ativa: a 1ª mensagem espera', '<null>', pg_temp.dono(2));
  v_txt := pg_temp.motor_transfere(2, U_ANA, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B1', 'B1b. nó nomeia Ana (0 % no rodízio): recebe — 0 % não é inelegibilidade', 'assigned', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B1', 'B1c. depois do fim da sessão a conversa CONTINUA com a Ana (Bruno em 100 % não a pegou)', 'Ana', pg_temp.dono(2));
  PERFORM pg_temp.afirma(p_phase, 'B1', 'B1d. Bruno não foi avisado de nada', '0|0|0', pg_temp.sino(U_BRUNO));
  SELECT public.rotation_sweep_after_bot() INTO n;
  PERFORM pg_temp.afirma(p_phase, 'B1', 'B1e. a varredura do rodízio também não toca nela', 'Ana', pg_temp.dono(2));
  PERFORM pg_temp.humano(2, MON + interval '60 days');

  -- ===================== B2. Já tem responsável (transferência humana) =====================
  PERFORM pg_temp.prefs(NULL);
  PERFORM pg_temp.limpa_sino();
  v_sess := pg_temp.sessao(3, MON + interval '9 hours');
  v_conv := pg_temp.chega(3, MON + interval '9 hours');
  PERFORM pg_temp.gestor_transfere(3, P_BRUNO, MON + interval '9 hours 10 minutes');
  PERFORM pg_temp.limpa_sino();                                    -- o sino da transferência humana não interessa aqui
  v_txt := pg_temp.motor_transfere(3, U_ANA, MON + interval '9 hours 20 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B2', 'B2a. outcome do motor', 'already_owned', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B2', 'B2b. o dono continua o Bruno', 'Bruno', pg_temp.dono(3));
  PERFORM pg_temp.afirma(p_phase, 'B2', 'B2c. assigned_at intacto (09:10, não 09:20)', '2026-09-21 09:10', pg_temp.desde(3));
  PERFORM pg_temp.afirma(p_phase, 'B2', 'B2d. assigned_by intacto (Gestor)', 'Gestor', pg_temp.por(3));
  PERFORM pg_temp.afirma(p_phase, 'B2', 'B2e. Ana não recebe aviso de conversa que não recebeu', '0|0|0', pg_temp.sino(U_ANA));
  PERFORM pg_temp.afirma(p_phase, 'B2', 'B2f. nem o Bruno recebe aviso novo', '0|0|0', pg_temp.sino(U_BRUNO));
  PERFORM pg_temp.humano(3, MON + interval '60 days');

  -- ===================== B3. Rodízio 'immediate': já chegou com dono =====================
  PERFORM pg_temp.prefs(true, 'immediate');
  PERFORM pg_temp.pct(0, 100);
  PERFORM pg_temp.limpa_sino();
  v_conv := pg_temp.chega(4, MON + interval '9 hours');
  PERFORM pg_temp.afirma(p_phase, 'B3', 'B3a. immediate: a 1ª mensagem já entregou ao Bruno', 'Bruno', pg_temp.dono(4));
  -- O rodízio carimba assigned_at com now() (relógio real), não com o created_at
  -- da mensagem; o que importa aqui é que o nó NÃO mexe nele.
  v_antes := pg_temp.desde(4);
  v_sess := pg_temp.sessao(4, MON + interval '9 hours');
  v_txt := pg_temp.motor_transfere(4, U_ANA, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B3', 'B3b. nó nomeando Ana: already_owned', 'already_owned', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B3', 'B3c. o dono continua o Bruno', 'Bruno', pg_temp.dono(4));
  PERFORM pg_temp.afirma(p_phase, 'B3', 'B3d. assigned_at é o da chegada (rodízio), não o do nó', v_antes, pg_temp.desde(4));
  PERFORM pg_temp.afirma(p_phase, 'B3', 'B3e. Ana não é avisada', '0|0|0', pg_temp.sino(U_ANA));
  PERFORM pg_temp.humano(4, MON + interval '60 days');

  -- ===================== B4. Pessoa inelegível =====================
  -- (a) suspensa, rodízio after_bot ligado → vai para o rodízio (Bruno 100 %)
  PERFORM pg_temp.prefs(true, 'after_bot');
  PERFORM pg_temp.pct(0, 100);
  PERFORM pg_temp.limpa_sino();
  v_sess := pg_temp.sessao(5, MON + interval '9 hours');
  v_conv := pg_temp.chega(5, MON + interval '9 hours');
  v_txt := pg_temp.motor_transfere(5, U_CARLA, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4a. Carla suspensa: ineligible', 'ineligible', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4b. ...o fim da sessão entregou ao rodízio (Bruno)', 'Bruno', pg_temp.dono(5));
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4c. Carla não é avisada', '0|0|0', pg_temp.sino(U_CARLA));
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4d. Bruno tampouco (rodízio é mudo)', '0|0|0', pg_temp.sino(U_BRUNO));
  PERFORM pg_temp.humano(5, MON + interval '60 days');
  -- (b) de outra Loja
  v_sess := pg_temp.sessao(6, MON + interval '9 hours');
  v_conv := pg_temp.chega(6, MON + interval '9 hours');
  v_txt := pg_temp.motor_transfere(6, U_DANI, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4e. Dani (ativa, mas da Loja B2): ineligible', 'ineligible', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4f. ...rodízio entregou (Bruno)', 'Bruno', pg_temp.dono(6));
  PERFORM pg_temp.humano(6, MON + interval '60 days');
  -- (c) id que não resolve
  v_sess := pg_temp.sessao(7, MON + interval '9 hours');
  v_conv := pg_temp.chega(7, MON + interval '9 hours');
  v_txt := pg_temp.motor_transfere(7, '88888888-0000-4000-8000-0000000000ee', MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4g. user_id inexistente: ineligible', 'ineligible', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4h. ...rodízio entregou (Bruno)', 'Bruno', pg_temp.dono(7));
  PERFORM pg_temp.humano(7, MON + interval '60 days');
  -- (d) gerente (vive na Conta; cargo não atende na Loja)
  v_sess := pg_temp.sessao(8, MON + interval '9 hours');
  v_conv := pg_temp.chega(8, MON + interval '9 hours');
  v_txt := pg_temp.motor_transfere(8, U_GER, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4i. gerente nomeado: ineligible', 'ineligible', v_txt);
  PERFORM pg_temp.humano(8, MON + interval '60 days');
  -- (e) suspensa e rodízio DESLIGADO → fica sem dono (comportamento de hoje)
  PERFORM pg_temp.prefs(NULL);
  v_sess := pg_temp.sessao(9, MON + interval '9 hours');
  v_conv := pg_temp.chega(9, MON + interval '9 hours');
  v_txt := pg_temp.motor_transfere(9, U_CARLA, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4j. Carla suspensa, rodízio desligado: ineligible...', 'ineligible', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B4', 'B4k. ...e a conversa fica sem responsável (hoje)', '<null>', pg_temp.dono(9));
  PERFORM pg_temp.humano(9, MON + interval '60 days');

  -- ===================== B5. Guarda no WHERE (corrida) =====================
  PERFORM pg_temp.prefs(NULL);
  PERFORM pg_temp.limpa_sino();
  v_sess := pg_temp.sessao(10, MON + interval '9 hours');
  v_conv := pg_temp.chega(10, MON + interval '9 hours');
  v_txt := pg_temp.motor_transfere(10, U_ANA, MON + interval '9 hours 5 minutes', P_BRUNO);
  PERFORM pg_temp.afirma(p_phase, 'B5', 'B5a. alguém atribuiu entre a checagem e o UPDATE: lost_race', 'lost_race', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'B5', 'B5b. o dono da corrida fica (Bruno), não a Ana do nó', 'Bruno', pg_temp.dono(10));
  PERFORM pg_temp.afirma(p_phase, 'B5', 'B5c. Ana não é avisada de conversa que não recebeu', '0|0|0', pg_temp.sino(U_ANA));
  PERFORM pg_temp.humano(10, MON + interval '60 days');

  -- ===================== B6. "Qualquer atendente": nada muda =====================
  PERFORM pg_temp.prefs(true, 'after_bot');
  PERFORM pg_temp.pct(0, 100);
  PERFORM pg_temp.limpa_sino();
  v_sess := pg_temp.sessao(11, MON + interval '9 hours');
  v_conv := pg_temp.chega(11, MON + interval '9 hours');
  PERFORM pg_temp.motor_any(11, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B6', 'B6a. any + after_bot: o fim da sessão entregou ao rodízio (Bruno)', 'Bruno', pg_temp.dono(11));
  PERFORM pg_temp.afirma(p_phase, 'B6', 'B6b. ...sem aviso (rodízio é mudo)', '0|0|0', pg_temp.sino(U_BRUNO));
  PERFORM pg_temp.humano(11, MON + interval '60 days');
  PERFORM pg_temp.prefs(NULL);
  v_sess := pg_temp.sessao(12, MON + interval '9 hours');
  v_conv := pg_temp.chega(12, MON + interval '9 hours');
  PERFORM pg_temp.motor_any(12, MON + interval '9 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'B6', 'B6c. any + rodízio desligado: fica sem responsável', '<null>', pg_temp.dono(12));
  PERFORM pg_temp.humano(12, MON + interval '60 days');

  -- ===================== B7. Referência da regra de tempo =====================
  -- Espera começa 09:30 (inbound); bot entrega à Ana às 10:00 (assigned_at = fim
  -- da sessão = 10:00). Regra 60 min: referência = GREATEST(09:30, 10:00, 10:00)
  -- = 10:00 → transfere às 11:00, não antes. Rodízio ligado para haver "próximo".
  PERFORM pg_temp.prefs(true, 'after_bot', true, 60);
  PERFORM pg_temp.pct(50, 50);
  PERFORM pg_temp.limpa_sino();
  v_sess := pg_temp.sessao(13, MON + interval '9 hours 30 minutes');
  v_conv := pg_temp.chega(13, MON + interval '9 hours 30 minutes');
  v_txt := pg_temp.motor_transfere(13, U_ANA, MON + interval '10 hours');
  PERFORM pg_temp.afirma(p_phase, 'B7', 'B7a. entregue à Ana às 10:00', 'Ana', pg_temp.dono(13));
  SELECT public.response_rule_sweep(MON + interval '10 hours 58 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'B7', 'B7b. 10:58 — 58 min desde a entrega (88 desde a espera): NÃO transfere', '0', n::text);
  PERFORM pg_temp.afirma(p_phase, 'B7', 'B7c. ...continua com a Ana', 'Ana', pg_temp.dono(13));
  SELECT public.response_rule_sweep(MON + interval '11 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'B7', 'B7d. 11:00 — 60 min desde a entrega: transfere', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'B7', 'B7e. ...para o próximo do rodízio (Bruno)', 'Bruno', pg_temp.dono(13));
  PERFORM pg_temp.afirma(p_phase, 'B7', 'B7f. a regra de tempo avisa quem recebeu (o aviso dela, não o do nó)', '1', (SELECT count(*) FROM public.notifications WHERE user_id = U_BRUNO AND title = 'Conversa transferida para você')::text);
  PERFORM pg_temp.humano(13, MON + interval '60 days');

  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.prefs(NULL);
END
$fn$;

-- -----------------------------------------------------------------------------
-- 4. Fase 1 — como está
-- -----------------------------------------------------------------------------
SELECT pg_temp.bateria('1-intacto');

-- -----------------------------------------------------------------------------
-- 5. SABOTAGEM (descomente para provar que a suíte sabe falhar)
--    Tira o guarda "sem responsável" do motor espelhado: nem checagem prévia,
--    nem `AND assigned_profile_id IS NULL` no WHERE. Esperado: B2a–B2e, B3b–B3e
--    e B5a–B5c vermelhos (o nó passa a roubar conversa de quem já a tem e a
--    avisar a Ana); o resto verde. Desfeito pelo ROLLBACK.
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION pg_temp.motor_transfere(p_n int, p_user uuid, p_at timestamptz, p_race uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $sab$
-- DECLARE LOJA constant uuid := '88888888-0000-4000-8000-000000000002'; v_prof uuid; v_conv uuid; v_out text;
-- BEGIN
--   PERFORM pg_temp.ninguem();
--   PERFORM pg_temp.bot(p_n, p_at);
--   SELECT p.id INTO v_prof FROM public.profiles p
--    WHERE p.user_id = p_user AND p.tenant_id = LOJA AND p.status = 'active'
--      AND p.role IN ('atendente'::public.user_role, 'gestor'::public.user_role);
--   IF v_prof IS NULL THEN v_out := 'ineligible';
--   ELSE
--     SELECT c.id INTO v_conv FROM public.conversations c WHERE c.tenant_id = LOJA AND c.contact_id = pg_temp.contato(p_n);
--     IF p_race IS NOT NULL THEN
--       UPDATE public.conversations SET assigned_profile_id = p_race, assigned_at = p_at, assigned_by = NULL WHERE id = v_conv;
--     END IF;
--     UPDATE public.conversations SET assigned_profile_id = v_prof, assigned_at = p_at, assigned_by = NULL WHERE id = v_conv;  -- SEM guarda
--     v_out := 'assigned';
--     INSERT INTO public.notifications (tenant_id, user_id, title, message, type, metadata)
--     VALUES (LOJA, p_user, 'Conversa transferida', 'sabotado', 'info', jsonb_build_object('session_id', gen_random_uuid()));
--   END IF;
--   UPDATE public.chatbot_sessions SET status = 'transferred', ended_at = p_at, updated_at = p_at
--    WHERE contact_id = pg_temp.contato(p_n) AND status = 'active';
--   RETURN v_out;
-- END; $sab$;
-- DELETE FROM public.messages WHERE tenant_id = '88888888-0000-4000-8000-000000000002';
-- DELETE FROM public.chatbot_sessions WHERE tenant_id = '88888888-0000-4000-8000-000000000002';
-- DELETE FROM public.conversations WHERE tenant_id = '88888888-0000-4000-8000-000000000002';
-- SELECT pg_temp.bateria('2-sabotado');

-- -----------------------------------------------------------------------------
-- 6. Placar
-- -----------------------------------------------------------------------------
SELECT phase,
       count(*) FILTER (WHERE status='ok')   AS passou,
       count(*) FILTER (WHERE status='FAIL') AS falhou,
       CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0
            THEN 'SUITE VERDE' ELSE 'SUITE VERMELHA' END AS placar,
       coalesce(string_agg(check_kind || ' [esperado ' || expected || ', obtido ' || actual || ']', '; ' ORDER BY seq)
                FILTER (WHERE status='FAIL'), '-') AS falhas
FROM _tb_results GROUP BY phase ORDER BY phase;

ROLLBACK;
