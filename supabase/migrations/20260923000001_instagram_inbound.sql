-- Fatia 2/5 do Instagram: RECEBER de verdade.
--
-- ============================================================================
-- O QUE ESTA MIGRAÇÃO FAZ
-- ============================================================================
--
--   1. messages ganha `channel`, derivado do contato (mesmo padrão de
--      conversations.channel da fatia 1).
--   2. As triggers que disparam bot/automação/rodízio/regra de tempo de
--      resposta/webhooks de saída ganham `WHEN (NEW.channel = 'whatsapp')`.
--      As FUNÇÕES delas não mudam uma vírgula; só a definição da trigger.
--   3. response_rule_sweep ganha UM predicado (`c.channel = 'whatsapp'`),
--      aplicado por substituição de texto sobre a definição viva, com prova de
--      que o resto ficou byte a byte igual.
--   4. Uma instância de Instagram passa a existir: linha de whatsapp_instances
--      com provider='instagram', o id da conta em
--      connection_config->>'igAccountId', ÚNICO e indexado.
--   5. process_instagram_message(): o caminho de entrada inteiro numa chamada.
--   6. create_instagram_instance(): o procedimento manual da fatia (sem tela).
--   7. Fecha um buraco da fatia 1: resolve_contact_by_channel estava executável
--      por `authenticated`.
--
-- NÃO FAZ: tela, envio, renovação de token, anexos, reações, leitura.
--
-- ============================================================================
-- POR QUE `WHEN` NA TRIGGER E NÃO `IF` NA FUNÇÃO
-- ============================================================================
--
-- O dono decidiu: nesta fatia uma mensagem de Instagram NÃO aciona bot,
-- automações, rodízio, regra de tempo de resposta nem webhooks de saída. E
-- também: não mexer no bot, nas automações, no rodízio, na regra.
--
-- A cláusula WHEN na definição da trigger cumpre as duas coisas: o corpo das
-- funções fica idêntico (md5 conferido antes e depois), e o Postgres nem chama
-- a função quando a linha não é de WhatsApp. Para WhatsApp o WHEN é sempre
-- verdadeiro — `channel` nasce 'whatsapp' pelo DEFAULT e pela derivação.
--
-- Allowlist, não denylist: `= 'whatsapp'`, e não `<> 'instagram'`. Um canal
-- futuro nasce DESLIGADO de tudo até alguém decidir o contrário.
--
-- Triggers com WHEN novo:
--   messages : trg_automation_message_received, trg_webhook_messages,
--              trg_response_rule_reset_on_human_reply, zz_rotation_assign_on_inbound
--   contacts : trg_automation_contact_created, trg_webhook_contact_created,
--              trg_webhook_contact_updated, trg_automation_funnel_stage_changed
--
-- Triggers que FICAM como estão, porque já não fazem nada numa linha de
-- Instagram vinda do webhook (a suíte prova cada uma):
--   trg_apply_ad_referral_attribution  WHEN ad_referral IS NOT NULL — nunca gravamos
--   trg_sync_campaign_exec_status      só age com source='campaign' / campaign_id
--   trg_set_message_sender             auth.uid() é NULL no webhook → grava NULL
--   trg_record_conversation_participant sai cedo com sender_profile_id NULL
--   trigger_handle_message_conversation / trigger_update_conversation_on_message
--                                      são a caixa de entrada: TÊM que rodar
--
-- O nome zz_rotation_assign_on_inbound é mantido: ele continua o ÚLTIMO AFTER
-- INSERT (ver 20260915000001). A conferência no fim do bloco aborta se não for.
--
-- ============================================================================
-- O BOT
-- ============================================================================
--
-- Nenhuma trigger chama o bot. No WhatsApp, quem chama é o CÓDIGO do webhook
-- (process_incoming_message enfileira o v1; meta-webhook invoca
-- process-chatbot-message). process_instagram_message não faz nenhuma das duas
-- coisas — e o gate das automações fecha o outro caminho (ação "iniciar fluxo").
--
-- ============================================================================
-- A INSTÂNCIA
-- ============================================================================
--
-- Uma instância de Instagram é uma linha de whatsapp_instances (a tabela tem
-- nome histórico; a fatia 1 abriu provider='instagram'). Reaproveitar a tabela
-- é o que faz messages.whatsapp_instance_id (NOT NULL), a exclusão de
-- instância e o Vault funcionarem sem nada novo.
--
--   provider           'instagram'
--   instance_key       'instagram_' || igAccountId   (único, como toda instância)
--   connection_config  { igAccountId, igUsername, tokenIssuedAt, tokenExpiresAt }
--   status             'connected' (nunca 'open' — ver create_instagram_instance)
--   token              Vault, via set_instance_meta_token — o MESMO lugar e a
--                      MESMA função do token da Meta hoje (instance_secrets).
--
-- igAccountId é o `entry[].id` da entrega. A busca é por ele, então ele tem
-- índice ÚNICO parcial (provider='instagram'): busca por índice, e a mesma
-- conta do Instagram não pode estar em duas Contas — senão uma mensagem de
-- cliente teria dois donos possíveis.
--
-- ============================================================================
-- ATOMICIDADE
-- ============================================================================
--
-- Funções primeiro (CREATE OR REPLACE sozinho não muda comportamento de
-- ninguém: ninguém as chama ainda). Todo o DDL de tabela e trigger, mais a
-- conferência, num único bloco DO — um comando só. lock_timeout de 5 s dentro
-- do bloco: se o lock de messages não sair, aborta em vez de enfileirar o
-- webhook do WhatsApp atrás da migração.
--
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1. Derivação do canal da mensagem
-- ---------------------------------------------------------------------------
--
-- Mesmo desenho de tg_conversations_set_channel: está no caminho de entrada
-- do WhatsApp, então NUNCA levanta. No pior caso fica o valor que já viria
-- (DEFAULT 'whatsapp', ou o que o chamador passou).
CREATE OR REPLACE FUNCTION public.tg_messages_set_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.channel := COALESCE(
    (SELECT ct.channel FROM public.contacts ct WHERE ct.id = NEW.contact_id),
    NEW.channel,
    'whatsapp'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.channel := COALESCE(NEW.channel, 'whatsapp');
  RAISE WARNING 'tg_messages_set_channel(contato %) falhou: % [%]',
    NEW.contact_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_messages_set_channel() IS
  'BEFORE INSERT em messages: o canal da mensagem é o canal do contato. Exception-safe. É o que alimenta o WHEN (channel = ''whatsapp'') das triggers de bot/automação/rodízio/regra/webhook.';

REVOKE ALL ON FUNCTION public.tg_messages_set_channel() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. O caminho de entrada do Instagram
-- ---------------------------------------------------------------------------
--
-- Uma chamada por mensagem de texto. Devolve SEMPRE um jsonb com `outcome`;
-- só levanta em erro de banco de verdade (e aí o webhook devolve 500 e a Meta
-- reentrega — seguro, porque é idempotente pelo mid).
--
-- outcome:
--   stored                    gravou (direction inbound ou outbound)
--   duplicate                 esse mid já existe — nada foi escrito
--   unknown_account           entry.id não é de nenhuma instância — nada escrito
--   inactive_instance         instância com is_active=false — nada escrito
--   own_account               o "cliente" seria a própria conta — nada escrito
--   echo_without_contact      eco para alguém que nunca escreveu — nada escrito
--   invalid                   faltou campo obrigatório — nada escrito
--
-- IDEMPOTÊNCIA — o mesmo desenho do WhatsApp, em uma transação:
--   1. SELECT pelo mid antes de tudo (é o que o meta-webhook faz) → duplicate,
--      sem tocar em contato nem conversa;
--   2. INSERT ... ON CONFLICT DO NOTHING no MESMO índice único
--      (idx_messages_evolution_message_id_unique) — duas entregas simultâneas
--      passam do passo 1 juntas e uma perde aqui, sem erro e sem linha.
--   O mid vai em evolution_message_id, onde o wamid vai hoje. O índice é
--   global; um mid do Instagram (base64 'aWdf…', ~164 caracteres) não colide
--   com wamid ('wamid.…') nem com id da Evolution.
--
-- ECO (is_echo = true: o negócio respondeu pelo app do Instagram):
--   * o cliente é o RECIPIENT, não o sender;
--   * NUNCA cria contato: se o destinatário nunca escreveu, descarta
--     (echo_without_contact). É isso que torna impossível criar um contato
--     para a nossa própria conta;
--   * grava como outbound / status 'sent' / is_from_bot false / source NULL /
--     sender_profile_id NULL. Com isso update_conversation_on_message trata
--     como resposta do atendente: unread_count NÃO sobe, last_message_direction
--     vira 'outbound', o silenciamento de SLA NÃO é desfeito;
--   * não atualiza contacts.last_interaction_at (não foi o cliente que falou).
CREATE OR REPLACE FUNCTION public.process_instagram_message(
  p_ig_account_id text,
  p_sender_id     text,
  p_recipient_id  text,
  p_mid           text,
  p_text          text,
  p_is_echo       boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inst       record;
  v_customer   text;
  v_contact_id uuid;
  v_msg_id     uuid;
  v_conv_id    uuid;
  v_echo       boolean := COALESCE(p_is_echo, false);
  v_attempt    int;
BEGIN
  IF NULLIF(p_ig_account_id, '') IS NULL OR NULLIF(p_mid, '') IS NULL
     OR NULLIF(btrim(COALESCE(p_text, '')), '') IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;

  -- Instância: pelo índice único parcial de igAccountId.
  SELECT w.id, w.tenant_id, COALESCE(w.is_active, true) AS active
    INTO v_inst
    FROM public.whatsapp_instances w
   WHERE w.provider = 'instagram'
     AND w.connection_config ->> 'igAccountId' = p_ig_account_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_account');
  END IF;
  IF NOT v_inst.active THEN
    RETURN jsonb_build_object('outcome', 'inactive_instance', 'instance_id', v_inst.id);
  END IF;

  v_customer := CASE WHEN v_echo THEN p_recipient_id ELSE p_sender_id END;
  IF NULLIF(v_customer, '') IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;
  IF v_customer = p_ig_account_id THEN
    RETURN jsonb_build_object('outcome', 'own_account', 'instance_id', v_inst.id);
  END IF;

  -- Idempotência, passo 1.
  IF EXISTS (SELECT 1 FROM public.messages m WHERE m.evolution_message_id = p_mid) THEN
    RETURN jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id);
  END IF;

  IF v_echo THEN
    SELECT c.id INTO v_contact_id
      FROM public.contacts c
     WHERE c.tenant_id = v_inst.tenant_id
       AND c.channel = 'instagram'
       AND c.external_id = v_customer;
    IF v_contact_id IS NULL THEN
      RETURN jsonb_build_object('outcome', 'echo_without_contact', 'instance_id', v_inst.id);
    END IF;
  ELSE
    BEGIN
      v_contact_id := public.resolve_contact_by_channel(
        v_inst.tenant_id, 'instagram', v_customer, NULL, v_inst.id, p_text);
    EXCEPTION WHEN unique_violation THEN
      -- Duas primeiras mensagens do mesmo cliente ao mesmo tempo: a outra
      -- criou o contato primeiro. Ele existe agora.
      SELECT c.id INTO v_contact_id
        FROM public.contacts c
       WHERE c.tenant_id = v_inst.tenant_id
         AND c.channel = 'instagram'
         AND c.external_id = v_customer;
    END;
  END IF;

  -- Idempotência, passo 2. A segunda volta existe para a corrida na criação da
  -- conversa (a BEFORE trigger handle_message_conversation cria a conversa, e
  -- conversations tem UNIQUE (tenant_id, contact_id)).
  FOR v_attempt IN 1..2 LOOP
    BEGIN
      INSERT INTO public.messages (
        tenant_id, whatsapp_instance_id, contact_id, direction, message_type,
        content, evolution_message_id, status, is_from_bot, channel
      ) VALUES (
        v_inst.tenant_id, v_inst.id, v_contact_id,
        CASE WHEN v_echo THEN 'outbound' ELSE 'inbound' END,
        'text', p_text, p_mid,
        CASE WHEN v_echo THEN 'sent' ELSE 'received' END,
        false, 'instagram'
      )
      ON CONFLICT (evolution_message_id) WHERE evolution_message_id IS NOT NULL
      DO NOTHING
      RETURNING id, conversation_id INTO v_msg_id, v_conv_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM public.messages m WHERE m.evolution_message_id = p_mid) THEN
        RETURN jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id);
      END IF;
      IF v_attempt = 2 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  IF v_msg_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id);
  END IF;

  RETURN jsonb_build_object(
    'outcome',         'stored',
    'direction',       CASE WHEN v_echo THEN 'outbound' ELSE 'inbound' END,
    'instance_id',     v_inst.id,
    'tenant_id',       v_inst.tenant_id,
    'contact_id',      v_contact_id,
    'conversation_id', v_conv_id,
    'message_id',      v_msg_id
  );
