-- Fatia 3/5 do Instagram: RESPONDER pelo inbox.
--
-- ============================================================================
-- O QUE ESTA MIGRAÇÃO FAZ
-- ============================================================================
--
--   1. instagram_echo_claims: o registro de "este eco já foi casado com esta
--      linha". Tabela nova e pequena, em vez de coluna nova em messages — a
--      tabela quente fica intocada.
--   2. instagram_reply_window(contact_id): a janela de 24 h do Instagram,
--      chaveada pelo CONTATO. is_within_service_window (WhatsApp) casa por
--      dígitos de telefone e devolve false para todo contato do Instagram
--      (phone NULL) — não serve, e não é tocada.
--   3. process_instagram_message: o eco da resposta que o PRÓPRIO inbox mandou
--      passa a ser reconhecido e não vira segunda linha (ver RECONCILIAÇÃO).
--   4. reconcile_instagram_send: o caminho explícito para o conflito do UPDATE
--      do navegador (23505), em vez de falhar calado.
--
-- NÃO FAZ: tocar em is_within_service_window, em trigger nenhuma, em nada do
-- WhatsApp. messages não ganha coluna.
--
-- ============================================================================
-- RECONCILIAÇÃO — a linha que fica é a do NAVEGADOR
-- ============================================================================
--
-- O envio pelo inbox: o navegador grava a linha R (outbound, 'pending', sem
-- mid, autor = quem digitou), chama instagram-send-message, recebe o
-- message_id X da Meta e faz UPDATE em R (status 'sent', mid X). A Meta
-- (provavelmente) devolve o eco E com mid Y pelo webhook, em qualquer ordem.
-- Não está documentado que Y = X.
--
-- Por que a linha do navegador e não a do eco: a do eco não tem conserto
-- depois. tg_keep_message_sender impede sender_profile_id de ir de NULL para
-- uma pessoa, e trg_record_conversation_participant só dispara no INSERT.
--
-- O eco (process_instagram_message, p_is_echo = true), nesta ordem:
--   a. Y já está em alguma linha (evolution_message_id)  → duplicate.
--      Se a linha é do inbox (tem autor), registra o casamento ('mid_match').
--   b. Y já foi usado num casamento (instagram_echo_claims) → duplicate.
--   c. Existe linha do inbox que casa → ASSUME a linha: grava Y nela (só se
--      ela ainda não tem mid), 'pending' vira 'sent', registra o casamento.
--      Casa quando: mesmo contato, mesma instância, canal instagram, outbound,
--      humano (sem bot, sem source), MESMO TEXTO (CRLF→LF, trim), criada há
--      no máximo 2 minutos, ainda não casada, e
--        - 'pending' sem mid          ('claimed_pending': eco antes do UPDATE)
--        - 'sent' com mid, com autor  ('claimed_sent': UPDATE antes, X ≠ Y)
--   d. Nada disso → grava a linha, como na fatia 2.
--
-- As três ordens, com X = Y e com X ≠ Y:
--   UPDATE antes, X = Y  → (a). Uma linha.
--   UPDATE antes, X ≠ Y  → (c) 'claimed_sent'. Uma linha, mid X, casamento Y.
--   eco antes            → (c) 'claimed_pending'. O UPDATE depois escreve X na
--                          MESMA linha: se X = Y é o mesmo valor, sem conflito;
--                          se X ≠ Y troca Y por X, e o casamento guarda Y (é o
--                          que (b) usa quando a Meta reentrega o eco).
--   API não ecoa         → nada a casar. Uma linha.
--
-- Quando (c) não casa (texto normalizado diferente, eco atrasado mais de 2
-- min) e X = Y, o eco grava a linha D com o mid e o UPDATE do navegador bate
-- no índice único. O navegador então chama reconcile_instagram_send, que
-- apaga D (é o eco, sem autor, do mesmo contato — o mid igual prova que é a
-- mesma mensagem) e põe o mid em R. Uma linha de novo.
--
-- O que sobra sem conserto, e é dito: (c) não casa E X ≠ Y. Duas linhas.
--
-- CONCORRÊNCIA: trava consultiva por mid (duas entregas do mesmo eco) e, no
-- caminho do eco, por contato (dois ecos de texto igual disputando a mesma
-- linha). A trava do mid é a mesma que reconcile_instagram_send toma. Ordem
-- sempre mid → contato; o UPDATE do navegador só segura a própria linha.
--
-- ============================================================================
-- ATOMICIDADE
-- ============================================================================
--
-- Tabela e conferência num único bloco DO (lock_timeout 5 s: a FK para
-- messages pede um lock curto nela; se não sair, aborta em vez de enfileirar o
-- webhook do WhatsApp). Funções com CREATE OR REPLACE. Idempotente.

