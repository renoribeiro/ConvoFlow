-- =============================================================================
-- Sinalização de SLA — silenciamento se desfaz sozinho quando o cliente volta
-- =============================================================================
-- "Cliente não vai responder" (conversations.sla_muted_at) era permanente até
-- alguém desfazer à mão. Se o cliente voltasse a escrever dias depois, a
-- conversa continuava fora da sinalização — exatamente o caso em que ela mais
-- precisa aparecer.
--
-- Esta migration faz o trigger que já mantém last_message_at/unread_count
-- (update_conversation_on_message, AFTER INSERT em public.messages) limpar
-- também sla_muted_at/sla_muted_by — mas SÓ em mensagem do cliente.
--
--   direction 'inbound'/'incoming'  → limpa   (a bola voltou para a Loja)
--   direction 'outbound'            → preserva (a Loja mandar template, disparo
--                                     de campanha ou follow-up automático não é
--                                     motivo para a conversa voltar à fila)
--
-- 'incoming' segue aceitado junto de 'inbound' pelo mesmo motivo da migration
-- 20260703130000: legado, nunca visto em produção, aceito por segurança.
--
-- A base é a definição que estava VIVA no banco em 2026-08-13 (conferida com
-- pg_get_functiondef, não o arquivo local — o histórico de migrations deste
-- projeto está dessincronizado). As duas únicas linhas novas são os CASE de
-- sla_muted_at/sla_muted_by no DO UPDATE; o resto é idêntico.
--
-- CREATE OR REPLACE FUNCTION é idempotente por natureza; o trigger em si NÃO é
-- recriado (continua sendo trigger_update_conversation_on_message).
--
-- DEPENDE de 20260813000001_conversations_sla_mute.sql — o DO abaixo falha alto
-- e claro se as colunas ainda não existirem, em vez de deixar o erro estourar
-- na próxima mensagem recebida.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'sla_muted_at'
  ) THEN
    RAISE EXCEPTION
      'public.conversations.sla_muted_at não existe. Rode antes a migration 20260813000001_conversations_sla_mute.sql.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.conversations (tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count)
  VALUES (NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at,
          CASE WHEN NEW.direction IN ('inbound','incoming') THEN 1 ELSE 0 END)
  ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
    last_message_at = NEW.created_at,
    unread_count = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN conversations.unread_count + 1
                        ELSE conversations.unread_count END,
    -- Mensagem do cliente reabre a pendência: volta a sinalizar.
    sla_muted_at = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_at END,
    sla_muted_by = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_by END,
    updated_at = NOW();
  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.update_conversation_on_message() IS
  'Mantém conversations.last_message_at/unread_count a cada mensagem e limpa o silenciamento de SLA (sla_muted_at/_by) quando a mensagem é do cliente (inbound). Trigger AFTER INSERT em public.messages.';

-- =============================================================================
-- ROLLBACK — reinstala a versão sem a limpeza de SLA (a de 20260703130000):
--
--   CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
--   RETURNS TRIGGER LANGUAGE plpgsql AS $function$
--   BEGIN
--     INSERT INTO public.conversations (tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count)
--     VALUES (NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at,
--             CASE WHEN NEW.direction IN ('inbound','incoming') THEN 1 ELSE 0 END)
--     ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
--       last_message_at = NEW.created_at,
--       unread_count = CASE WHEN NEW.direction IN ('inbound','incoming')
--                           THEN conversations.unread_count + 1
--                           ELSE conversations.unread_count END,
--       updated_at = NOW();
--     RETURN NEW;
--   END; $function$;
-- =============================================================================