END;
$function$;

COMMENT ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean) IS
  'Caminho de entrada do Instagram (fatia 2): resolve a instância por igAccountId, o contato por IGSID, grava a mensagem com o mid em evolution_message_id. Idempotente pelo mid. Eco vira outbound e nunca cria contato. Só service_role.';

REVOKE ALL ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Criação manual da instância (não há tela nesta fatia)
-- ---------------------------------------------------------------------------
--
-- Rodada pelo SQL Editor (papel postgres). NÃO é exposta a service_role nem a
-- ninguém: é procedimento de operador. O token vai para o Vault pela mesma
-- set_instance_meta_token do WhatsApp; na tabela fica só a data de validade.
--
-- O token gerado no painel da Meta ("Instagram API with Instagram login" →
-- Generate token) vale 60 dias. tokenExpiresAt = emissão + 60 dias, para a
-- fatia que construir a renovação saber quem está para vencer.
CREATE OR REPLACE FUNCTION public.create_instagram_instance(
  p_tenant_id       uuid,
  p_name            text,
  p_ig_account_id   text,
  p_ig_username     text,
  p_token           text,
  p_token_issued_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id      uuid;
  v_expires timestamptz;
  v_user    text := NULLIF(ltrim(btrim(COALESCE(p_ig_username, '')), '@'), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Conta % não existe. Nada foi criado.', p_tenant_id;
  END IF;
  IF p_ig_account_id IS NULL OR p_ig_account_id !~ '^[0-9]{5,30}$' THEN
    RAISE EXCEPTION 'igAccountId inválido (esperado só dígitos, ex.: 17841419262135883). Nada foi criado.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'token vazio. Nada foi criado.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'nome vazio. Nada foi criado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_instances w
              WHERE w.provider = 'instagram'
                AND w.connection_config ->> 'igAccountId' = p_ig_account_id) THEN
    RAISE EXCEPTION 'Já existe instância para a conta do Instagram %. Nada foi criado.', p_ig_account_id;
  END IF;

  v_expires := COALESCE(p_token_issued_at, now()) + interval '60 days';

  INSERT INTO public.whatsapp_instances (
    tenant_id, name, instance_key, provider, status, is_active,
    profile_name, connection_config
  ) VALUES (
    -- 'connected', e não 'open': o assistente de campanha e a Nova Conversa
    -- oferecem só instâncias 'open', e por elas o envio iria pela Evolution.
    p_tenant_id, btrim(p_name), 'instagram_' || p_ig_account_id, 'instagram',
    'connected', true,
    CASE WHEN v_user IS NULL THEN NULL ELSE '@' || v_user END,
    jsonb_build_object(
      'igAccountId',    p_ig_account_id,
      'igUsername',     v_user,
      'tokenIssuedAt',  COALESCE(p_token_issued_at, now()),
      'tokenExpiresAt', v_expires
    )
  )
  RETURNING id INTO v_id;

  PERFORM public.set_instance_meta_token(v_id, btrim(p_token));

  RETURN jsonb_build_object(
    'instance_id',      v_id,
    'ig_account_id',    p_ig_account_id,
    'token_expires_at', v_expires
  );
END;
$function$;

COMMENT ON FUNCTION public.create_instagram_instance(uuid, text, text, text, text, timestamptz) IS
  'Procedimento de operador (fatia 2 do Instagram, sem tela): cria a instância provider=instagram e guarda o token no Vault via set_instance_meta_token. Só postgres.';

REVOKE ALL ON FUNCTION public.create_instagram_instance(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Buraco da fatia 1: resolve_contact_by_channel era executável por
--    `authenticated`. A fatia 1 revogou de PUBLIC e anon, mas o default
--    privilege do Supabase concede a `authenticated` separadamente. Como a
--    função é SECURITY DEFINER e aceita qualquer tenant_id, qualquer usuário
--    logado criava contato em QUALQUER Conta. Nenhum código do app a chama
--    (só process_incoming_message, que roda como dono e não depende disto).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.resolve_contact_by_channel(uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_contact_by_channel(uuid, text, text, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Tabelas, triggers e o predicado do sweep — um comando só
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  ENCAIXA constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  v_enc_ct_antes  bigint;
  v_enc_cv_antes  bigint;
  v_enc_ms_antes  bigint;
  v_ms_antes      bigint;
  v_def           text;
  v_new           text;
  v_anchor        constant text := 'AND c.assigned_profile_id IS NOT NULL';
  v_added         constant text := E'\n       AND c.channel = ''whatsapp''';
  v_n             int;
  v_txt           text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT count(*) INTO v_enc_ct_antes FROM public.contacts      WHERE tenant_id = ENCAIXA;
  SELECT count(*) INTO v_enc_cv_antes FROM public.conversations WHERE tenant_id = ENCAIXA;
  SELECT count(*) INTO v_enc_ms_antes FROM public.messages      WHERE tenant_id = ENCAIXA;
  SELECT count(*) INTO v_ms_antes     FROM public.messages;

  -- ---- messages.channel ----------------------------------------------------
  -- DEFAULT constante: sem reescrita da tabela, sem UPDATE, nenhuma trigger de
  -- linha dispara. As mensagens existentes passam a valer 'whatsapp'.
  ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'messages_channel_check'
                    AND conrelid = 'public.messages'::regclass) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_channel_check
      CHECK (channel = ANY (ARRAY['whatsapp'::text, 'instagram'::text]));
  END IF;

  DROP TRIGGER IF EXISTS trg_messages_set_channel ON public.messages;
  CREATE TRIGGER trg_messages_set_channel
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.tg_messages_set_channel();

  -- ---- instância de Instagram ---------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'whatsapp_instances_instagram_account_check'
                    AND conrelid = 'public.whatsapp_instances'::regclass) THEN
    ALTER TABLE public.whatsapp_instances
      ADD CONSTRAINT whatsapp_instances_instagram_account_check
      CHECK (provider IS DISTINCT FROM 'instagram'
             OR NULLIF(connection_config ->> 'igAccountId', '') IS NOT NULL);
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_ig_account_uniq
    ON public.whatsapp_instances ((connection_config ->> 'igAccountId'))
    WHERE provider = 'instagram';

  -- ---- gates em messages ---------------------------------------------------
  DROP TRIGGER IF EXISTS trg_automation_message_received ON public.messages;
  CREATE TRIGGER trg_automation_message_received
    AFTER INSERT ON public.messages
    FOR EACH ROW
    WHEN (NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_automation_message_received();

  DROP TRIGGER IF EXISTS trg_webhook_messages ON public.messages;
  CREATE TRIGGER trg_webhook_messages
    AFTER INSERT ON public.messages
    FOR EACH ROW
    WHEN (NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_webhook_messages();

  DROP TRIGGER IF EXISTS trg_response_rule_reset_on_human_reply ON public.messages;
  CREATE TRIGGER trg_response_rule_reset_on_human_reply
    AFTER INSERT ON public.messages
    FOR EACH ROW
    WHEN (NEW.direction = 'outbound' AND NEW.is_from_bot IS NOT TRUE AND NEW.source IS NULL
          AND NEW.conversation_id IS NOT NULL AND NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_response_rule_reset_on_human_reply();

  DROP TRIGGER IF EXISTS zz_rotation_assign_on_inbound ON public.messages;
  CREATE TRIGGER zz_rotation_assign_on_inbound
    AFTER INSERT ON public.messages
    FOR EACH ROW
    WHEN (NEW.direction = ANY (ARRAY['inbound'::text, 'incoming'::text])
          AND NEW.conversation_id IS NOT NULL AND NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_rotation_assign_on_inbound();

  -- ---- gates em contacts ---------------------------------------------------
  DROP TRIGGER IF EXISTS trg_automation_contact_created ON public.contacts;
  CREATE TRIGGER trg_automation_contact_created
    AFTER INSERT ON public.contacts
    FOR EACH ROW
    WHEN (NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_automation_contact_created();

  DROP TRIGGER IF EXISTS trg_webhook_contact_created ON public.contacts;
  CREATE TRIGGER trg_webhook_contact_created
    AFTER INSERT ON public.contacts
    FOR EACH ROW
    WHEN (NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_webhook_contact_created();

  DROP TRIGGER IF EXISTS trg_webhook_contact_updated ON public.contacts;
  CREATE TRIGGER trg_webhook_contact_updated
    AFTER UPDATE ON public.contacts
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.* AND NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_webhook_contact_updated();

  DROP TRIGGER IF EXISTS trg_automation_funnel_stage_changed ON public.contacts;
  CREATE TRIGGER trg_automation_funnel_stage_changed
    AFTER UPDATE OF current_stage_id ON public.contacts
    FOR EACH ROW
    WHEN (OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id AND NEW.channel = 'whatsapp')
    EXECUTE FUNCTION public.tg_automation_funnel_stage_changed();

  -- ---- response_rule_sweep: um predicado, por substituição -----------------
  -- O sweep não é trigger: ele varre conversas ATRIBUÍDAS. O rodízio nunca
  -- atribui uma conversa de Instagram (gate acima), mas uma pessoa pode
  -- atribuir na mão. Sem este predicado, a regra transferiria a conversa.
  -- Substituição sobre a definição VIVA (não cópia à mão): exatamente uma
  -- ocorrência da âncora, e a prova de que só a linha nova mudou.
  v_def := pg_get_functiondef('public.response_rule_sweep(timestamp with time zone)'::regprocedure);
  IF position('c.channel = ''whatsapp''' IN v_def) = 0 THEN
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ABORTADO: a âncora do sweep aparece % vez(es), esperado 1. Nada foi alterado.', v_n;
    END IF;
    v_new := replace(v_def, v_anchor, v_anchor || v_added);
    IF replace(v_new, v_added, '') <> v_def THEN
      RAISE EXCEPTION 'ABORTADO: a substituição do sweep mudou mais do que o predicado. Nada foi alterado.';
    END IF;
    EXECUTE v_new;
  END IF;

  -- ---- CONFERÊNCIA ----------------------------------------------------------
  IF (SELECT count(*) FROM public.contacts      WHERE tenant_id = ENCAIXA) <> v_enc_ct_antes
  OR (SELECT count(*) FROM public.conversations WHERE tenant_id = ENCAIXA) <> v_enc_cv_antes
  OR (SELECT count(*) FROM public.messages      WHERE tenant_id = ENCAIXA) <> v_enc_ms_antes THEN
    RAISE EXCEPTION 'ABORTADO: contagens da EncaixaRH mudaram.';
  END IF;
  IF (SELECT count(*) FROM public.messages) <> v_ms_antes THEN
    RAISE EXCEPTION 'ABORTADO: contagem de messages mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.messages WHERE channel <> 'whatsapp') THEN
    RAISE EXCEPTION 'ABORTADO: apareceu mensagem fora do canal whatsapp.';
  END IF;

  -- Os oito gates estão lá.
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass)
     AND t.tgname IN ('trg_automation_message_received','trg_webhook_messages',
                      'trg_response_rule_reset_on_human_reply','zz_rotation_assign_on_inbound',
                      'trg_automation_contact_created','trg_webhook_contact_created',
                      'trg_webhook_contact_updated','trg_automation_funnel_stage_changed')
     AND pg_get_triggerdef(t.oid) LIKE '%channel = ''whatsapp''%'
     AND t.tgenabled = 'O';
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'ABORTADO: esperados 8 gates de canal habilitados, achei %.', v_n;
  END IF;

  -- Mesmo número de triggers de antes (+1: trg_messages_set_channel).
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal AND tgenabled = 'O';
  IF v_n <> 13 THEN
    RAISE EXCEPTION 'ABORTADO: messages deveria ter 13 triggers habilitadas, tem %.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.contacts'::regclass AND NOT tgisinternal AND tgenabled = 'O';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'ABORTADO: contacts deveria ter 6 triggers habilitadas, tem %.', v_n;
  END IF;

  -- O rodízio continua o ÚLTIMO AFTER INSERT de messages.
  SELECT tgname INTO v_txt FROM pg_trigger
   WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal
     AND tgtype & 1 = 1 AND tgtype & 4 = 4 AND tgtype & 2 = 0
   ORDER BY tgname DESC LIMIT 1;
  IF v_txt IS DISTINCT FROM 'zz_rotation_assign_on_inbound' THEN
    RAISE EXCEPTION 'ABORTADO: o último AFTER INSERT de messages virou %.', v_txt;
  END IF;

  RAISE NOTICE 'OK: messages.channel, 8 gates, sweep com predicado de canal, índice de igAccountId.';
END
$mig$;

COMMENT ON COLUMN public.messages.channel IS
  'Canal da mensagem, derivado do contato por trg_messages_set_channel. As triggers de bot/automação/rodízio/regra/webhook só disparam para channel=''whatsapp'' (fatia 2 do Instagram).';

-- ---------------------------------------------------------------------------
-- 6. Ledger
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260923000001', 'instagram_inbound')
ON CONFLICT (version) DO NOTHING;

-- ===========================================================================
-- ROLLBACK (um comando só; só é seguro sem nenhuma mensagem de Instagram)
-- ===========================================================================
-- DO $rb$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM public.messages WHERE channel <> 'whatsapp') THEN
--     RAISE EXCEPTION 'ABORTADO: há mensagens de Instagram; derrubar o gate faria as próximas acionarem tudo.';
--   END IF;
--   -- Recriar as 8 triggers SEM o "AND NEW.channel = 'whatsapp'" (definições
--   -- de antes em 20260922000002 / pg_get_triggerdef guardado), e o sweep sem a
--   -- linha "AND c.channel = 'whatsapp'" (replace inverso).
--   DROP TRIGGER IF EXISTS trg_messages_set_channel ON public.messages;
--   DROP FUNCTION IF EXISTS public.tg_messages_set_channel();
--   ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_channel_check;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS channel;
--   DROP INDEX IF EXISTS public.whatsapp_instances_ig_account_uniq;
--   ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_instagram_account_check;
--   DROP FUNCTION IF EXISTS public.process_instagram_message(text, text, text, text, text, boolean);
--   DROP FUNCTION IF EXISTS public.create_instagram_instance(uuid, text, text, text, text, timestamptz);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260923000001';
-- END
-- $rb$;