-- ---------------------------------------------------------------------------
-- 1. Tabela de casamentos eco → linha
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  ENCAIXA constant uuid := '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
  v_enc_ms_antes bigint;
  v_ms_antes     bigint;
  v_trg_antes    text;
  v_trg_depois   text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT count(*) INTO v_enc_ms_antes FROM public.messages WHERE tenant_id = ENCAIXA;
  SELECT count(*) INTO v_ms_antes     FROM public.messages;
  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_antes
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);

  CREATE TABLE IF NOT EXISTS public.instagram_echo_claims (
    mid        text        PRIMARY KEY,
    message_id uuid        NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
    tenant_id  uuid        NOT NULL,
    kind       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT instagram_echo_claims_kind_check
      CHECK (kind = ANY (ARRAY['mid_match'::text, 'claimed_pending'::text,
                               'claimed_sent'::text, 'merged_by_browser'::text]))
  );

  ALTER TABLE public.instagram_echo_claims ENABLE ROW LEVEL SECURITY;
  -- Sem policy: só funções SECURITY DEFINER escrevem e leem.
  REVOKE ALL ON public.instagram_echo_claims FROM PUBLIC, anon, authenticated;

  -- ---- CONFERÊNCIA ----------------------------------------------------------
  IF (SELECT count(*) FROM public.messages WHERE tenant_id = ENCAIXA) <> v_enc_ms_antes
  OR (SELECT count(*) FROM public.messages) <> v_ms_antes THEN
    RAISE EXCEPTION 'ABORTADO: contagem de messages mudou.';
  END IF;

  SELECT md5(string_agg(pg_get_triggerdef(t.oid), '|' ORDER BY t.tgname)) INTO v_trg_depois
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.messages'::regclass, 'public.contacts'::regclass, 'public.conversations'::regclass);
  IF v_trg_depois IS DISTINCT FROM v_trg_antes THEN
    RAISE EXCEPTION 'ABORTADO: alguma trigger de messages/contacts/conversations mudou.';
  END IF;

  RAISE NOTICE 'OK: instagram_echo_claims criada; messages e triggers intocadas.';
END
$mig$;

COMMENT ON TABLE public.instagram_echo_claims IS
  'Fatia 3 do Instagram: um eco (mid) casado com a linha que o inbox gravou. Existe para que a resposta enviada pelo inbox não apareça duas vezes. mid = o mid do ECO (pode diferir do message_id do envio). kind: mid_match | claimed_pending | claimed_sent | merged_by_browser. Só funções SECURITY DEFINER tocam.';

