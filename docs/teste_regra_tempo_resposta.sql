-- =============================================================================
-- teste_regra_tempo_resposta.sql — rede de segurança da migração
-- 20260916000001_conversation_response_rule (passo 5 da atribuição).
--
-- O QUE FAZ
--   Semeia UMA organização falsa (Conta T + Loja T) com gerente, gestor, Ana e
--   Bruno (atendentes), uma instância, um bot v2 e 60 contatos, e afirma,
--   cenário a cenário, com o relógio INJETADO (p_now) — nada aqui espera o cron:
--
--   T0  regra desligada (settings {}, NULL, false): nada muda — varredura 0,
--       dono intacto, contador 0, sino mudo.
--   T1  violação DENTRO do horário transfere (60 min → 11:00); o mesmo tempo
--       de relógio FORA do horário não transfere (22:00 → só às 10:00 do dia
--       seguinte; sexta 17:30 → só segunda 09:30). assigned_by fica NULL, o
--       sino toca para quem recebeu.
--   T2  o relógio conta do INÍCIO da espera: cliente mandando "oi?" três vezes
--       não zera nada.
--   T3  resposta do BOT não é resposta humana e não para o relógio — mesmo
--       com last_message_direction = 'outbound'.
--   T4  sessão ativa de chatbot: nunca transfere; quando a sessão termina, o
--       relógio do humano começa no fim da sessão.
--   T5  nunca o dono atual: com o dono como único elegível, não transfere,
--       avisa gestor e gerente UMA vez e não tenta de novo.
--   T6  limite de transferências (3): 11:00, 12:00, 13:00 e às 14:00 avisa o
--       gestor em vez de transferir; contador para em 3.
--   T7  resposta humana zera contador e aviso; a espera seguinte conta do zero.
--   T8  ninguém elegível: nada acontece, gestor avisado uma vez, dez
--       varreduras seguidas não geram tempestade.
--   T9  intervalo mínimo: varreduras a cada 2 min nunca transferem a mesma
--       conversa duas vezes seguidas; a segunda só depois de outros 60 min.
--   T10 uma conversa explodindo na varredura não impede as outras.
--   T11 CHECK das quatro chaves em tenants.settings.
--   T12 A NOITE: cliente escreve segunda 22:00, regra ligada, horário 09–18,
--       varredura a cada 2 min até as 09:00 de terça: ZERO transferências.
--       Seguindo até as 14:00: exatamente 3 (10:00, 11:00, 12:00) e o aviso
--       às 13:00.
--   T13 horário próprio (sábado 08–12, segunda 14–20) é respeitado.
--   T14 business_minutes_between: fim de semana, dia fechado, fuso, fuso
--       inválido, start/end malformados.
--   T15 arquivada, sem responsável e já escalada ficam fora.
--   T16 RPC de prévia: gestor recebe contagens; atendente recebe vazio.
--
-- SEGURANÇA — por que dá para rodar contra produção
--   BEGIN ... ROLLBACK incondicional. UUIDs de fixture com prefixo 77777777-.
--   Guarda de colisão antes de semear. Nenhuma varredura de cron é esperada:
--   response_rule_sweep(p_now) é chamada à mão. A sabotagem da seção 5 troca
--   funções DENTRO da transação — e o ROLLBACK desfaz tudo de qualquer jeito.
--
-- COMO RODAR
--   Papel `postgres` (SQL Editor ou o MCP de escrita), o arquivo inteiro de
--   uma vez. O placar sai no fim.
--
-- MODO AUTO-TESTE (prova que a suíte sabe falhar)
--   Descomente o bloco SABOTAGEM da seção 5: troca o detector pelo ingênuo
--   que olha last_message_direction (o que a migração diz para NÃO fazer).
--   Esperado: T3 vermelho (bot falou por último → o ingênuo não vê a espera),
--   mais efeitos colaterais da segunda rodada.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id::text LIKE '77777777-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com tenant real. Nada foi feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '77777777-%') THEN
    RAISE EXCEPTION 'ABORTADO: UUID de fixture colide com usuário real do Auth. Nada foi feito.';
  END IF;
  IF to_regprocedure('public.response_rule_sweep(timestamptz)') IS NULL
     OR to_regprocedure('public.rotation_pick(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migração 20260916000001 (ou a 20260915000001) ainda não foi aplicada.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Semeadura (triggers e FK suspensos)
-- -----------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('77777777-0000-4000-8000-00000000000a','authenticated','authenticated','fix-t-gerente@fixture.invalid', now(), now()),
  ('77777777-0000-4000-8000-00000000000b','authenticated','authenticated','fix-t-gestor@fixture.invalid',  now(), now()),
  ('77777777-0000-4000-8000-00000000000c','authenticated','authenticated','fix-t-ana@fixture.invalid',     now(), now()),
  ('77777777-0000-4000-8000-00000000000d','authenticated','authenticated','fix-t-bruno@fixture.invalid',   now(), now());

INSERT INTO public.tenants (id, name, slug, kind, parent_tenant_id, status, subscription_status) VALUES
  ('77777777-0000-4000-8000-000000000001','FIXTURE Conta T','fixture-conta-t','account', NULL,'active','active'),
  ('77777777-0000-4000-8000-000000000002','FIXTURE Loja T', 'fixture-loja-t', 'store','77777777-0000-4000-8000-000000000001','active',NULL);

INSERT INTO public.profiles (id, user_id, tenant_id, role, parent_id, status, first_name, last_name, created_at) VALUES
  ('77777777-0000-4000-8000-0000000000fa','77777777-0000-4000-8000-00000000000a','77777777-0000-4000-8000-000000000001','gerente',   NULL,'active','FIX','Gerente','2026-01-01 10:00+00'),
  ('77777777-0000-4000-8000-0000000000fb','77777777-0000-4000-8000-00000000000b','77777777-0000-4000-8000-000000000002','gestor',   '77777777-0000-4000-8000-0000000000fa','active','FIX','Gestor','2026-01-01 10:01+00'),
  ('77777777-0000-4000-8000-0000000000fc','77777777-0000-4000-8000-00000000000c','77777777-0000-4000-8000-000000000002','atendente','77777777-0000-4000-8000-0000000000fb','active','FIX','Ana','2026-01-01 10:02+00'),
  ('77777777-0000-4000-8000-0000000000fd','77777777-0000-4000-8000-00000000000d','77777777-0000-4000-8000-000000000002','atendente','77777777-0000-4000-8000-0000000000fb','active','FIX','Bruno','2026-01-01 10:03+00');

INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key) VALUES
  ('77777777-aaaa-4000-8000-000000000002','77777777-0000-4000-8000-000000000002','FIX instancia T','fix-key-t');

