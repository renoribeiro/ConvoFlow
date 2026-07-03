-- Fix: o trigger handle_message_conversation incrementava conversations.unread_count
-- apenas quando NEW.direction = 'incoming', mas todo o sistema (RPC
-- process_incoming_message, webhooks e frontend) grava mensagens recebidas com
-- direction = 'inbound'. Resultado: unread_count NUNCA incrementava e o indicador
-- de conversas nao-lidas na lista nunca aparecia.
--
-- Correcao: passa a contar direction IN ('inbound','incoming') — aceita o valor
-- legado por seguranca, mas o valor real usado hoje e 'inbound'.

CREATE OR REPLACE FUNCTION handle_message_conversation()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Find existing conversation for this contact and whatsapp instance
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE contact_id = NEW.contact_id
      AND whatsapp_instance_id = NEW.whatsapp_instance_id
      AND tenant_id = NEW.tenant_id;

    -- If no conversation exists, create one
    IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (
            tenant_id,
            contact_id,
            whatsapp_instance_id,
            last_message_at,
            unread_count,
            is_archived
        ) VALUES (
            NEW.tenant_id,
            NEW.contact_id,
            NEW.whatsapp_instance_id,
            NEW.created_at,
            CASE WHEN NEW.direction IN ('inbound', 'incoming') THEN 1 ELSE 0 END,
            false
        ) RETURNING id INTO v_conversation_id;
    ELSE
        -- Update existing conversation
        UPDATE public.conversations
        SET last_message_at = NEW.created_at,
            unread_count = CASE
                WHEN NEW.direction IN ('inbound', 'incoming') THEN unread_count + 1
                ELSE unread_count
            END,
            updated_at = NOW()
        WHERE id = v_conversation_id;
    END IF;

    -- Set conversation_id in the message
    NEW.conversation_id = v_conversation_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
