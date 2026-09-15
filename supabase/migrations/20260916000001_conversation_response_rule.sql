-- =============================================================================
-- 20260916000001_conversation_response_rule
--
-- Regra de tempo de resposta (passo 5 de 5 da atribuição de atendimento):
-- quando o responsável por uma conversa não responde dentro de X minutos DE
-- FUNCIONAMENTO da Loja, a conversa é transferida para outro atendente.
--
-- O QUE MUDA
--   1. Quatro preferências por Loja em `tenants.settings`, gravadas pela RPC
--      `set_tenant_settings` como as dos passos 2 e 3 e guardadas por CHECK:
--        - response_rule_enabled        (boolean; padrão false)
--        - response_rule_minutes        (inteiro 5..1440; padrão 60)
--        - response_rule_max_transfers  (inteiro 1..10; padrão 3)
--        - business_hours               ({timezone, schedule{"0".."6": {start,end}|null}})
--      `business_hours` é a MESMA chave e a MESMA forma que o motor do chatbot
--      já lê em `isOutOfHours()` (supabase/functions/_shared/chatbot-engine.ts),
--      com o mesmo padrão quando ausente: seg–sex 09:00–18:00
--      America/Sao_Paulo. Bot e regra nunca discordam sobre quando a Loja abre.
--      Com `response_rule_enabled` ausente ou false NADA muda para ninguém: a
--      varredura filtra por essa chave na própria query e devolve zero linhas.
--
--   2. Três colunas em `conversations`, o estado da regra na ESPERA ATUAL:
--        - auto_transfer_count        (quantas transferências automáticas nesta espera)
--        - auto_transfer_last_at      (quando foi a última)
--        - response_rule_escalated_at (quando o gestor foi avisado; NULL = ainda não)
--      Por que colunas e não uma tabela de eventos: a varredura já lê e trava a
--      linha da conversa (FOR UPDATE); o estado é 1:1 com a espera atual e
--      zera com uma escrita só; e o histórico já fica em `notifications` (uma
--      linha por transferência, com metadata). Uma tabela nova custaria RLS,
--      duas escritas por transferência e um join que ninguém pediu.
--
--   3. O RELÓGIO: conta a partir do INÍCIO DA ESPERA DO CLIENTE — a primeira
--      mensagem dele depois da última resposta humana — NUNCA de
--      last_message_at (cliente mandando "oi?" a cada dez minutos zeraria o
--      relógio para sempre). "Resposta humana" é a definição que
--      trg_record_conversation_participant já usa (20260914000001:187-191):
--      outbound, is_from_bot IS NOT TRUE, source IS NULL. Bot não é resposta.
--      Para quem RECEBEU a conversa no meio da espera (transferência manual ou
--      automática) o relógio dessa pessoa começa em assigned_at: referência =
--      GREATEST(início da espera, assigned_at, fim da última sessão de bot
--      depois do início da espera). É isso que dá ao novo responsável a
--      janela inteira — e é o intervalo mínimo entre duas transferências
--      automáticas (ver 5).
--
--      O detector NÃO usa last_message_direction: medido em 2026-09-14, em 51
--      das 89 conversas de EncaixaRH esperando humano o bot falou por último e
--      a coluna diz 'outbound'. O detector consulta `messages` (108 buffers,
--      1,25 ms medidos).
--
--      Só minutos DENTRO do horário de funcionamento contam
--      (business_minutes_between). Cliente que escreve às 22:00 não gera
--      transferência de madrugada: o relógio retoma quando a Loja abre.
--
--   4. A TRANSFERÊNCIA (response_rule_transfer): função própria — NÃO reutiliza
--      rotation_assign_conversation, que devolve NULL para conversa com dono
--      por regra (cabeçalho do passo 3, regra 6) e continua assim. A pessoa
--      seguinte vem de rotation_pick_excluding(tenant, dono_atual): o MESMO
--      round-robin ponderado suave de rotation_pick, com uma cláusula a mais
--      que tira o dono atual do conjunto participante. rotation_pick(uuid) não
--      é tocado (o trigger de inbound o chama).
--      tg_guard_conversation_transfer deixa passar: auth.uid() é NULL no cron,
--      conversation_transfer_allowed() devolve true por COALESCE — é o mesmo
--      caminho do rodízio, e é o que se quer: a regra é da Loja, não de uma
--      pessoa restrita.
--
--   5. ANTI-LOOP — a parte que mais podia dar incidente. Medido no
--      reconhecimento: sem nada disto, regra de 15 min + varredura de 2 min
--      = ~300 transferências numa noite; com um elegível só, a conversa seria
--      "transferida" para o próprio dono a cada 2 min.
--        - contador por conversa (auto_transfer_count); chegou em
--          response_rule_max_transfers, NÃO transfere: avisa o gestor uma vez
--          (response_rule_escalated_at) e para.
--        - o contador e o aviso zeram quando um humano responde na conversa
--          (trigger AFTER INSERT em messages, SÓ outbound humano).
--        - nunca o dono atual: excluído na escolha; se sobrar ninguém, não
--          transfere, avisa o gestor uma vez e para.
--        - ninguém elegível: idem. Sem laço de tentativas.
--        - intervalo mínimo entre transferências automáticas da mesma conversa
--          = response_rule_minutes DE FUNCIONAMENTO, porque o relógio do novo
--          responsável começa em assigned_at (item 3). Não é uma constante à
--          parte: é a própria regra valendo para quem recebeu. O menor valor
--          aceito é 5 min; varredura de 2 min nunca transfere duas vezes
--          seguidas.
--        - escalado = fora da varredura até um humano responder.
--
--   6. O SINO: transferência automática TOCA para quem recebeu. Diferente da
--      primeira atribuição do rodízio (a conversa simplesmente aparece na
--      lista da pessoa), aqui alguém já falhou e o cliente já espera X
--      minutos — quem recebe precisa saber agora. O número de toques é
--      limitado por response_rule_max_transfers. A escrita é DIRETA em
--      `notifications` pela função de transferência, não pelo trigger
--      tg_notify_conversation_assigned: assigned_by continua NULL (verdade dos
--      dados — ninguém passou a conversa; a policy de visibilidade e a tela
--      leem assigned_by como "passei adiante"). O trigger do passo 3 fica
--      intacto e o rodízio continua mudo.
--
--   7. O BOT: conversa com sessão ativa de chatbot fica fora do relógio
--      (mesmo teste de rotation_bot_pending: chatbot_sessions.status='active'
--      para o contato). O cliente está sendo atendido.
--
--   8. Varredura por cron a cada 2 min (response-rule-sweep), SQL puro, sem
--      pg_net, SECURITY DEFINER, LIMIT 200, cada conversa em BEGIN/EXCEPTION —
--      o padrão de rotation-sweep-after-bot (20 ms médios medidos). Só olha
--      esperas dos últimos 7 dias: ligar a regra não redistribui o acervo
--      antigo de uma vez, e 7 dias cobre um feriado prolongado.
--
--   9. RPC loja_response_rule_preview para a tela: "com X minutos, quantas das
--      esperas dos últimos 30 dias teriam sido transferidas". Só contagens.
--
-- NÃO MUDA — de propósito
--   - Nenhuma policy de `conversations`, `messages` ou `notifications`.
--   - rotation_pick(uuid), rotation_assign_conversation(uuid) e
--     tg_notify_conversation_assigned().
--   - A sinalização de SLA (tenants.settings.sla, sla_muted_at): mede outra
--     coisa (horas desde a última mensagem, no cliente, sem agir).
--   - O caminho de INBOUND em `messages`: o trigger novo é SÓ para outbound
--     humano (cláusula WHEN), e mesmo assim exception-safe.
--
-- IDEMPOTENTE: pode rodar de novo. Nada aqui apaga ou sobrescreve dado de
-- usuário. O bloco DO do fim confere e grava o ledger. ROLLBACK no fim.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Guarda de forma das quatro preferências
--    CASE em vez de AND: o PostgreSQL não garante curto-circuito em AND, e um
--    cast em cima de string estouraria erro em vez de violação de CHECK.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_response_rule_settings_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_response_rule_settings_check CHECK (
        settings IS NULL
        OR (
          (
            (settings -> 'response_rule_enabled') IS NULL
            OR jsonb_typeof(settings -> 'response_rule_enabled') IN ('boolean', 'null')
          )
          AND (
            CASE jsonb_typeof(settings -> 'response_rule_minutes')
              WHEN 'number' THEN
                   (settings ->> 'response_rule_minutes')::numeric BETWEEN 5 AND 1440
               AND (settings ->> 'response_rule_minutes')::numeric = floor((settings ->> 'response_rule_minutes')::numeric)
              WHEN 'null' THEN true
              ELSE (settings -> 'response_rule_minutes') IS NULL
            END
          )
          AND (
            CASE jsonb_typeof(settings -> 'response_rule_max_transfers')
              WHEN 'number' THEN
                   (settings ->> 'response_rule_max_transfers')::numeric BETWEEN 1 AND 10
               AND (settings ->> 'response_rule_max_transfers')::numeric = floor((settings ->> 'response_rule_max_transfers')::numeric)
              WHEN 'null' THEN true
              ELSE (settings -> 'response_rule_max_transfers') IS NULL
            END
          )
          AND (
            (settings -> 'business_hours') IS NULL
            OR jsonb_typeof(settings -> 'business_hours') IN ('object', 'null')
          )
          AND (
            (settings -> 'business_hours' -> 'timezone') IS NULL
            OR jsonb_typeof(settings -> 'business_hours' -> 'timezone') IN ('string', 'null')
          )
          AND (
            (settings -> 'business_hours' -> 'schedule') IS NULL
            OR jsonb_typeof(settings -> 'business_hours' -> 'schedule') IN ('object', 'null')
          )
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Estado da regra na conversa
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS auto_transfer_count        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_transfer_last_at      timestamptz NULL,
  ADD COLUMN IF NOT EXISTS response_rule_escalated_at timestamptz NULL;

COMMENT ON COLUMN public.conversations.auto_transfer_count IS
  'Transferências automáticas pela regra de tempo de resposta NA ESPERA ATUAL do cliente. Zera quando um humano responde (trg_response_rule_reset_on_human_reply). Parou em response_rule_max_transfers = gestor avisado.';
COMMENT ON COLUMN public.conversations.auto_transfer_last_at IS
  'Quando foi a última transferência automática desta conversa. NULL = nenhuma nesta espera.';
COMMENT ON COLUMN public.conversations.response_rule_escalated_at IS
  'Quando a regra de tempo de resposta avisou o gestor em vez de transferir (limite atingido ou ninguém para receber). Preenchido = fora da varredura até um humano responder.';

-- -----------------------------------------------------------------------------
-- 3. Horário de funcionamento — minutos ABERTOS entre dois instantes
--    Mesma chave, mesma forma e mesmos padrões de isOutOfHours() no motor do
--    chatbot: settings.business_hours = {timezone, schedule: {"0": null, "1":
--    {start, end}, ...}}; sem schedule = seg–sex 09:00–18:00; dia ausente no
--    schedule = fechado; start/end ausentes = 09:00/18:00; timezone inválido
--    = America/Sao_Paulo. Intervalo meio-aberto [start, end), como o motor.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_minutes_between(
  p_settings jsonb,
  p_from     timestamptz,
  p_to       timestamptz
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_bh       jsonb;
  v_tz       text;
  v_schedule jsonb;
  v_default  jsonb := '{"0":null,"1":{"start":"09:00","end":"18:00"},"2":{"start":"09:00","end":"18:00"},"3":{"start":"09:00","end":"18:00"},"4":{"start":"09:00","end":"18:00"},"5":{"start":"09:00","end":"18:00"},"6":null}'::jsonb;
  v_day      date;
  v_last     date;
  v_entry    jsonb;
  v_start    time;
  v_end      time;
  v_ws       timestamptz;
  v_we       timestamptz;
  v_total    numeric := 0;
  v_guard    int := 0;
  v_probe    timestamp;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RETURN 0;
  END IF;

  v_bh := CASE WHEN jsonb_typeof(p_settings -> 'business_hours') = 'object'
               THEN p_settings -> 'business_hours' ELSE '{}'::jsonb END;
  v_tz := COALESCE(NULLIF(v_bh ->> 'timezone', ''), 'America/Sao_Paulo');
  BEGIN
    v_probe := p_from AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'America/Sao_Paulo';
  END;
  v_schedule := CASE WHEN jsonb_typeof(v_bh -> 'schedule') = 'object'
                     THEN v_bh -> 'schedule' ELSE v_default END;

  v_day  := (p_from AT TIME ZONE v_tz)::date;
  v_last := (p_to   AT TIME ZONE v_tz)::date;

  WHILE v_day <= v_last AND v_guard < 400 LOOP
    v_guard := v_guard + 1;
    v_entry := v_schedule -> EXTRACT(dow FROM v_day)::int::text;
    IF v_entry IS NOT NULL AND jsonb_typeof(v_entry) = 'object' THEN
      BEGIN
        v_start := COALESCE(NULLIF(v_entry ->> 'start', ''), '09:00')::time;
      EXCEPTION WHEN OTHERS THEN v_start := '09:00'::time;
      END;
      BEGIN
        v_end := COALESCE(NULLIF(v_entry ->> 'end', ''), '18:00')::time;
      EXCEPTION WHEN OTHERS THEN v_end := '18:00'::time;
      END;
      IF v_end > v_start THEN
        v_ws := (v_day + v_start) AT TIME ZONE v_tz;
        v_we := (v_day + v_end)   AT TIME ZONE v_tz;
        IF LEAST(v_we, p_to) > GREATEST(v_ws, p_from) THEN
          v_total := v_total + EXTRACT(epoch FROM (LEAST(v_we, p_to) - GREATEST(v_ws, p_from))) / 60.0;
        END IF;
      END IF;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  RETURN floor(v_total)::int;
END;
$function$;

COMMENT ON FUNCTION public.business_minutes_between(jsonb, timestamptz, timestamptz) IS
  'Minutos DENTRO do horário de funcionamento (tenants.settings.business_hours, mesma forma e padrões de isOutOfHours no motor do chatbot) entre dois instantes. 0 quando p_to <= p_from.';

-- -----------------------------------------------------------------------------
-- 4. Helpers de leitura
-- -----------------------------------------------------------------------------

-- As preferências da regra, com os padrões, e o settings inteiro (para o
-- horário). Tenant inexistente = zero linhas.
CREATE OR REPLACE FUNCTION public.response_rule_settings(
  p_tenant_id uuid,
  OUT enabled boolean,
  OUT minutes integer,
  OUT max_transfers integer,
  OUT settings jsonb
)
RETURNS SETOF record
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE((t.settings ->> 'response_rule_enabled')::boolean, false),
         COALESCE((t.settings ->> 'response_rule_minutes')::numeric::int, 60),
         COALESCE((t.settings ->> 'response_rule_max_transfers')::numeric::int, 3),
         COALESCE(t.settings, '{}'::jsonb)
    FROM public.tenants t
   WHERE t.id = p_tenant_id;
$function$;

-- Início da espera atual do cliente: a primeira mensagem dele depois da última
-- resposta HUMANA (definição de trg_record_conversation_participant). NULL =
-- ninguém está esperando resposta humana.
CREATE OR REPLACE FUNCTION public.response_rule_turn_start(p_conversation_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT min(i.created_at)
    FROM public.messages i
   WHERE i.conversation_id = p_conversation_id
     AND i.direction IN ('inbound', 'incoming')
     AND i.created_at > COALESCE(
           (SELECT max(h.created_at)
              FROM public.messages h
             WHERE h.conversation_id = p_conversation_id
               AND h.direction = 'outbound'
               AND h.is_from_bot IS NOT TRUE
               AND h.source IS NULL),
           '-infinity'::timestamptz);
$function$;

COMMENT ON FUNCTION public.response_rule_turn_start(uuid) IS
  'Início da espera atual do cliente: primeira inbound depois da última outbound humana (is_from_bot IS NOT TRUE, source IS NULL). NULL quando não há espera pendente. Bot não conta como resposta.';

-- Quem administra a Loja para o aviso: gestor e gerente ativos da própria
-- Loja e gerente ativo da Conta acima (uma Loja sem gestor — caso real —
-- ainda tem quem avisar).
CREATE OR REPLACE FUNCTION public.response_rule_admin_user_ids(p_tenant_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT DISTINCT p.user_id
    FROM public.profiles p
   WHERE p.status = 'active'
     AND p.user_id IS NOT NULL
     AND (
          (p.tenant_id = p_tenant_id
           AND p.role IN ('gestor'::public.user_role, 'gerente'::public.user_role))
       OR (p.role = 'gerente'::public.user_role
           AND p.tenant_id = (SELECT t.parent_tenant_id FROM public.tenants t WHERE t.id = p_tenant_id))
     );
$function$;

-- -----------------------------------------------------------------------------
-- 5. O escolhedor SEM o dono atual
--    Corpo de rotation_pick(uuid) com UMA cláusula a mais (r.profile_id <>
--    p_exclude). Duplicado de propósito: rotation_pick é chamada pelo trigger
--    do caminho de inbound e não é tocada por este arquivo. Mesmo lock por
--    Loja: escolha do rodízio e da regra nunca se cruzam.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotation_pick_excluding(p_tenant_id uuid, p_exclude uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_includes_gestor boolean;
  v_ids    uuid[];
  v_total  int;
  v_winner uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT s.includes_gestor INTO v_includes_gestor FROM public.rotation_settings(p_tenant_id) s;

  PERFORM pg_advisory_xact_lock(hashtextextended('rotation:' || p_tenant_id::text, 0));

  SELECT COALESCE(array_agg(r.profile_id), '{}'::uuid[]), COALESCE(sum(r.percent), 0)
    INTO v_ids, v_total
    FROM public.conversation_rotation r
    JOIN public.profiles p ON p.id = r.profile_id
   WHERE r.tenant_id = p_tenant_id
     AND r.percent > 0
     AND (p_exclude IS NULL OR r.profile_id <> p_exclude)
     AND p.status = 'active'
     AND p.tenant_id = p_tenant_id
     AND (p.role = 'atendente'::public.user_role
          OR (p.role = 'gestor'::public.user_role AND COALESCE(v_includes_gestor, false)));

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.conversation_rotation
     SET credit = credit + percent
   WHERE tenant_id = p_tenant_id AND profile_id = ANY (v_ids);

  SELECT profile_id INTO v_winner
    FROM public.conversation_rotation
   WHERE tenant_id = p_tenant_id AND profile_id = ANY (v_ids)
   ORDER BY credit DESC, created_at, profile_id
   LIMIT 1;

  UPDATE public.conversation_rotation
     SET credit = credit - v_total
   WHERE tenant_id = p_tenant_id AND profile_id = v_winner;

  RETURN v_winner;
END;
$function$;

COMMENT ON FUNCTION public.rotation_pick_excluding(uuid, uuid) IS
  'rotation_pick sem uma pessoa (o dono atual): round-robin ponderado suave entre os demais elegíveis com percent > 0. NULL quando não sobra ninguém. Mesmo advisory lock por Loja.';

-- -----------------------------------------------------------------------------
-- 6. A transferência de uma conversa COM dono
--    Devolve: 'transferred' | 'max_reached' | 'no_target' | 'skipped'.
--    p_now é injetável para a suíte simular uma noite; em produção é now().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.response_rule_transfer(
  p_conversation_id uuid,
  p_now             timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '3s'
AS $function$
DECLARE
  c        record;
  s        record;
  v_target uuid;
  v_user   uuid;
  v_admin  uuid;
  v_contato text;
  v_owner_name text;
  v_n_admins int := 0;
BEGIN
  SELECT x.id, x.tenant_id, x.contact_id, x.assigned_profile_id, x.auto_transfer_count,
         x.response_rule_escalated_at
    INTO c
    FROM public.conversations x
   WHERE x.id = p_conversation_id
   FOR UPDATE;
  IF NOT FOUND OR c.assigned_profile_id IS NULL OR c.response_rule_escalated_at IS NOT NULL THEN
    RETURN 'skipped';
  END IF;

  SELECT * INTO s FROM public.response_rule_settings(c.tenant_id);
  IF NOT FOUND OR NOT COALESCE(s.enabled, false) THEN
    RETURN 'skipped';
  END IF;

  SELECT COALESCE(NULLIF(ct.name, ''), ct.phone) INTO v_contato
    FROM public.contacts ct WHERE ct.id = c.contact_id;
  SELECT COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'o responsável atual')
    INTO v_owner_name
    FROM public.profiles p WHERE p.id = c.assigned_profile_id;

  -- Limite atingido: avisa quem administra, uma vez, e para.
  IF c.auto_transfer_count >= s.max_transfers THEN
    FOR v_admin IN SELECT * FROM public.response_rule_admin_user_ids(c.tenant_id) LOOP
      INSERT INTO public.notifications
        (tenant_id, user_id, title, message, type, action_url, action_label, metadata)
      VALUES (
        c.tenant_id, v_admin,
        'Conversa sem resposta precisa de você',
        'A conversa com ' || COALESCE(v_contato, 'contato sem nome') || ' já foi transferida '
          || c.auto_transfer_count || ' vez(es) por falta de resposta e continua sem resposta. Ela fica com '
          || v_owner_name || ' até você agir.',
        'warning',
        '/dashboard/conversations?contact=' || c.contact_id::text,
        'Ver conversa',
        jsonb_build_object(
          'reason', 'response_rule_max',
          'conversation_id', c.id,
          'contact_id', c.contact_id,
          'owner_profile_id', c.assigned_profile_id,
          'transfers', c.auto_transfer_count
        )
      );
      v_n_admins := v_n_admins + 1;
    END LOOP;
    UPDATE public.conversations
       SET response_rule_escalated_at = p_now
     WHERE id = c.id;
    RETURN 'max_reached';
  END IF;

  -- Nunca o dono atual: excluído na escolha.
  v_target := public.rotation_pick_excluding(c.tenant_id, c.assigned_profile_id);

  IF v_target IS NULL OR v_target = c.assigned_profile_id THEN
    FOR v_admin IN SELECT * FROM public.response_rule_admin_user_ids(c.tenant_id) LOOP
      INSERT INTO public.notifications
        (tenant_id, user_id, title, message, type, action_url, action_label, metadata)
      VALUES (
        c.tenant_id, v_admin,
        'Conversa sem resposta precisa de você',
        'A conversa com ' || COALESCE(v_contato, 'contato sem nome') || ' está há mais de '
          || s.minutes || ' min de funcionamento sem resposta e não há outro atendente disponível para recebê-la. Ela fica com '
          || v_owner_name || ' até você agir.',
        'warning',
        '/dashboard/conversations?contact=' || c.contact_id::text,
        'Ver conversa',
        jsonb_build_object(
          'reason', 'response_rule_no_target',
          'conversation_id', c.id,
          'contact_id', c.contact_id,
          'owner_profile_id', c.assigned_profile_id,
          'transfers', c.auto_transfer_count
        )
      );
      v_n_admins := v_n_admins + 1;
    END LOOP;
    UPDATE public.conversations
       SET response_rule_escalated_at = p_now
     WHERE id = c.id;
    RETURN 'no_target';
  END IF;

  -- A transferência. assigned_by fica NULL (ninguém passou a conversa): o sino
  -- do passo 3 fica mudo e a policy de visibilidade não é enganada. O aviso a
  -- quem recebeu é gravado aqui embaixo, direto.
  UPDATE public.conversations
     SET assigned_profile_id   = v_target,
         assigned_at           = p_now,
         assigned_by           = NULL,
         auto_transfer_count   = c.auto_transfer_count + 1,
         auto_transfer_last_at = p_now
   WHERE id = c.id;

  SELECT p.user_id INTO v_user FROM public.profiles p WHERE p.id = v_target;
  IF v_user IS NOT NULL THEN
    INSERT INTO public.notifications
      (tenant_id, user_id, title, message, type, action_url, action_label, metadata)
    VALUES (
      c.tenant_id, v_user,
      'Conversa transferida para você',
      'A conversa com ' || COALESCE(v_contato, 'contato sem nome') || ' passou para você: '
        || v_owner_name || ' não respondeu em ' || s.minutes || ' min de funcionamento. O cliente já está esperando.',
      'warning',
      '/dashboard/conversations?contact=' || c.contact_id::text,
      'Ver conversa',
      jsonb_build_object(
        'reason', 'response_rule',
        'conversation_id', c.id,
        'contact_id', c.contact_id,
        'previous_profile_id', c.assigned_profile_id,
        'transfer_number', c.auto_transfer_count + 1
      )
    );
  END IF;

  RETURN 'transferred';
END;
$function$;

COMMENT ON FUNCTION public.response_rule_transfer(uuid, timestamptz) IS
  'Transfere uma conversa COM dono para o próximo do rodízio (nunca o dono atual). Para em response_rule_max_transfers ou sem alvo: avisa gestor/gerente uma vez e marca response_rule_escalated_at. Toca o sino de quem recebeu (escrita direta; assigned_by fica NULL). Devolve transferred | max_reached | no_target | skipped.';

-- -----------------------------------------------------------------------------
-- 7. A varredura (cron */2)
--    Pré-filtro barato em SQL com minutos de RELÓGIO (minutos abertos ≤
--    minutos de relógio, então quem não passou no relógio não passou no
--    horário); conferência exata com business_minutes_between no laço.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.response_rule_sweep(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r        record;
  v_n      int := 0;
  v_turn   timestamptz;
  v_ref    timestamptz;
  v_bot_end timestamptz;
  v_open   int;
BEGIN
  FOR r IN
    SELECT c.id, c.contact_id, c.assigned_at, t.settings,
           COALESCE((t.settings ->> 'response_rule_minutes')::numeric::int, 60) AS minutes
      FROM public.conversations c
      JOIN public.tenants t ON t.id = c.tenant_id
     WHERE COALESCE((t.settings ->> 'response_rule_enabled')::boolean, false)
       AND c.assigned_profile_id IS NOT NULL
       AND COALESCE(c.is_archived, false) = false
       AND c.response_rule_escalated_at IS NULL
       AND c.last_message_at > p_now - interval '7 days'
       AND c.last_message_at <= p_now
       AND COALESCE(c.assigned_at, '-infinity'::timestamptz)
             <= p_now - make_interval(mins => COALESCE((t.settings ->> 'response_rule_minutes')::numeric::int, 60))
       AND EXISTS (
             SELECT 1 FROM public.messages i
              WHERE i.conversation_id = c.id
                AND i.direction IN ('inbound', 'incoming')
                AND i.created_at <= p_now - make_interval(mins => COALESCE((t.settings ->> 'response_rule_minutes')::numeric::int, 60))
                AND NOT EXISTS (
                      SELECT 1 FROM public.messages h
                       WHERE h.conversation_id = c.id
                         AND h.direction = 'outbound'
                         AND h.is_from_bot IS NOT TRUE
                         AND h.source IS NULL
                         AND h.created_at > i.created_at)
           )
       AND NOT EXISTS (
             SELECT 1 FROM public.chatbot_sessions s
              WHERE s.contact_id = c.contact_id
                AND s.status = 'active'::public.chatbot_session_status)
     ORDER BY c.last_message_at
     LIMIT 200
  LOOP
    BEGIN
      v_turn := public.response_rule_turn_start(r.id);
      IF v_turn IS NULL THEN
        CONTINUE;
      END IF;
      -- Referência do relógio: o mais tarde entre o início da espera, quando o
      -- responsável atual recebeu a conversa e quando o bot soltou o cliente
      -- (sessão encerrada depois do início da espera). O humano ganha a janela
      -- inteira a partir do momento em que a conversa passou a ser dele.
      SELECT max(COALESCE(s.ended_at, s.updated_at)) INTO v_bot_end
        FROM public.chatbot_sessions s
       WHERE s.contact_id = r.contact_id
         AND s.status <> 'active'::public.chatbot_session_status
         AND COALESCE(s.ended_at, s.updated_at) > v_turn;
      v_ref  := GREATEST(v_turn, COALESCE(r.assigned_at, v_turn), COALESCE(v_bot_end, v_turn));
      v_open := public.business_minutes_between(r.settings, v_ref, p_now);
      IF v_open >= r.minutes THEN
        IF public.response_rule_transfer(r.id, p_now) = 'transferred' THEN
          v_n := v_n + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'response_rule_sweep(%) falhou: % [%]', r.id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.response_rule_sweep(timestamptz) IS
  'Cron (*/2 min): em Lojas com response_rule_enabled, transfere as conversas COM dono em que o cliente espera resposta humana há mais de response_rule_minutes DE FUNCIONAMENTO (desde o início da espera ou desde assigned_at, o que for mais tarde), sem sessão ativa de bot, esperas dos últimos 7 dias. Devolve quantas transferiu.';

-- -----------------------------------------------------------------------------
-- 8. Humano respondeu: zera contador e aviso
--    SÓ outbound humano (cláusula WHEN — mesma de trg_record_conversation_
--    participant). O caminho de inbound não passa por aqui. Exception-safe.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_response_rule_reset_on_human_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.conversations
     SET auto_transfer_count        = 0,
         auto_transfer_last_at      = NULL,
         response_rule_escalated_at = NULL
   WHERE id = NEW.conversation_id
     AND (auto_transfer_count <> 0
          OR auto_transfer_last_at IS NOT NULL
          OR response_rule_escalated_at IS NOT NULL);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_response_rule_reset_on_human_reply(%) falhou: % [%]', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_response_rule_reset_on_human_reply ON public.messages;
CREATE TRIGGER trg_response_rule_reset_on_human_reply
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.direction = 'outbound' AND NEW.is_from_bot IS NOT TRUE AND NEW.source IS NULL AND NEW.conversation_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_response_rule_reset_on_human_reply();

-- -----------------------------------------------------------------------------
-- 9. Cron
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'response-rule-sweep') THEN
    PERFORM cron.schedule('response-rule-sweep', '*/2 * * * *', $cron$SELECT public.response_rule_sweep()$cron$);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 10. RPC para a tela: efeito esperado com X minutos, nos últimos p_days dias
--     Só contagens. p_business_hours permite simular horas ainda não salvas.
--     Uma espera = primeira inbound depois da última resposta humana; medida
--     até a resposta humana seguinte ou até agora.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loja_response_rule_preview(
  p_tenant_id      uuid,
  p_minutes        integer,
  p_days           integer DEFAULT 30,
  p_business_hours jsonb   DEFAULT NULL
)
RETURNS TABLE (
  turns         bigint,
  breached      bigint,
  never_replied bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_settings jsonb;
BEGIN
  -- Alcance da aba Escala/Transferência (gestor da Loja, gerente da Conta
  -- acima, superadmin) — não o de loja_stats_scope_ok, que deixa qualquer
  -- membro da Loja ler agregados. Esta prévia só faz sentido para quem
  -- configura a regra. Medido na suíte (T16b) antes de trocar.
  IF NOT public.rotation_admin_scope_ok(p_tenant_id) THEN
    RETURN;
  END IF;
  IF p_minutes IS NULL OR p_minutes < 1 THEN
    RAISE EXCEPTION 'p_minutes deve ser >= 1' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(t.settings, '{}'::jsonb) INTO v_settings FROM public.tenants t WHERE t.id = p_tenant_id;
  IF p_business_hours IS NOT NULL AND jsonb_typeof(p_business_hours) = 'object' THEN
    v_settings := v_settings || jsonb_build_object('business_hours', p_business_hours);
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT x.id, x.conversation_id, x.created_at,
           CASE WHEN x.direction IN ('inbound', 'incoming') THEN 'in'
                WHEN x.direction = 'outbound' AND x.is_from_bot IS NOT TRUE AND x.source IS NULL THEN 'human'
                ELSE 'bot' END AS kind
      FROM public.messages x
     WHERE x.tenant_id = p_tenant_id
       AND x.conversation_id IS NOT NULL
       AND x.created_at > now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1))
  ),
  seq AS (
    SELECT m.*, lag(m.kind) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at, m.id) AS prev_kind
      FROM m WHERE m.kind <> 'bot'
  ),
  turns AS (
    SELECT s.created_at AS t_in,
           (SELECT min(h.created_at) FROM m h
             WHERE h.conversation_id = s.conversation_id AND h.kind = 'human' AND h.created_at > s.created_at) AS t_human
      FROM seq s
     WHERE s.kind = 'in' AND (s.prev_kind IS NULL OR s.prev_kind <> 'in')
  )
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE public.business_minutes_between(v_settings, t.t_in, COALESCE(t.t_human, now())) >= p_minutes)::bigint,
         count(*) FILTER (WHERE t.t_human IS NULL)::bigint
    FROM turns t;
END;
$function$;

COMMENT ON FUNCTION public.loja_response_rule_preview(uuid, integer, integer, jsonb) IS
  'Para a tela de configuração: quantas esperas do cliente nos últimos p_days dias teriam passado de p_minutes minutos de funcionamento (com o horário salvo ou com p_business_hours). Só contagens. Gestor/gerente/superadmin no alcance; fora dele, vazio.';

-- -----------------------------------------------------------------------------
-- 11. Grants
-- -----------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.business_minutes_between(jsonb, timestamptz, timestamptz)',
    'public.response_rule_settings(uuid)',
    'public.response_rule_turn_start(uuid)',
    'public.response_rule_admin_user_ids(uuid)',
    'public.rotation_pick_excluding(uuid, uuid)',
    'public.response_rule_transfer(uuid, timestamptz)',
    'public.response_rule_sweep(timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  REVOKE ALL ON FUNCTION public.loja_response_rule_preview(uuid, integer, integer, jsonb) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.loja_response_rule_preview(uuid, integer, integer, jsonb) TO authenticated, service_role;
END $$;

-- -----------------------------------------------------------------------------
-- 12. Conferência + ledger
-- -----------------------------------------------------------------------------
DO $chk$
DECLARE
  n_pol_conv int;
  n_pol_msg  int;
  n_pol_not  int;
  v_last     text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_response_rule_settings_check') THEN
    RAISE EXCEPTION 'ABORTADO: CHECK tenants_response_rule_settings_check não existe.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'conversations'
         AND column_name IN ('auto_transfer_count', 'auto_transfer_last_at', 'response_rule_escalated_at')) <> 3 THEN
    RAISE EXCEPTION 'ABORTADO: as três colunas de estado não existem em conversations.';
  END IF;
  IF to_regprocedure('public.business_minutes_between(jsonb, timestamptz, timestamptz)') IS NULL
     OR to_regprocedure('public.response_rule_turn_start(uuid)') IS NULL
     OR to_regprocedure('public.rotation_pick_excluding(uuid, uuid)') IS NULL
     OR to_regprocedure('public.response_rule_transfer(uuid, timestamptz)') IS NULL
     OR to_regprocedure('public.response_rule_sweep(timestamptz)') IS NULL
     OR to_regprocedure('public.loja_response_rule_preview(uuid, integer, integer, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: alguma função da regra não existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_response_rule_reset_on_human_reply'
                   AND tgrelid = 'public.messages'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: trigger trg_response_rule_reset_on_human_reply não existe.';
  END IF;
  -- O escolhedor do rodízio continua sendo o ÚLTIMO trigger AFTER INSERT de messages.
  SELECT tgname INTO v_last FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal
     AND (tgtype & 2) = 0 AND (tgtype & 4) <> 0
   ORDER BY tgname DESC LIMIT 1;
  IF v_last <> 'zz_rotation_assign_on_inbound' THEN
    RAISE EXCEPTION 'ABORTADO: o escolhedor do rodízio deixou de ser o último trigger AFTER INSERT de messages (é %).', v_last;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'response-rule-sweep') THEN
    RAISE EXCEPTION 'ABORTADO: cron response-rule-sweep não existe.';
  END IF;
  -- As funções do passo 3 que este arquivo NÃO toca continuam com o texto de lá.
  IF pg_get_functiondef('public.rotation_assign_conversation(uuid)'::regprocedure) NOT LIKE '%v_owner IS NOT NULL THEN%' THEN
    RAISE EXCEPTION 'ABORTADO: rotation_assign_conversation perdeu a checagem de dono.';
  END IF;
  IF pg_get_functiondef('public.tg_notify_conversation_assigned()'::regprocedure) NOT LIKE '%NEW.assigned_by IS NULL%' THEN
    RAISE EXCEPTION 'ABORTADO: o sino do passo 3 foi alterado.';
  END IF;

  -- Prova de que este arquivo não mexeu em policy.
  SELECT count(*) INTO n_pol_conv FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations';
  SELECT count(*) INTO n_pol_msg  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages';
  IF n_pol_conv <> 7 OR n_pol_msg <> 8 THEN
    RAISE EXCEPTION 'ABORTADO: conversations/messages deveriam ter 7/8 policies, têm %/%. Este arquivo não cria nem apaga policy — investigue.', n_pol_conv, n_pol_msg;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260916000001', 'conversation_response_rule')
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'conversation_response_rule aplicada: CHECK, 3 colunas, 7 funções internas, 1 RPC, 1 trigger (outbound humano), 1 cron. % Lojas com a regra ligada (esperado 0).',
    (SELECT count(*) FROM public.tenants WHERE COALESCE((settings ->> 'response_rule_enabled')::boolean, false));
END
$chk$;

-- =============================================================================
-- ROLLBACK (na ordem; cada passo é independente)
--
-- -- 0. Para PARAR o comportamento sem mexer em código (3 da manhã):
-- UPDATE public.tenants SET settings = settings || '{"response_rule_enabled": false}'::jsonb
--  WHERE COALESCE((settings ->> 'response_rule_enabled')::boolean, false);
-- --    (o cron continua rodando e devolvendo 0; nada mais acontece.)
--
-- -- 1. Cron e trigger
-- SELECT cron.unschedule('response-rule-sweep');
-- DROP TRIGGER IF EXISTS trg_response_rule_reset_on_human_reply ON public.messages;
--
-- -- 2. Funções, colunas, CHECK, ledger
-- DROP FUNCTION IF EXISTS public.tg_response_rule_reset_on_human_reply();
-- DROP FUNCTION IF EXISTS public.loja_response_rule_preview(uuid, integer, integer, jsonb);
-- DROP FUNCTION IF EXISTS public.response_rule_sweep(timestamptz);
-- DROP FUNCTION IF EXISTS public.response_rule_transfer(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public.rotation_pick_excluding(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.response_rule_admin_user_ids(uuid);
-- DROP FUNCTION IF EXISTS public.response_rule_turn_start(uuid);
-- DROP FUNCTION IF EXISTS public.response_rule_settings(uuid);
-- DROP FUNCTION IF EXISTS public.business_minutes_between(jsonb, timestamptz, timestamptz);
-- ALTER TABLE public.conversations
--   DROP COLUMN IF EXISTS response_rule_escalated_at,
--   DROP COLUMN IF EXISTS auto_transfer_last_at,
--   DROP COLUMN IF EXISTS auto_transfer_count;
-- ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_response_rule_settings_check;
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260916000001';
-- =============================================================================
