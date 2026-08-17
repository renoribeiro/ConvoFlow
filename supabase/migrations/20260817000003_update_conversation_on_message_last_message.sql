-- =============================================================================
-- Desnormaliza a última mensagem na linha da conversa (3/5 — trigger)
--
-- Estende a trigger que JÁ EXISTE (trigger_update_conversation_on_message,
-- AFTER INSERT em public.messages). Nenhuma trigger nova é criada: só entram
-- colunas a mais nos dois ramos do upsert.
--
-- A base desta função é o que estava rodando em produção nesta data, obtido com
-- pg_get_functiondef() — os arquivos locais de migração estão dessincronizados
-- do banco e NÃO servem de referência. Tudo que já existia é preservado ao pé
-- da letra:
--   * last_message_at = created_at da mensagem que acabou de entrar;
--   * unread_count incrementado só em mensagem do cliente;
--   * sla_muted_at/sla_muted_by zerados só em mensagem do cliente;
--   * updated_at = NOW().
--
-- NORMALIZAÇÃO DA DIREÇÃO: `messages.direction` aceita 'incoming' como sinônimo
-- histórico de 'inbound' (é o que os CASE abaixo sempre casaram). A coluna
-- desnormalizada guarda só 'inbound' | 'outbound', porque no front todo teste é
-- `!== 'inbound'` — um 'incoming' cru seria lido como mensagem nossa e tiraria a
-- conversa de "Aguardando" e da sinalização de SLA. O CHECK da migração 1/5
-- garante que nada fora desse vocabulário entra.
--
-- Ordem em relação às demais triggers de messages: trigger_handle_message_
-- conversation roda BEFORE INSERT e já cria a conversa, então na prática o
-- caminho executado aqui é quase sempre o DO UPDATE. Por isso os dois ramos
-- precisam escrever as quatro colunas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.conversations (
    tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count,
    last_message_content, last_message_direction, last_message_status, last_message_type
  )
  VALUES (
    NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at,
    CASE WHEN NEW.direction IN ('inbound','incoming') THEN 1 ELSE 0 END,
    NEW.content,
    CASE WHEN NEW.direction IN ('inbound','incoming') THEN 'inbound' ELSE 'outbound' END,
    NEW.status,
    NEW.message_type
  )
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
    -- Prévia da lista. Acompanha last_message_at sempre: quem manda em qual
    -- mensagem "é a última" é a mesma linha que acabou de entrar, então as
    -- cinco colunas nunca divergem entre si.
    last_message_content = NEW.content,
    last_message_direction = CASE WHEN NEW.direction IN ('inbound','incoming')
                                  THEN 'inbound'
                                  ELSE 'outbound' END,
    last_message_status = NEW.status,
    last_message_type = NEW.message_type,
    updated_at = NOW();
  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.update_conversation_on_message() IS
  'Mantém conversations.last_message_at/unread_count a cada mensagem, limpa o silenciamento de SLA (sla_muted_at/_by) quando a mensagem é do cliente (inbound) e desnormaliza a prévia da última mensagem (last_message_content/_direction/_status/_type), normalizando ''incoming'' para ''inbound''. Trigger AFTER INSERT em public.messages.';
