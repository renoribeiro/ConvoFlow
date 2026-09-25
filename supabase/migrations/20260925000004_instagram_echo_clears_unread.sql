-- Instagram: a resposta dada pelo app do celular (o eco) zera as não lidas.
--
-- ============================================================================
-- O QUE ESTA MIGRAÇÃO FAZ
-- ============================================================================
--
--   1. instagram_message_meta_times: o horário da META de cada mensagem do
--      Instagram (messaging[].timestamp da entrega), uma linha por mensagem,
--      coluna meta_ts ANULÁVEL. Tabela ao lado, como instagram_echo_claims —
--      messages não ganha coluna (receita de
--      docs/RUNBOOK_instagram_fatia4a_conversas.md).
--   2. instagram_echo_mark_read(conversa, horário do eco): a guarda. Zera
--      unread_count só quando nenhuma mensagem do cliente tem horário da Meta
--      igual ou posterior ao do eco.
--   3. process_instagram_message ganha o 7º argumento p_meta_ts (DEFAULT
--      NULL). Grava o horário de toda mensagem, entrada e eco, e em TODO eco
--      (do celular, do inbox casado por mid ou por casamento de texto) chama a
--      guarda. Continua UMA função só: o DROP da de 6 argumentos e o CREATE da
--      de 7 correm no mesmo bloco, então não existe sobrecarga ambígua nem
--      instante sem função. Quem chama com 6 argumentos (o instagram-webhook
--      antes do redeploy, as suítes) continua funcionando: p_meta_ts = NULL,
--      e eco sem horário nunca zera nada.
--
-- NÃO FAZ: tocar em update_conversation_on_message, em trigger nenhuma, em
-- reconcile_instagram_send, em nada do WhatsApp. messages não ganha coluna.
--
-- ============================================================================
-- A GUARDA — por que o horário da Meta, e o que acontece sem ele
-- ============================================================================
--
-- T = horário da Meta do eco. A conversa só é zerada se NÃO existe mensagem de
-- entrada do cliente, nessa conversa, que
--   (a) tenha horário da Meta >= T  — o cliente escreveu depois (ou no mesmo
--       milissegundo) da nossa resposta: continua não lida; ou
--   (b) não tenha horário da Meta e tenha CHEGADO aqui depois de T - 5 min —
--       não dá para provar que veio antes da resposta: continua não lida.
--
-- (b) é o tratamento das linhas sem horário (todas as anteriores a esta
-- migração, e as gravadas pelo webhook antigo entre esta migração e o redeploy
-- dele). O argumento: uma mensagem só chega aqui depois de acontecer na Meta,
-- então chegada (created_at) < T - 5 min prova que ela aconteceu antes da
-- resposta, com 5 min de folga para diferença de relógio entre a Meta e o
-- banco. Sem essa prova, a linha sem horário SEGURA a conversa. Consequência
-- prática: uma resposta nova pelo celular zera uma pendência antiga (que
-- chegou antes dela), e nunca zera uma que chegou perto ou depois dela.
--
-- Mensagem COM horário é julgada só pelo horário, nunca pela chegada: assim a
-- guarda não depende do relógio do banco para elas. A busca varre as
-- mensagens de entrada do contato (idx_messages_contact_created_at), que no
-- Instagram são poucas.
--
-- Duas condições a mais, por decisão desta entrega:
--   * eco sem horário da Meta (p_meta_ts NULL ou implausível) nunca zera;
--   * a conversa só é zerada se a última mensagem CHEGADA é nossa
--     (last_message_direction = 'outbound'). Zerar é "a conversa foi
--     respondida": com a última mensagem chegada sendo do cliente ela
--     continuaria em "Aguardando resposta" mesmo com zero não lidas. No eco do
--     celular isso sempre vale (o próprio eco acabou de virar a última); só
--     conta no eco do inbox, se uma mensagem do cliente chegou depois da linha
--     que o navegador gravou.
--
-- Zerar = o mesmo UPDATE que o navegador faz ao abrir a conversa
-- (useMarkConversationAsRead: unread_count = 0, updated_at = now()). A
-- direção 'outbound' já foi gravada pela trigger quando a resposta entrou.
-- Com as duas coisas, a conversa sai de "Aguardando resposta"
-- (AWAITING_REPLY_FILTER / resolveAttendanceGroup). O status 'read' das
-- mensagens de entrada, que o navegador também grava ao abrir, NÃO é tocado:
-- nenhuma regra de fila lê esse campo, e um UPDATE de status em messages
-- dispara duas triggers (campanha e prévia) que não têm por que rodar aqui.
--
-- CONCORRÊNCIA: a guarda trava a linha da conversa (FOR UPDATE) antes de olhar
-- as mensagens. A mensagem do cliente atualiza a mesma linha pela trigger
-- update_conversation_on_message; então ou ela terminou antes (e a busca, que
-- é outro comando com fotografia nova, a enxerga), ou ela espera a trava e
-- soma 1 depois do zero. Nos dois casos a mensagem nova fica não lida.
--
-- ============================================================================
-- ATOMICIDADE
-- ============================================================================
--
-- Tudo num único bloco DO (armadilha 4 do CLAUDE.md): guardas, tabela, troca
-- da função, ledger e conferência. lock_timeout 5 s: a FK para messages pede
-- um lock curto nela; se não sair, aborta em vez de enfileirar o webhook do
-- WhatsApp. Rodar de novo depois de aplicada é no-op (avisa e sai).