INSERT INTO public.chatbots (id, tenant_id, whatsapp_instance_id, name, is_active, is_published, builder_version) VALUES
  ('77777777-bbbb-4000-8000-000000000001','77777777-0000-4000-8000-000000000002','77777777-aaaa-4000-8000-000000000002','FIX bot T', true, false, 2);

INSERT INTO public.contacts (id, tenant_id, whatsapp_instance_id, phone, name)
SELECT ('77777777-cccc-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       '77777777-0000-4000-8000-000000000002',
       '77777777-aaaa-4000-8000-000000000002',
       '55529' || lpad(n::text, 8, '0'),
       'FIX contato ' || n
  FROM generate_series(1, 60) n;

SET LOCAL session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- 2. Infra dos checks
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _rr_results (
  seq serial, phase text, cenario text, check_kind text, expected text, actual text, status text
) ON COMMIT DROP;
GRANT ALL ON _rr_results TO authenticated;
GRANT ALL ON SEQUENCE _rr_results_seq_seq TO authenticated;

CREATE FUNCTION pg_temp.afirma(p_phase text, p_cenario text, p_check text, p_expected text, p_actual text) RETURNS void
LANGUAGE sql AS $f$
  INSERT INTO _rr_results(phase, cenario, check_kind, expected, actual, status)
  VALUES (p_phase, p_cenario, p_check, p_expected, p_actual,
          CASE WHEN p_expected = p_actual THEN 'ok' ELSE 'FAIL' END);
$f$;

CREATE FUNCTION pg_temp.como(p_sub uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$f$;
CREATE FUNCTION pg_temp.ninguem() RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', '', true);
$f$;

-- Preferências da Loja T. p_enabled NULL = settings {}.
CREATE FUNCTION pg_temp.prefs(p_enabled boolean, p_minutes int DEFAULT 60, p_max int DEFAULT 3, p_bh jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.tenants
     SET settings = CASE WHEN p_enabled IS NULL THEN '{}'::jsonb
                         ELSE jsonb_strip_nulls(jsonb_build_object(
                                'response_rule_enabled', p_enabled,
                                'response_rule_minutes', p_minutes,
                                'response_rule_max_transfers', p_max,
                                'business_hours', p_bh)) END
   WHERE id = '77777777-0000-4000-8000-000000000002';
END;
$f$;

CREATE FUNCTION pg_temp.contato(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('77777777-cccc-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid;
$f$;

-- O webhook: inbound do contato N em p_at, sem pessoa logada. Devolve a conversa.
CREATE FUNCTION pg_temp.chega(p_n int, p_at timestamptz, p_content text DEFAULT 'FIX inbound') RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_conv uuid;
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, created_at)
  VALUES ('77777777-0000-4000-8000-000000000002', '77777777-aaaa-4000-8000-000000000002', pg_temp.contato(p_n), 'inbound', 'text', p_content, 'received', p_at)
  RETURNING conversation_id INTO v_conv;
  RETURN v_conv;
END;
$f$;

-- Resposta HUMANA (outbound, is_from_bot false, source NULL) em p_at.
CREATE FUNCTION pg_temp.humano(p_n int, p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot, source, created_at)
  VALUES ('77777777-0000-4000-8000-000000000002', '77777777-aaaa-4000-8000-000000000002', pg_temp.contato(p_n), 'outbound', 'text', 'FIX humano', 'sent', false, NULL, p_at);
END;
$f$;

-- Resposta do BOT (outbound, is_from_bot true, source chatbot) em p_at.
CREATE FUNCTION pg_temp.bot(p_n int, p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM pg_temp.ninguem();
  INSERT INTO public.messages (tenant_id, whatsapp_instance_id, contact_id, direction, message_type, content, status, is_from_bot, source, created_at)
  VALUES ('77777777-0000-4000-8000-000000000002', '77777777-aaaa-4000-8000-000000000002', pg_temp.contato(p_n), 'outbound', 'text', 'FIX bot', 'sent', true, 'chatbot', p_at);
END;
$f$;

-- Dá dono à conversa do contato N (como o rodízio faria: assigned_by NULL).
CREATE FUNCTION pg_temp.atribui(p_n int, p_profile uuid, p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM pg_temp.ninguem();
  UPDATE public.conversations
     SET assigned_profile_id = p_profile, assigned_at = p_at, assigned_by = NULL
   WHERE tenant_id = '77777777-0000-4000-8000-000000000002' AND contact_id = pg_temp.contato(p_n);
END;
$f$;

-- Encerra a espera da conversa N para sempre: resposta humana 60 dias à frente.
-- Cada cenário fecha o que abriu, senão a conversa dele violaria na varredura
-- do cenário seguinte (as varreduras aqui andam no tempo fora de ordem).
CREATE FUNCTION pg_temp.fecha(p_n int) RETURNS void LANGUAGE sql AS $f$
  SELECT pg_temp.humano(p_n, '2026-09-21 00:00-03'::timestamptz + interval '60 days');
$f$;

CREATE FUNCTION pg_temp.varre(p_at timestamptz) RETURNS int LANGUAGE sql AS $f$
  SELECT public.response_rule_sweep(p_at);
$f$;

-- Varre a cada p_step de p_from até p_to (inclusive). Devolve "n_transfers|hh:mm,hh:mm" (horários em SP).
CREATE FUNCTION pg_temp.varre_ate(p_from timestamptz, p_to timestamptz, p_step interval DEFAULT '2 minutes') RETURNS text LANGUAGE plpgsql AS $f$
DECLARE t timestamptz := p_from; n int; total int := 0; horarios text := '';
BEGIN
  WHILE t <= p_to LOOP
    n := public.response_rule_sweep(t);
    IF n > 0 THEN
      total := total + n;
      horarios := horarios || CASE WHEN horarios = '' THEN '' ELSE ',' END || to_char(t AT TIME ZONE 'America/Sao_Paulo', 'Dy HH24:MI');
    END IF;
    t := t + p_step;
  END LOOP;
  RETURN total::text || '|' || horarios;
END;
$f$;

CREATE FUNCTION pg_temp.dono(p_n int) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(p.last_name, '<null>')
    FROM public.conversations c
    LEFT JOIN public.profiles p ON p.id = c.assigned_profile_id
   WHERE c.tenant_id = '77777777-0000-4000-8000-000000000002' AND c.contact_id = pg_temp.contato(p_n);
$f$;

-- "count|last_at|escalado" da conversa do contato N.
CREATE FUNCTION pg_temp.estado(p_n int) RETURNS text LANGUAGE sql AS $f$
  SELECT c.auto_transfer_count::text || '|'
      || coalesce(to_char(c.auto_transfer_last_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'), '-') || '|'
      || CASE WHEN c.response_rule_escalated_at IS NULL THEN 'não' ELSE 'sim' END
    FROM public.conversations c
   WHERE c.tenant_id = '77777777-0000-4000-8000-000000000002' AND c.contact_id = pg_temp.contato(p_n);
$f$;

-- Quantas notificações com metadata.reason = p_reason o usuário tem (para a conversa do contato N, se dado).
CREATE FUNCTION pg_temp.sino(p_user uuid, p_reason text, p_n int DEFAULT NULL) RETURNS int LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.notifications n
   WHERE n.user_id = p_user AND n.metadata ->> 'reason' = p_reason
     AND (p_n IS NULL OR (n.metadata ->> 'contact_id')::uuid = pg_temp.contato(p_n));
$f$;

CREATE FUNCTION pg_temp.total_sino() RETURNS int LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.notifications n WHERE n.tenant_id = '77777777-0000-4000-8000-000000000002';
$f$;

-- Grava porcentagens direto (papel postgres): "Ana=100,Bruno=0".
CREATE FUNCTION pg_temp.pct(p_ana int, p_bruno int) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.conversation_rotation SET percent = p_ana,   credit = 0 WHERE tenant_id = '77777777-0000-4000-8000-000000000002' AND profile_id = '77777777-0000-4000-8000-0000000000fc';
  UPDATE public.conversation_rotation SET percent = p_bruno, credit = 0 WHERE tenant_id = '77777777-0000-4000-8000-000000000002' AND profile_id = '77777777-0000-4000-8000-0000000000fd';
END;
$f$;

-- Tenta gravar settings; devolve 'ok' ou o SQLSTATE.
CREATE FUNCTION pg_temp.tenta_settings(p_json jsonb) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.tenants SET settings = p_json WHERE id = '77777777-0000-4000-8000-000000000002';
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$f$;

-- -----------------------------------------------------------------------------
-- 3. A bateria
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.bateria(p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  LOJA    constant uuid := '77777777-0000-4000-8000-000000000002';
  INST    constant uuid := '77777777-aaaa-4000-8000-000000000002';
  BOT     constant uuid := '77777777-bbbb-4000-8000-000000000001';
  U_GER   constant uuid := '77777777-0000-4000-8000-00000000000a';
  U_GES   constant uuid := '77777777-0000-4000-8000-00000000000b';
  U_ANA   constant uuid := '77777777-0000-4000-8000-00000000000c';
  U_BRUNO constant uuid := '77777777-0000-4000-8000-00000000000d';
  P_ANA   constant uuid := '77777777-0000-4000-8000-0000000000fc';
  P_BRUNO constant uuid := '77777777-0000-4000-8000-0000000000fd';
  -- Semana de referência: 2026-09-21 é segunda-feira. Brasil sem horário de verão: -03 o ano todo.
  MON     constant timestamptz := '2026-09-21 00:00-03';
  n int; v_txt text; v_conv uuid; v_conv2 uuid; v_sino int; v_dir text; v_sess uuid;
BEGIN
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM public.rotation_rebalance(LOJA);   -- Ana 50 / Bruno 50 (o rodízio NÃO precisa estar ligado)

  -- ===================== T0. Desligada = nada muda =====================
  PERFORM pg_temp.prefs(NULL);
  v_conv := pg_temp.chega(1, MON + interval '10 hours');
  PERFORM pg_temp.atribui(1, P_ANA, MON + interval '9 hours');
  SELECT pg_temp.varre(MON + interval '13 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T0', 'T0a. settings {}: varredura devolve 0', '0', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T0', 'T0b. ...dono intacto', 'Ana', pg_temp.dono(1));
  PERFORM pg_temp.afirma(p_phase, 'T0', 'T0c. ...contador zerado, sem aviso', '0|-|não', pg_temp.estado(1));
  UPDATE public.tenants SET settings = NULL WHERE id = LOJA;
  SELECT pg_temp.varre(MON + interval '13 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T0', 'T0d. settings NULL: idem', '0', n::text);
  PERFORM pg_temp.prefs(false, 60, 3);
  SELECT pg_temp.varre(MON + interval '13 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T0', 'T0e. response_rule_enabled=false explícito: idem', '0', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T0', 'T0f. sino mudo', '0', pg_temp.total_sino()::text);
  SELECT public.response_rule_transfer(v_conv, MON + interval '13 hours') INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'T0', 'T0g. até a transferência chamada à mão recusa com a regra desligada', 'skipped', v_txt);
  PERFORM pg_temp.fecha(1);

  -- ===================== T1. Dentro do horário transfere; fora, não =====================
  PERFORM pg_temp.prefs(true, 60, 3);
  v_conv := pg_temp.chega(2, MON + interval '10 hours');
  PERFORM pg_temp.atribui(2, P_ANA, MON + interval '9 hours');
  SELECT pg_temp.varre(MON + interval '10 hours 59 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1a. 59 min de funcionamento: não transfere', '0', n::text);
  SELECT pg_temp.varre(MON + interval '11 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1b. 60 min de funcionamento: transfere', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1c. ...para o Bruno (nunca a Ana, que era a dona)', 'Bruno', pg_temp.dono(2));
  SELECT assigned_by IS NULL AND to_char(assigned_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') = '11:00' INTO v_txt FROM public.conversations WHERE id = v_conv;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1d. assigned_by NULL (ninguém passou) e assigned_at = 11:00', 'true', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1e. contador 1, última 11:00, sem aviso ao gestor', '1|11:00|não', pg_temp.estado(2));
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1f. o sino toca para o Bruno', '1', pg_temp.sino(U_BRUNO, 'response_rule', 2)::text);
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1g. ...e não para a Ana', '0', pg_temp.sino(U_ANA, 'response_rule', 2)::text);
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = U_BRUNO AND title = 'Conversa transferida' AND (metadata ->> 'conversation_id')::uuid = v_conv;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1h. o sino do passo 3 (trigger) continuou mudo: nenhuma "Conversa transferida"', '0', n::text);
  -- ===================== T9 (aqui, sobre a conversa 2). Intervalo mínimo =====================
  SELECT pg_temp.varre(MON + interval '11 hours 2 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T9', 'T9a. 2 min depois da transferência: não transfere de novo', '0', n::text);
  SELECT pg_temp.varre(MON + interval '11 hours 58 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T9', 'T9b. 58 min depois: ainda não', '0', n::text);
  SELECT pg_temp.varre(MON + interval '12 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T9', 'T9c. 60 min depois: a segunda transferência', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T9', 'T9d. ...volta para a Ana (nunca o Bruno, dono da vez)', 'Ana', pg_temp.dono(2));
  PERFORM pg_temp.afirma(p_phase, 'T9', 'T9e. contador 2', '2|12:00|não', pg_temp.estado(2));
  PERFORM pg_temp.fecha(2);


  -- Fora do horário: 22:00 de segunda.
  v_conv := pg_temp.chega(3, MON + interval '22 hours');
  PERFORM pg_temp.atribui(3, P_ANA, MON + interval '21 hours');
  SELECT pg_temp.varre(MON + interval '23 hours 30 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1i. 90 min de RELÓGIO fora do horário: não transfere', '0', n::text);
  SELECT pg_temp.varre(MON + interval '1 day 9 hours 30 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1j. terça 09:30 (30 min abertos): ainda não', '0', n::text);
  SELECT pg_temp.varre(MON + interval '1 day 10 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1k. terça 10:00 (60 min abertos): transfere', '1', n::text);
  PERFORM pg_temp.fecha(3);
  -- Fim de semana: sexta 17:30.
  v_conv := pg_temp.chega(4, MON + interval '4 days 17 hours 30 minutes');
  PERFORM pg_temp.atribui(4, P_ANA, MON + interval '4 days 17 hours');
  SELECT pg_temp.varre(MON + interval '5 days 12 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1l. sábado meio-dia: não transfere (30 min abertos na sexta)', '0', n::text);
  SELECT pg_temp.varre(MON + interval '7 days 9 hours 29 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1m. segunda seguinte 09:29 (59 min): ainda não', '0', n::text);
  SELECT pg_temp.varre(MON + interval '7 days 9 hours 30 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T1', 'T1n. segunda seguinte 09:30 (60 min): transfere', '1', n::text);
  PERFORM pg_temp.fecha(4);

  -- ===================== T2. Relógio do INÍCIO da espera =====================
  v_conv := pg_temp.chega(5, MON + interval '10 hours');
  PERFORM pg_temp.atribui(5, P_ANA, MON + interval '9 hours');
  PERFORM pg_temp.chega(5, MON + interval '10 hours 30 minutes', 'oi?');
  PERFORM pg_temp.chega(5, MON + interval '10 hours 50 minutes', 'oi??');
  SELECT to_char(last_message_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') INTO v_txt FROM public.conversations WHERE id = v_conv;
  PERFORM pg_temp.afirma(p_phase, 'T2', 'T2a. last_message_at é 10:50 (a última mensagem)', '10:50', v_txt);
  SELECT pg_temp.varre(MON + interval '11 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T2', 'T2b. ...mas às 11:00 transfere: o relógio contou das 10:00, não das 10:50', '1', n::text);
  PERFORM pg_temp.fecha(5);

  -- ===================== T3. Bot não é resposta =====================
  v_conv := pg_temp.chega(6, MON + interval '10 hours');
  PERFORM pg_temp.atribui(6, P_ANA, MON + interval '9 hours');
  PERFORM pg_temp.bot(6, MON + interval '10 hours 5 minutes');
  SELECT last_message_direction INTO v_dir FROM public.conversations WHERE id = v_conv;
  PERFORM pg_temp.afirma(p_phase, 'T3', 'T3a. depois do bot, last_message_direction diz outbound', 'outbound', v_dir);
  SELECT pg_temp.varre(MON + interval '11 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T3', 'T3b. ...e mesmo assim transfere às 11:00: bot não parou o relógio', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T3', 'T3c. ...para o Bruno', 'Bruno', pg_temp.dono(6));
  PERFORM pg_temp.fecha(6);

  -- ===================== T4. Sessão ativa de bot =====================
  v_conv := pg_temp.chega(7, MON + interval '10 hours');
  PERFORM pg_temp.atribui(7, P_ANA, MON + interval '9 hours');
  INSERT INTO public.chatbot_sessions (id, chatbot_id, contact_id, tenant_id, whatsapp_instance_id, status, started_at, last_activity_at)
  VALUES ('77777777-eeee-4000-8000-000000000007', BOT, pg_temp.contato(7), LOJA, INST, 'active', MON + interval '10 hours', MON + interval '10 hours')
  RETURNING id INTO v_sess;
  SELECT pg_temp.varre(MON + interval '13 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T4', 'T4a. sessão ativa há 3 h: não transfere', '0', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T4', 'T4b. ...dono intacto', 'Ana', pg_temp.dono(7));
  -- O motor encerra a sessão às 13:00.
  PERFORM pg_temp.ninguem();
  UPDATE public.chatbot_sessions SET status = 'completed', ended_at = MON + interval '13 hours' WHERE id = v_sess;
  SELECT pg_temp.varre(MON + interval '13 hours 2 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T4', 'T4c. sessão encerrada há 2 min: NÃO transfere — o relógio do humano começa quando o bot solta', '0', n::text);
  SELECT pg_temp.varre(MON + interval '13 hours 59 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T4', 'T4d. 59 min depois do fim da sessão: ainda não', '0', n::text);
  SELECT pg_temp.varre(MON + interval '14 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T4', 'T4e. 60 min depois do fim da sessão: transfere', '1', n::text);
  PERFORM pg_temp.fecha(7);

  -- ===================== T5. Nunca o dono atual =====================
  PERFORM pg_temp.pct(100, 0);                   -- só a Ana no rodízio
  v_conv := pg_temp.chega(8, MON + interval '10 hours');
  PERFORM pg_temp.atribui(8, P_ANA, MON + interval '9 hours');
  v_sino := pg_temp.total_sino();
  SELECT pg_temp.varre(MON + interval '11 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T5', 'T5a. Ana é a única elegível e a dona: não transfere', '0', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T5', 'T5b. ...continua com a Ana', 'Ana', pg_temp.dono(8));
  PERFORM pg_temp.afirma(p_phase, 'T5', 'T5c. ...gestor avisado (sem alvo)', '1', pg_temp.sino(U_GES, 'response_rule_no_target', 8)::text);
  PERFORM pg_temp.afirma(p_phase, 'T5', 'T5d. ...gerente da Conta acima também', '1', pg_temp.sino(U_GER, 'response_rule_no_target', 8)::text);
  PERFORM pg_temp.afirma(p_phase, 'T5', 'T5e. ...escalada, contador 0', '0|-|sim', pg_temp.estado(8));
  SELECT pg_temp.varre(MON + interval '11 hours 2 minutes') INTO n;
  SELECT pg_temp.varre(MON + interval '13 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T5', 'T5f. duas varreduras depois: nenhum aviso a mais (sem tempestade)', (v_sino + 2)::text, pg_temp.total_sino()::text);
  PERFORM pg_temp.pct(50, 50);
  PERFORM pg_temp.fecha(8);

  -- ===================== T6. Limite de transferências =====================
  v_conv := pg_temp.chega(9, MON + interval '10 hours');
  PERFORM pg_temp.atribui(9, P_ANA, MON + interval '9 hours');
  SELECT pg_temp.varre_ate(MON + interval '10 hours', MON + interval '15 hours') INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'T6', 'T6a. varrendo a cada 2 min das 10:00 às 15:00: exatamente 3 transferências, às 11:00, 12:00 e 13:00', '3|Mon 11:00,Mon 12:00,Mon 13:00', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'T6', 'T6b. Ana→Bruno→Ana→Bruno: termina com o Bruno', 'Bruno', pg_temp.dono(9));
  PERFORM pg_temp.afirma(p_phase, 'T6', 'T6c. contador parou em 3, última 13:00, escalada', '3|13:00|sim', pg_temp.estado(9));
  SELECT to_char(response_rule_escalated_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') INTO v_txt FROM public.conversations WHERE id = v_conv;
  PERFORM pg_temp.afirma(p_phase, 'T6', 'T6d. o aviso ao gestor foi às 14:00 (a 4ª janela)', '14:00', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'T6', 'T6e. gestor avisado uma vez (limite)', '1', pg_temp.sino(U_GES, 'response_rule_max', 9)::text);
  PERFORM pg_temp.afirma(p_phase, 'T6', 'T6f. Bruno recebeu 2 toques, Ana 1', '2/1', pg_temp.sino(U_BRUNO, 'response_rule', 9)::text || '/' || pg_temp.sino(U_ANA, 'response_rule', 9)::text);
  SELECT metadata ->> 'transfer_number' INTO v_txt FROM public.notifications WHERE user_id = U_BRUNO AND metadata ->> 'reason' = 'response_rule' AND (metadata ->> 'contact_id')::uuid = pg_temp.contato(9) ORDER BY created_at DESC, (metadata ->> 'transfer_number')::int DESC LIMIT 1;
  PERFORM pg_temp.afirma(p_phase, 'T6', 'T6g. a última notificação do Bruno diz transfer_number 3', '3', v_txt);

  -- ===================== T7. Humano respondeu: zera =====================
  PERFORM pg_temp.humano(9, MON + interval '15 hours 10 minutes');
  PERFORM pg_temp.afirma(p_phase, 'T7', 'T7a. resposta humana zerou contador, última e aviso', '0|-|não', pg_temp.estado(9));
  PERFORM pg_temp.chega(9, MON + interval '15 hours 20 minutes', 'FIX nova espera');
  SELECT pg_temp.varre(MON + interval '16 hours 19 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T7', 'T7b. nova espera, 59 min: não', '0', n::text);
  SELECT pg_temp.varre(MON + interval '16 hours 20 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T7', 'T7c. nova espera, 60 min: transfere de novo (contador voltou a contar do zero)', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T7', 'T7d. contador 1', '1|16:20|não', pg_temp.estado(9));
  PERFORM pg_temp.fecha(9);
  -- Bot respondendo NÃO zera.
  v_conv := pg_temp.chega(16, MON + interval '10 hours');
  PERFORM pg_temp.atribui(16, P_ANA, MON + interval '9 hours');
  SELECT pg_temp.varre(MON + interval '11 hours') INTO n;
  PERFORM pg_temp.bot(16, MON + interval '11 hours 5 minutes');
  PERFORM pg_temp.afirma(p_phase, 'T7', 'T7e. resposta do bot não zera o contador', '1|11:00|não', pg_temp.estado(16));
  PERFORM pg_temp.fecha(16);

  -- ===================== T8. Ninguém elegível =====================
  UPDATE public.profiles SET status = 'suspended' WHERE id IN (P_ANA, P_BRUNO);
  SELECT count(*) INTO n FROM public.conversation_rotation WHERE tenant_id = LOJA;
  PERFORM pg_temp.afirma(p_phase, 'T8', 'T8a. Ana e Bruno suspensos: tabela do rodízio vazia', '0', n::text);
  v_conv := pg_temp.chega(10, MON + interval '10 hours');
  PERFORM pg_temp.atribui(10, P_ANA, MON + interval '9 hours');
  v_sino := pg_temp.total_sino();
  SELECT pg_temp.varre_ate(MON + interval '11 hours', MON + interval '11 hours 18 minutes') INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'T8', 'T8b. dez varreduras: zero transferências', '0|', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'T8', 'T8c. ...gestor e gerente avisados UMA vez cada', '2', (pg_temp.total_sino() - v_sino)::text);
  PERFORM pg_temp.afirma(p_phase, 'T8', 'T8d. ...conversa escalada, continua com a Ana', 'Ana|0|-|sim', pg_temp.dono(10) || '|' || pg_temp.estado(10));
  UPDATE public.profiles SET status = 'active' WHERE id IN (P_ANA, P_BRUNO);
  PERFORM pg_temp.afirma(p_phase, 'T8', 'T8e. reativados: rodízio refeito 50/50', '2', (SELECT count(*) FROM public.conversation_rotation WHERE tenant_id = LOJA AND percent = 50)::text);
  PERFORM pg_temp.fecha(10);

  -- ===================== T10. Uma explodindo não para as outras =====================
  v_conv  := pg_temp.chega(11, MON + interval '10 hours');
  v_conv2 := pg_temp.chega(12, MON + interval '10 hours');
  PERFORM pg_temp.atribui(11, P_ANA, MON + interval '9 hours');
  PERFORM pg_temp.atribui(12, P_ANA, MON + interval '9 hours');
  EXECUTE format($sab$
    CREATE FUNCTION public._fix_explode_77777777() RETURNS trigger LANGUAGE plpgsql AS $x$
    BEGIN
      IF NEW.id = %L::uuid THEN RAISE EXCEPTION 'FIX sabotagem: esta conversa explode'; END IF;
      RETURN NEW;
    END; $x$;
    CREATE TRIGGER _fix_explode BEFORE UPDATE OF assigned_profile_id ON public.conversations
      FOR EACH ROW EXECUTE FUNCTION public._fix_explode_77777777();
  $sab$, v_conv);
  SELECT pg_temp.varre(MON + interval '11 hours') INTO n;
  DROP TRIGGER _fix_explode ON public.conversations;
  DROP FUNCTION public._fix_explode_77777777();
  PERFORM pg_temp.afirma(p_phase, 'T10', 'T10a. varredura não estoura e devolve 1', '1', n::text);
  PERFORM pg_temp.afirma(p_phase, 'T10', 'T10b. a que explodiu continua com a Ana, intacta', 'Ana|0|-|não', pg_temp.dono(11) || '|' || pg_temp.estado(11));
  PERFORM pg_temp.afirma(p_phase, 'T10', 'T10c. a outra foi transferida', 'Bruno', pg_temp.dono(12));
  PERFORM pg_temp.fecha(11); PERFORM pg_temp.fecha(12);

  -- ===================== T11. CHECK =====================
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11a. minutos como texto: recusado', '23514', pg_temp.tenta_settings('{"response_rule_minutes": "60"}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11b. minutos 3 (< 5): recusado', '23514', pg_temp.tenta_settings('{"response_rule_minutes": 3}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11c. minutos 60.5: recusado', '23514', pg_temp.tenta_settings('{"response_rule_minutes": 60.5}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11d. limite 0: recusado', '23514', pg_temp.tenta_settings('{"response_rule_max_transfers": 0}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11e. limite 11: recusado', '23514', pg_temp.tenta_settings('{"response_rule_max_transfers": 11}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11f. enabled como texto: recusado', '23514', pg_temp.tenta_settings('{"response_rule_enabled": "sim"}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11g. business_hours como texto: recusado', '23514', pg_temp.tenta_settings('{"business_hours": "9-18"}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11h. business_hours.schedule como lista: recusado', '23514', pg_temp.tenta_settings('{"business_hours": {"schedule": []}}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11i. tudo válido: aceito', 'ok', pg_temp.tenta_settings('{"response_rule_enabled": true, "response_rule_minutes": 5, "response_rule_max_transfers": 10, "business_hours": {"timezone": "America/Manaus", "schedule": {"1": {"start": "08:00", "end": "12:00"}}}}'));
  PERFORM pg_temp.afirma(p_phase, 'T11', 'T11j. chaves ausentes: aceito (padrões)', 'ok', pg_temp.tenta_settings('{}'));
  PERFORM pg_temp.prefs(true, 60, 3);

  -- ===================== T12. A NOITE =====================
  v_conv := pg_temp.chega(13, MON + interval '22 hours');
  PERFORM pg_temp.atribui(13, P_ANA, MON + interval '21 hours');
  v_sino := pg_temp.total_sino();
  SELECT pg_temp.varre_ate(MON + interval '22 hours', MON + interval '1 day 9 hours') INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'T12', 'T12a. das 22:00 às 09:00, varrendo a cada 2 min: ZERO transferências', '0|', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'T12', 'T12b. ...dono intacto, sino mudo', 'Ana|0', pg_temp.dono(13) || '|' || (pg_temp.total_sino() - v_sino)::text);
  SELECT pg_temp.varre_ate(MON + interval '1 day 9 hours 2 minutes', MON + interval '1 day 14 hours') INTO v_txt;
  PERFORM pg_temp.afirma(p_phase, 'T12', 'T12c. seguindo até as 14:00: exatamente 3, às 10:00, 11:00 e 12:00', '3|Tue 10:00,Tue 11:00,Tue 12:00', v_txt);
  PERFORM pg_temp.afirma(p_phase, 'T12', 'T12d. ...aviso ao gestor às 13:00 e parou', '3|12:00|sim', pg_temp.estado(13));
  PERFORM pg_temp.afirma(p_phase, 'T12', 'T12e. ...5 avisos ao todo: 3 para quem recebeu + 1 ao gestor + 1 ao gerente', '5', (pg_temp.total_sino() - v_sino)::text);
  PERFORM pg_temp.fecha(13);

  -- ===================== T13. Horário próprio =====================
  PERFORM pg_temp.prefs(true, 60, 3, '{"timezone": "America/Sao_Paulo", "schedule": {"0": null, "1": {"start": "14:00", "end": "20:00"}, "2": {"start": "09:00", "end": "18:00"}, "3": {"start": "09:00", "end": "18:00"}, "4": {"start": "09:00", "end": "18:00"}, "5": {"start": "09:00", "end": "18:00"}, "6": {"start": "08:00", "end": "12:00"}}}'::jsonb);
  v_conv := pg_temp.chega(14, MON + interval '5 days 8 hours 30 minutes');   -- sábado 08:30
  PERFORM pg_temp.atribui(14, P_ANA, MON + interval '5 days 8 hours');
  SELECT pg_temp.varre(MON + interval '5 days 9 hours 29 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T13', 'T13a. sábado aberto 08–12: 09:29 ainda não', '0', n::text);
  SELECT pg_temp.varre(MON + interval '5 days 9 hours 30 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T13', 'T13b. sábado 09:30: transfere', '1', n::text);
  v_conv := pg_temp.chega(15, MON + interval '10 hours');                    -- segunda 10:00, fechada até 14:00
  PERFORM pg_temp.atribui(15, P_ANA, MON + interval '9 hours');
  SELECT pg_temp.varre(MON + interval '13 hours 59 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T13', 'T13c. segunda abre às 14:00: às 13:59 nada', '0', n::text);
  SELECT pg_temp.varre(MON + interval '14 hours 59 minutes') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T13', 'T13d. 14:59 (59 min): nada', '0', n::text);
  SELECT pg_temp.varre(MON + interval '15 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T13', 'T13e. 15:00: transfere', '1', n::text);
  PERFORM pg_temp.fecha(14); PERFORM pg_temp.fecha(15);
  PERFORM pg_temp.prefs(true, 60, 3);

  -- ===================== T14. business_minutes_between =====================
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14a. padrão: sexta 17:00 → segunda 10:00 = 120', '120',
    public.business_minutes_between('{}', MON + interval '4 days 17 hours', MON + interval '7 days 10 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14b. padrão: sábado 10:00 → domingo 10:00 = 0', '0',
    public.business_minutes_between('{}', MON + interval '5 days 10 hours', MON + interval '6 days 10 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14c. padrão: segunda 08:00 → segunda 19:00 = 540 (09–18)', '540',
    public.business_minutes_between('{}', MON + interval '8 hours', MON + interval '19 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14d. de trás para frente = 0', '0',
    public.business_minutes_between('{}', MON + interval '12 hours', MON + interval '10 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14e. schedule com segunda ausente = segunda fechada', '0',
    public.business_minutes_between('{"business_hours": {"schedule": {"2": {"start": "09:00", "end": "18:00"}}}}', MON + interval '9 hours', MON + interval '12 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14f. fuso Manaus (-04): 12:00–13:00 de SP são 11:00–12:00 lá, dentro do horário = 60', '60',
    public.business_minutes_between('{"business_hours": {"timezone": "America/Manaus"}}', MON + interval '12 hours', MON + interval '13 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14g. fuso Manaus: 08:30–09:30 de SP são 07:30–08:30 lá = 0', '0',
    public.business_minutes_between('{"business_hours": {"timezone": "America/Manaus"}}', MON + interval '8 hours 30 minutes', MON + interval '9 hours 30 minutes')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14h. fuso inválido cai em São Paulo', '60',
    public.business_minutes_between('{"business_hours": {"timezone": "Marte/Olympus"}}', MON + interval '10 hours', MON + interval '11 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14i. start/end malformados caem em 09:00/18:00', '60',
    public.business_minutes_between('{"business_hours": {"schedule": {"1": {"start": "nove", "end": "dezoito"}}}}', MON + interval '10 hours', MON + interval '11 hours')::text);
  PERFORM pg_temp.afirma(p_phase, 'T14', 'T14j. end <= start = dia fechado', '0',
    public.business_minutes_between('{"business_hours": {"schedule": {"1": {"start": "18:00", "end": "09:00"}}}}', MON + interval '10 hours', MON + interval '11 hours')::text);

  -- ===================== T15. Fora do alcance da regra =====================
  v_conv := pg_temp.chega(17, MON + interval '10 hours');
  PERFORM pg_temp.atribui(17, P_ANA, MON + interval '9 hours');
  UPDATE public.conversations SET is_archived = true WHERE id = v_conv;
  SELECT pg_temp.varre(MON + interval '13 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T15', 'T15a. arquivada: fora', '0', n::text);
  UPDATE public.conversations SET is_archived = false WHERE id = v_conv;
  v_conv := pg_temp.chega(18, MON + interval '10 hours');       -- sem responsável
  SELECT pg_temp.varre(MON + interval '13 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T15', 'T15b. sem responsável: é do rodízio, não da regra (a 17 transferiu, a 18 não)', '1|<null>', n::text || '|' || pg_temp.dono(18));
  UPDATE public.conversations SET response_rule_escalated_at = MON + interval '12 hours' WHERE contact_id = pg_temp.contato(17);
  SELECT pg_temp.varre(MON + interval '16 hours') INTO n;
  PERFORM pg_temp.afirma(p_phase, 'T15', 'T15c. já escalada: fora até um humano responder', '0', n::text);
  PERFORM pg_temp.fecha(17); PERFORM pg_temp.fecha(18);

  -- ===================== T16. RPC de prévia =====================
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GES);
  SELECT turns::text || '|' || (breached <= turns)::text || '|' || (never_replied <= turns)::text INTO v_txt
    FROM public.loja_response_rule_preview(LOJA, 60, 30);
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma(p_phase, 'T16', 'T16a. gestor recebe contagens coerentes (esperas > 0, violadas ≤ esperas)',
    'true|true|true', ((split_part(v_txt, '|', 1))::int > 0)::text || '|' || split_part(v_txt, '|', 2) || '|' || split_part(v_txt, '|', 3));
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_ANA);
  SELECT count(*) INTO n FROM public.loja_response_rule_preview(LOJA, 60, 30);
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma(p_phase, 'T16', 'T16b. atendente recebe vazio', '0', n::text);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.como(U_GES);
  SELECT breached::text INTO v_txt FROM public.loja_response_rule_preview(LOJA, 100000, 30);
  RESET ROLE; PERFORM pg_temp.ninguem();
  PERFORM pg_temp.afirma(p_phase, 'T16', 'T16c. com 100000 minutos nada viola', '0', v_txt);

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
--    Troca o detector pelo ingênuo: só enxerga espera quando
--    last_message_direction = 'inbound' — exatamente o que a migração diz para
--    NÃO fazer (bot falou por último → cego). Esperado: T3b/T3c vermelhos, mais
--    os efeitos colaterais da segunda rodada. Desfeito pelo ROLLBACK.
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.response_rule_turn_start(p_conversation_id uuid) RETURNS timestamptz
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $sab$
--   SELECT CASE WHEN c.last_message_direction = 'inbound' THEN c.last_message_at END
--     FROM public.conversations c WHERE c.id = p_conversation_id;
-- $sab$;
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
FROM _rr_results GROUP BY phase ORDER BY phase;

ROLLBACK;
