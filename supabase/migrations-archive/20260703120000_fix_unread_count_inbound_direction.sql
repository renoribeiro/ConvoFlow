-- #############################################################################
-- ##  ARQUIVADA — SUPERSEDIDA. RODAR HOJE CONTA O NÃO-LIDO EM DOBRO.       ##
-- #############################################################################
--
-- Auditoria do ledger em 2026-08-24. Este arquivo nunca rodou, e o problema
-- que ele conserta já foi consertado em outro lugar.
--
-- Quem incrementa conversations.unread_count hoje é
--   update_conversation_on_message()  (migração 20260703130000, essa no ledger)
-- e ela já trata direction IN ('inbound','incoming').
--
-- O handle_message_conversation() vivo foi enxugado e NÃO mexe mais em
-- unread_count. Restaurar a versão deste arquivo faz os DOIS triggers somarem
-- na mesma mensagem recebida → cada mensagem conta 2.
--
-- Defeito separado, conhecido e adiado de propósito: o
-- handle_message_conversation() vivo casa conversa por (contact_id, tenant_id)
-- e ignora whatsapp_instance_id — duas instâncias no mesmo contato caem na
-- mesma conversa. NÃO conserte reaplicando este arquivo.
--
-- Carimbado como aplicado no ledger (docs/reconciliar_ledger_migracoes.sql,
-- LOTE 3) de propósito, como trava.
-- #############################################################################

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