DO $mig$
DECLARE
  ENCAIXA constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  -- md5 (CRLF→LF) do corpo em produção antes desta migração = arquivo
  -- 20260923000002 (conferido em 2026-09-25).
  PIM_ANTES constant text := '111e0f4661d966ec79243737636b4956';
  UCOM      constant text := '9682617bf53e77c1baf558079867c226';
  v_n              int;
  v_enc_antes      text;
  v_enc_depois     text;
  v_ms_antes       bigint;
  v_trg_antes      text;
  v_trg_depois     text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF to_regprocedure('public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)') IS NOT NULL THEN
    RAISE NOTICE 'Já aplicada: process_instagram_message já tem p_meta_ts. Nada feito.';
    RETURN;
  END IF;

  -- O lock que a FK da tabela nova pede em messages, tomado JÁ: daqui ao fim
  -- do bloco nenhuma mensagem entra, então a contagem "antes" é a "depois"
  -- se esta migração não escreveu nada. Espera no máximo 5 s.
  LOCK TABLE public.messages IN SHARE ROW EXCLUSIVE MODE;

  -- ---- PREMISSAS ------------------------------------------------------------
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'process_instagram_message';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 1 process_instagram_message, há %.', v_n;
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r\n', E'\n')) FROM pg_proc
       WHERE oid = to_regprocedure('public.process_instagram_message(text,text,text,text,text,boolean)'))
     IS DISTINCT FROM PIM_ANTES THEN
    RAISE EXCEPTION 'ABORTADO: process_instagram_message em produção não é a da 20260923000002.';
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r\n', E'\n')) FROM pg_proc
       WHERE oid = 'public.update_conversation_on_message()'::regprocedure) IS DISTINCT FROM UCOM THEN
    RAISE EXCEPTION 'ABORTADO: update_conversation_on_message não é a conhecida.';
  END IF;

  SELECT md5(coalesce(string_agg(m::text, '|' ORDER BY m.id), '')) INTO v_enc_antes
    FROM public.messages m WHERE m.tenant_id = ENCAIXA;
  SELECT md5(coalesce(string_agg(c::text, '|' ORDER BY c.id), '')) || md5(v_enc_antes) INTO v_enc_antes
    FROM public.conversations c WHERE c.tenant_id = ENCAIXA;
  SELECT count(*) INTO v_ms_antes FROM public.messages;
  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_antes
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);

  -- ---- 1. Horário da Meta ---------------------------------------------------
  CREATE TABLE public.instagram_message_meta_times (
    message_id  uuid        PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
    meta_ts     timestamptz NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.instagram_message_meta_times ENABLE ROW LEVEL SECURITY;
  -- Sem policy: só funções SECURITY DEFINER escrevem e leem.
  REVOKE ALL ON public.instagram_message_meta_times FROM PUBLIC, anon, authenticated;

  COMMENT ON TABLE public.instagram_message_meta_times IS
    'Horário da Meta (messaging[].timestamp) de cada mensagem do Instagram, entrada e eco, gravado pelo instagram-webhook via process_instagram_message. meta_ts NULL = a entrega não trouxe horário plausível. Sem linha = mensagem anterior a 20260925000004. Usado pela guarda instagram_echo_mark_read. Só funções SECURITY DEFINER tocam.';

  -- ---- 2. A guarda ------------------------------------------------------------
  EXECUTE $ddl$
CREATE FUNCTION public.instagram_echo_mark_read(p_conversation_id uuid, p_echo_meta_ts timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_conv record;
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN 'no_conversation';
  END IF;
  -- Eco sem horário da Meta nunca zera: sem ele não há como provar a ordem.
  IF p_echo_meta_ts IS NULL THEN
    RETURN 'no_meta_time';
  END IF;

  -- Trava a conversa ANTES de olhar as mensagens (ver CONCORRÊNCIA).
  SELECT c.id, c.tenant_id, c.contact_id, c.channel, c.unread_count, c.last_message_direction
    INTO v_conv
    FROM public.conversations c
   WHERE c.id = p_conversation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_conversation';
  END IF;
  IF v_conv.channel IS DISTINCT FROM 'instagram' THEN
    RETURN 'not_instagram';
  END IF;
  IF COALESCE(v_conv.unread_count, 0) = 0 THEN
    RETURN 'nothing_unread';
  END IF;
  IF v_conv.last_message_direction IS DISTINCT FROM 'outbound' THEN
    RETURN 'customer_spoke_last';
  END IF;

  -- A guarda do horário da Meta: segura a conversa a mensagem do cliente com
  -- horário >= o do eco, e a sem horário que chegou depois de (eco - 5 min).
  IF EXISTS (
    SELECT 1
      FROM public.messages m
      LEFT JOIN public.instagram_message_meta_times t ON t.message_id = m.id
     WHERE m.tenant_id = v_conv.tenant_id
       AND m.contact_id = v_conv.contact_id
       AND m.channel = 'instagram'
       AND m.direction = ANY (ARRAY['inbound'::text, 'incoming'::text])
       AND (t.meta_ts >= p_echo_meta_ts OR (t.meta_ts IS NULL AND m.created_at >= p_echo_meta_ts - interval '5 minutes'))
  ) THEN
    RETURN 'later_inbound';
  END IF;

  -- O mesmo UPDATE do navegador ao abrir a conversa (useMarkConversationAsRead).
  UPDATE public.conversations
     SET unread_count = 0,
         updated_at = now()
   WHERE id = p_conversation_id;
  RETURN 'cleared';
END;
$function$;
$ddl$;

  COMMENT ON FUNCTION public.instagram_echo_mark_read(uuid, timestamptz) IS
    'Guarda do eco do Instagram: zera unread_count da conversa só se nenhuma mensagem do cliente tem horário da Meta >= o do eco (ou, sem horário, chegou depois de horário do eco - 5 min), e se a última mensagem chegada é nossa. Devolve cleared | later_inbound | nothing_unread | customer_spoke_last | no_meta_time | not_instagram | no_conversation. Só process_instagram_message chama.';
  REVOKE ALL ON FUNCTION public.instagram_echo_mark_read(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

  -- ---- 3. process_instagram_message com p_meta_ts ------------------------------
  DROP FUNCTION public.process_instagram_message(text, text, text, text, text, boolean);

  EXECUTE $ddl$
CREATE FUNCTION public.process_instagram_message(
  p_ig_account_id text,
  p_sender_id     text,
  p_recipient_id  text,
  p_mid           text,
  p_text          text,
  p_is_echo       boolean,
  p_meta_ts       timestamptz DEFAULT NULL
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
  v_existing   record;
  v_claim      record;
  v_kind       text;
  v_meta_ts    timestamptz;
  v_unread     text;
BEGIN
  IF NULLIF(p_ig_account_id, '') IS NULL OR NULLIF(p_mid, '') IS NULL
     OR NULLIF(btrim(COALESCE(p_text, '')), '') IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;

  -- Horário da Meta: só vale se plausível. Fora disso vira NULL, que nunca
  -- zera nada (o webhook já filtra; esta é a segunda rede).
  v_meta_ts := CASE
    WHEN p_meta_ts >= timestamptz '2020-01-01 00:00:00+00'
     AND p_meta_ts <= now() + interval '1 day' THEN p_meta_ts
  END;

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

  -- Duas entregas do MESMO mid esperam uma pela outra (a Meta reentrega).
  PERFORM pg_advisory_xact_lock(hashtextextended('instagram_mid:' || p_mid, 0));

  -- Idempotência, passo 1: o mid já está numa linha.
  SELECT m.id, m.sender_profile_id, m.conversation_id INTO v_existing
    FROM public.messages m WHERE m.evolution_message_id = p_mid;
  IF FOUND THEN
    -- Reentrega: completa o horário se a primeira entrega veio sem ele.
    INSERT INTO public.instagram_message_meta_times AS t (message_id, meta_ts)
    VALUES (v_existing.id, v_meta_ts)
    ON CONFLICT (message_id) DO UPDATE SET meta_ts = COALESCE(t.meta_ts, EXCLUDED.meta_ts);

    IF v_echo THEN
      v_unread := public.instagram_echo_mark_read(v_existing.conversation_id, v_meta_ts);
    END IF;

    IF v_echo AND v_existing.sender_profile_id IS NOT NULL THEN
      -- Eco da resposta do inbox, depois do UPDATE, com o mesmo id: registra,
      -- para que a linha não fique "casável" por outro eco de texto igual.
      INSERT INTO public.instagram_echo_claims (mid, message_id, tenant_id, kind)
      VALUES (p_mid, v_existing.id, v_inst.tenant_id, 'mid_match')
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id,
                                'message_id', v_existing.id, 'reconciled', 'mid_match',
                                'conversation_id', v_existing.conversation_id,
                                'unread', v_unread);
    END IF;
    RETURN jsonb_strip_nulls(jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id,
                                                'unread', v_unread));
  END IF;

  -- Idempotência, passo 1b: o mid já foi usado para casar um eco (o UPDATE do
  -- navegador pode ter trocado o mid da linha pelo message_id do envio).
  SELECT c.message_id, m.conversation_id INTO v_existing
    FROM public.instagram_echo_claims c
    JOIN public.messages m ON m.id = c.message_id
   WHERE c.mid = p_mid;
  IF FOUND THEN
    INSERT INTO public.instagram_message_meta_times AS t (message_id, meta_ts)
    VALUES (v_existing.message_id, v_meta_ts)
    ON CONFLICT (message_id) DO UPDATE SET meta_ts = COALESCE(t.meta_ts, EXCLUDED.meta_ts);
    IF v_echo THEN
      v_unread := public.instagram_echo_mark_read(v_existing.conversation_id, v_meta_ts);
    END IF;
    RETURN jsonb_strip_nulls(jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id,
                              'message_id', v_existing.message_id, 'reconciled', 'already_claimed',
                              'conversation_id', v_existing.conversation_id,
                              'unread', v_unread));
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

    -- Dois ecos de texto igual do mesmo contato não disputam a mesma linha.
    PERFORM pg_advisory_xact_lock(hashtextextended('instagram_contact:' || v_contact_id::text, 0));

    -- Reconciliação: a linha que o inbox gravou para esta resposta.
    SELECT m.id, m.conversation_id, (m.evolution_message_id IS NULL) AS was_pending
      INTO v_claim
      FROM public.messages m
     WHERE m.tenant_id = v_inst.tenant_id
       AND m.contact_id = v_contact_id
       AND m.whatsapp_instance_id = v_inst.id
       AND m.channel = 'instagram'
       AND m.direction = 'outbound'
       AND m.is_from_bot IS NOT TRUE
       AND m.source IS NULL
       AND m.created_at >= now() - interval '2 minutes'
       AND btrim(replace(COALESCE(m.content, ''), E'\r\n', E'\n'))
           = btrim(replace(p_text, E'\r\n', E'\n'))
       AND NOT EXISTS (SELECT 1 FROM public.instagram_echo_claims c WHERE c.message_id = m.id)
       AND (
             (m.evolution_message_id IS NULL AND m.status = 'pending')
          OR (m.evolution_message_id IS NOT NULL AND m.sender_profile_id IS NOT NULL AND m.status = 'sent')
           )
     ORDER BY m.created_at, m.id
     LIMIT 1
     FOR UPDATE OF m;

    IF FOUND THEN
      v_kind := CASE WHEN v_claim.was_pending THEN 'claimed_pending' ELSE 'claimed_sent' END;

      UPDATE public.messages
         SET evolution_message_id = COALESCE(evolution_message_id, p_mid),
             status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END
       WHERE id = v_claim.id;

      INSERT INTO public.instagram_echo_claims (mid, message_id, tenant_id, kind)
      VALUES (p_mid, v_claim.id, v_inst.tenant_id, v_kind);

      INSERT INTO public.instagram_message_meta_times AS t (message_id, meta_ts)
      VALUES (v_claim.id, v_meta_ts)
      ON CONFLICT (message_id) DO UPDATE SET meta_ts = COALESCE(t.meta_ts, EXCLUDED.meta_ts);

      v_unread := public.instagram_echo_mark_read(v_claim.conversation_id, v_meta_ts);

      RETURN jsonb_build_object(
        'outcome',         'duplicate',
        'reconciled',      v_kind,
        'direction',       'outbound',
        'instance_id',     v_inst.id,
        'tenant_id',       v_inst.tenant_id,
        'contact_id',      v_contact_id,
        'conversation_id', v_claim.conversation_id,
        'message_id',      v_claim.id,
        'unread',          v_unread
      );
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

  INSERT INTO public.instagram_message_meta_times (message_id, meta_ts)
  VALUES (v_msg_id, v_meta_ts);

  -- O eco do celular acabou de virar a última mensagem (a trigger gravou
  -- 'outbound'); a guarda decide se a conversa sai de "Aguardando".
  IF v_echo THEN
    v_unread := public.instagram_echo_mark_read(v_conv_id, v_meta_ts);
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'outcome',         'stored',
    'direction',       CASE WHEN v_echo THEN 'outbound' ELSE 'inbound' END,
    'instance_id',     v_inst.id,
    'tenant_id',       v_inst.tenant_id,
    'contact_id',      v_contact_id,
    'conversation_id', v_conv_id,
    'message_id',      v_msg_id,
    'unread',          v_unread
  ));
