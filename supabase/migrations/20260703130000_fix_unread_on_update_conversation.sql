-- Corrige de vez o indicador de conversas nao-lidas.
--
-- Diagnostico (verificado em producao 2026-07-03):
--   * messages.direction em producao e sempre 'inbound' / 'outbound' (nao existe
--     nenhuma linha com 'incoming').
--   * Quem realmente mantem conversations.last_message_at e unread_count e o
--     trigger AFTER INSERT `trigger_update_conversation_on_message` ->
--     update_conversation_on_message(), e ele comparava `direction = 'incoming'`.
--     Como o valor real e 'inbound', unread_count NUNCA incrementava e o destaque
--     de nao-lida na lista de conversas nunca aparecia.
--   * A migration anterior 20260703120000 corrigia a funcao ERRADA
--     (handle_message_conversation, que em producao so CRIA a conversa e delega a
--     contagem ao trigger AFTER). Aplica-la como estava causaria contagem dupla
--     (BEFORE incrementa + AFTER incrementa) e regrediria o split per-instance.
--
-- Esta migration:
--   1. Corrige update_conversation_on_message() para contar
--      direction IN ('inbound','incoming') — 'incoming' aceito so por seguranca.
--   2. Reafirma handle_message_conversation() na versao "so cria, nao conta",
--      neutralizando 20260703120000 caso tenha rodado (evita contagem dupla).
--   3. Backfill: recalcula unread_count das conversas ativas como o numero de
--      mensagens recebidas apos a ultima mensagem enviada (inbound nao respondido),
--      pra lista ja abrir com os leads nao-atendidos destacados.

-- 1) A funcao que de fato incrementa -------------------------------------------
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.conversations (tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count)
  VALUES (
    NEW.tenant_id,
    NEW.contact_id,
    NEW.whatsapp_instance_id,
    NEW.created_at,
    CASE WHEN NEW.direction IN ('inbound', 'incoming') THEN 1 ELSE 0 END
  )
  ON CONFLICT (tenant_id, contact_id)
  DO UPDATE SET
    last_message_at = NEW.created_at,
    unread_count = CASE
      WHEN NEW.direction IN ('inbound', 'incoming') THEN conversations.unread_count + 1
      ELSE conversations.unread_count
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$function$;

-- 2) Reafirma a versao segura (so cria a conversa; NAO conta) -------------------
--    A contagem e responsabilidade exclusiva do trigger AFTER acima; se ambos
--    contassem, cada mensagem recebida incrementaria +2.
CREATE OR REPLACE FUNCTION public.handle_message_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- UMA conversa por contato no tenant (consistente com a UNIQUE constraint).
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE contact_id = NEW.contact_id
      AND tenant_id = NEW.tenant_id;

    IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (
            tenant_id, contact_id, whatsapp_instance_id,
            last_message_at, unread_count, is_archived
        ) VALUES (
            NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id,
            NEW.created_at,
            0,  -- a contagem fica pro trigger AFTER update_conversation_on_message
            false
        ) RETURNING id INTO v_conversation_id;
    END IF;

    NEW.conversation_id = v_conversation_id;
    RETURN NEW;
END;
$function$;

-- 3) Backfill dos nao-lidos existentes -----------------------------------------
--    unread_count = qtd de mensagens 'inbound' recebidas depois da ultima
--    'outbound' da conversa (mensagens do lead ainda nao respondidas). Conversas
--    cuja ultima mensagem foi enviada por nos ficam com 0.
UPDATE public.conversations c
SET unread_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT m.conversation_id, COUNT(*) AS cnt
  FROM public.messages m
  WHERE m.direction = 'inbound'
    AND m.created_at > COALESCE((
      SELECT MAX(o.created_at)
      FROM public.messages o
      WHERE o.conversation_id = m.conversation_id
        AND o.direction = 'outbound'
    ), '-infinity'::timestamptz)
  GROUP BY m.conversation_id
) sub
WHERE c.id = sub.conversation_id
  AND c.is_archived = false;