-- ---------------------------------------------------------------------------
-- 2. Janela de 24 h do Instagram, por CONTATO
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER de propósito: no navegador, a RLS de messages vale (quem
-- não vê a conversa recebe janela fechada — e também não vê o compositor).
-- A edge function chama com service_role DEPOIS de conferir o acesso.
--
-- created_at da mensagem do cliente é a hora em que ela CHEGOU aqui, não a
-- hora em que o cliente escreveu (o timestamp da entrega não é gravado). A
-- Meta reentrega por até 36 h: uma mensagem atrasada faz a janela parecer
-- aberta por mais tempo do que está. Por isso a edge function também traduz o
-- erro de janela da própria Meta.
CREATE OR REPLACE FUNCTION public.instagram_reply_window(p_contact_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  WITH ultima AS (
    SELECT max(m.created_at) AS at
      FROM public.messages m
     WHERE m.contact_id = p_contact_id
       AND m.channel = 'instagram'
       AND m.direction = ANY (ARRAY['inbound'::text, 'incoming'::text])
  )
  SELECT jsonb_build_object(
    'last_inbound_at', u.at,
    'closes_at',       u.at + interval '24 hours',
    'open',            COALESCE(u.at + interval '24 hours' > now(), false)
  )
  FROM ultima u;
$function$;

COMMENT ON FUNCTION public.instagram_reply_window(uuid) IS
  'Janela de resposta do Instagram (24 h desde a última mensagem do cliente), por contato. { last_inbound_at, closes_at, open }. SECURITY INVOKER: a RLS de messages vale para quem chama.';

REVOKE ALL ON FUNCTION public.instagram_reply_window(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instagram_reply_window(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. process_instagram_message com a reconciliação do eco
-- ---------------------------------------------------------------------------
--
-- Mesma assinatura, mesmos outcomes da fatia 2. O caminho de INBOUND não muda
-- (só ganha a trava do mid). Um eco casado devolve outcome 'duplicate' — para
-- o webhook ele É cópia de uma linha que já existe — com a chave extra
-- 'reconciled' dizendo como casou; o instagram-webhook não precisa de deploy.
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
  v_existing   record;
  v_claim      record;
  v_kind       text;
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

  -- Duas entregas do MESMO mid esperam uma pela outra (a Meta reentrega).
  PERFORM pg_advisory_xact_lock(hashtextextended('instagram_mid:' || p_mid, 0));

  -- Idempotência, passo 1: o mid já está numa linha.
  SELECT m.id, m.sender_profile_id INTO v_existing
    FROM public.messages m WHERE m.evolution_message_id = p_mid;
  IF FOUND THEN
    IF v_echo AND v_existing.sender_profile_id IS NOT NULL THEN
      -- Eco da resposta do inbox, depois do UPDATE, com o mesmo id: registra,
      -- para que a linha não fique "casável" por outro eco de texto igual.
      INSERT INTO public.instagram_echo_claims (mid, message_id, tenant_id, kind)
      VALUES (p_mid, v_existing.id, v_inst.tenant_id, 'mid_match')
      ON CONFLICT DO NOTHING;
      RETURN jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id,
                                'message_id', v_existing.id, 'reconciled', 'mid_match');
    END IF;
    RETURN jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id);
  END IF;

  -- Idempotência, passo 1b: o mid já foi usado para casar um eco (o UPDATE do
  -- navegador pode ter trocado o mid da linha pelo message_id do envio).
  SELECT c.message_id INTO v_existing
    FROM public.instagram_echo_claims c WHERE c.mid = p_mid;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'duplicate', 'instance_id', v_inst.id,
                              'message_id', v_existing.message_id, 'reconciled', 'already_claimed');
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

      RETURN jsonb_build_object(
        'outcome',         'duplicate',
        'reconciled',      v_kind,
        'direction',       'outbound',
        'instance_id',     v_inst.id,
        'tenant_id',       v_inst.tenant_id,
        'contact_id',      v_contact_id,
        'conversation_id', v_claim.conversation_id,
        'message_id',      v_claim.id
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
  'Caminho de entrada do Instagram: resolve a instância por igAccountId, o contato por IGSID, grava a mensagem com o mid em evolution_message_id. Idempotente pelo mid. Eco vira outbound e nunca cria contato; eco da resposta do PRÓPRIO inbox casa com a linha do navegador (instagram_echo_claims, fatia 3) em vez de virar segunda linha. Só service_role.';

REVOKE ALL ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_instagram_message(text, text, text, text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. O conflito do UPDATE do navegador, tratado
-- ---------------------------------------------------------------------------
--
-- O navegador chama SÓ quando o UPDATE (status + mid) na própria linha
-- devolveu 23505: o eco chegou antes, não casou (texto diferente, atraso) e
-- gravou a linha D com o mesmo mid. Só o AUTOR da linha pode pedir.
--
-- outcome:
--   attached           o mid estava livre (corrida já resolvida): gravado em R
--   already            R já tem esse mid
--   merged             D era o eco da resposta de R: D apagada, mid em R
--   conflict_foreign   o mid está numa linha que NÃO é o eco de R — nada tocado
--   not_author         R não é do usuário que chamou — nada tocado
--   not_found / not_instagram_outbound / invalid
CREATE OR REPLACE FUNCTION public.reconcile_instagram_send(p_message_id uuid, p_mid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record;
  d record;
BEGIN
  IF p_message_id IS NULL OR NULLIF(p_mid, '') IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;

  -- A mesma trava do eco: não corre junto com process_instagram_message.
  PERFORM pg_advisory_xact_lock(hashtextextended('instagram_mid:' || p_mid, 0));

  SELECT m.id, m.tenant_id, m.contact_id, m.channel, m.direction,
         m.sender_profile_id, m.evolution_message_id, m.created_at
    INTO r
    FROM public.messages m
   WHERE m.id = p_message_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF r.channel <> 'instagram' OR r.direction <> 'outbound' THEN
    RETURN jsonb_build_object('outcome', 'not_instagram_outbound');
  END IF;
  IF r.sender_profile_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = r.sender_profile_id AND p.user_id = auth.uid()) THEN
    RETURN jsonb_build_object('outcome', 'not_author');
  END IF;
  IF r.evolution_message_id = p_mid THEN
    RETURN jsonb_build_object('outcome', 'already', 'message_id', r.id);
  END IF;

  SELECT m.id, m.tenant_id, m.contact_id, m.channel, m.direction,
         m.sender_profile_id, m.is_from_bot, m.source, m.created_at
    INTO d
    FROM public.messages m
   WHERE m.evolution_message_id = p_mid
   FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.messages
       SET evolution_message_id = p_mid, status = 'sent'
     WHERE id = r.id;
    RETURN jsonb_build_object('outcome', 'attached', 'message_id', r.id);
  END IF;

  IF d.tenant_id = r.tenant_id
     AND d.contact_id = r.contact_id
     AND d.channel = 'instagram'
     AND d.direction = 'outbound'
     AND d.sender_profile_id IS NULL
     AND d.is_from_bot IS NOT TRUE
     AND d.source IS NULL
     AND d.created_at >= r.created_at THEN
    DELETE FROM public.messages WHERE id = d.id;
    UPDATE public.messages
       SET evolution_message_id = p_mid, status = 'sent'
     WHERE id = r.id;
    INSERT INTO public.instagram_echo_claims (mid, message_id, tenant_id, kind)
    VALUES (p_mid, r.id, r.tenant_id, 'merged_by_browser')
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('outcome', 'merged', 'message_id', r.id, 'removed_id', d.id);
  END IF;

  RETURN jsonb_build_object('outcome', 'conflict_foreign', 'message_id', r.id);
END;
$function$;

COMMENT ON FUNCTION public.reconcile_instagram_send(uuid, text) IS
  'Fatia 3 do Instagram: o navegador chama quando o UPDATE do mid na própria resposta bate no índice único (o eco chegou antes e não casou). Funde o eco na linha do navegador. Só o autor da linha.';

REVOKE ALL ON FUNCTION public.reconcile_instagram_send(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_instagram_send(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Ledger
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260923000002', 'instagram_reply')
ON CONFLICT (version) DO NOTHING;

-- ===========================================================================
-- ROLLBACK (um comando só)
-- ===========================================================================
-- Recriar process_instagram_message com o corpo de 20260923000001 (sem as
-- travas, o passo 1b e a reconciliação) e depois:
--   DROP FUNCTION IF EXISTS public.reconcile_instagram_send(uuid, text);
--   DROP FUNCTION IF EXISTS public.instagram_reply_window(uuid);
--   DROP TABLE IF EXISTS public.instagram_echo_claims;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260923000002';
-- Sem o casamento, a próxima resposta pelo inbox volta a poder aparecer duas
-- vezes; derrube o envio (instagram-send-message) antes.