END;
$function$;
$ddl$;

  COMMENT ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean, timestamptz) IS
    'Caminho de entrada do Instagram: resolve a instância por igAccountId, o contato por IGSID, grava a mensagem com o mid em evolution_message_id e o horário da Meta (p_meta_ts) em instagram_message_meta_times. Idempotente pelo mid. Eco vira outbound e nunca cria contato; eco da resposta do PRÓPRIO inbox casa com a linha do navegador (instagram_echo_claims, fatia 3). Todo eco passa pela guarda instagram_echo_mark_read (zera não lidas). Só service_role.';
  REVOKE ALL ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean, timestamptz) TO service_role;

  -- ---- 4. Ledger ------------------------------------------------------------
  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260925000004', 'instagram_echo_clears_unread')
  ON CONFLICT (version) DO NOTHING;

  -- ---- CONFERÊNCIA ----------------------------------------------------------
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'process_instagram_message';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: sobrou mais de uma process_instagram_message (%).', v_n;
  END IF;
  IF has_function_privilege('anon', 'public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)', 'EXECUTE')
  OR NOT has_function_privilege('service_role', 'public.process_instagram_message(text,text,text,text,text,boolean,timestamptz)', 'EXECUTE')
  OR has_function_privilege('anon', 'public.instagram_echo_mark_read(uuid,timestamptz)', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.instagram_echo_mark_read(uuid,timestamptz)', 'EXECUTE')
  OR has_function_privilege('service_role', 'public.instagram_echo_mark_read(uuid,timestamptz)', 'EXECUTE')
  OR has_table_privilege('authenticated', 'public.instagram_message_meta_times', 'SELECT')
  OR has_table_privilege('anon', 'public.instagram_message_meta_times', 'SELECT') THEN
    RAISE EXCEPTION 'ABORTADO: permissões diferentes do esperado.';
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r\n', E'\n')) FROM pg_proc
       WHERE oid = 'public.update_conversation_on_message()'::regprocedure) IS DISTINCT FROM UCOM THEN
    RAISE EXCEPTION 'ABORTADO: update_conversation_on_message mudou.';
  END IF;

  SELECT md5(coalesce(string_agg(m::text, '|' ORDER BY m.id), '')) INTO v_enc_depois
    FROM public.messages m WHERE m.tenant_id = ENCAIXA;
  SELECT md5(coalesce(string_agg(c::text, '|' ORDER BY c.id), '')) || md5(v_enc_depois) INTO v_enc_depois
    FROM public.conversations c WHERE c.tenant_id = ENCAIXA;
  IF v_enc_depois IS DISTINCT FROM v_enc_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma linha da EncaixaRH mudou.';
  END IF;
  IF (SELECT count(*) FROM public.messages) <> v_ms_antes THEN
    RAISE EXCEPTION 'ABORTADO: contagem de messages mudou.';
  END IF;
  IF (SELECT count(*) FROM public.instagram_message_meta_times) <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: a tabela nova nasceu com linhas.';
  END IF;

  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_depois
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);
  IF v_trg_depois IS DISTINCT FROM v_trg_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma trigger de messages/contacts/conversations mudou.';
  END IF;

  RAISE NOTICE 'OK: horário da Meta + guarda do eco no ar; nenhuma linha existente mudou.';
END
$mig$;

-- ===========================================================================
-- ROLLBACK (um bloco só, na ordem)
-- ===========================================================================
-- 1. PRIMEIRO volte o instagram-webhook para a versão anterior (6
--    argumentos): a versão nova manda p_meta_ts, que a função de 6 não aceita.
-- 2. DO $rb$ BEGIN
--      DROP FUNCTION public.process_instagram_message(text,text,text,text,text,boolean,timestamptz);
--      -- recriar a de 6 argumentos com o corpo de 20260923000002 (CREATE +
--      -- COMMENT + REVOKE + GRANT de lá), dentro deste mesmo bloco, via EXECUTE
--      DROP FUNCTION public.instagram_echo_mark_read(uuid, timestamptz);
--      DROP TABLE public.instagram_message_meta_times;
--      DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925000004';
--    END $rb$;
-- Sem esta migração o eco volta a não mexer nas não lidas; nada mais muda.
