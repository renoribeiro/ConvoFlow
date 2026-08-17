-- =============================================================================
-- Desnormaliza a última mensagem na linha da conversa (1/5 — colunas)
--
-- Motivo: a lista de conversas disparava UMA query por conversa só para montar
-- a prévia. Com página de 20, eram 21 idas ao servidor por página — repetidas a
-- cada 10s pelo polling. Estas quatro colunas são exatamente (e somente) o que
-- a lista consome da última mensagem.
--
-- `messages.created_at` NÃO é copiado de propósito: a lista sempre usou
-- `conversations.last_message_at` para o horário; o created_at da mensagem era
-- buscado e descartado.
--
-- Todas as colunas são NULL-áveis de propósito. Conversa sem mensagem nenhuma
-- fica com as quatro em NULL, o front devolve `last_message` indefinido e o
-- `?? 'inbound'` da lista mantém a conversa no grupo "Aguardando" — exatamente
-- como era antes da desnormalização.
--
-- RLS: nenhuma política é alterada. As políticas de `conversations` valem por
-- linha (tenant_id), então colunas novas já nascem protegidas.
-- =============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_content   text NULL,
  ADD COLUMN IF NOT EXISTS last_message_direction text NULL,
  ADD COLUMN IF NOT EXISTS last_message_status    text NULL,
  ADD COLUMN IF NOT EXISTS last_message_type      text NULL;

-- `messages.direction` carrega 'incoming' como sinônimo histórico de 'inbound'
-- (a trigger sempre casou `IN ('inbound','incoming')`). No front a união é
-- 'inbound' | 'outbound' e TODO leitor testa `!== 'inbound'` — um 'incoming'
-- guardado aqui seria lido como mensagem nossa e a conversa sumiria da fila de
-- trabalho ("Aguardando" e sinalização de SLA). Esta coluna só aceita o
-- vocabulário normalizado; quem normaliza é a trigger (migração 3/5).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_last_message_direction_check'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_last_message_direction_check
      CHECK (
        last_message_direction IS NULL
        OR last_message_direction IN ('inbound', 'outbound')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.conversations.last_message_content IS
  'Conteúdo da última mensagem. Escrito por update_conversation_on_message no INSERT e ressincronizado por sync_conversation_last_message quando o status muda (caso da mensagem apagada). NULL = conversa sem mensagem, ou mensagem sem texto (mídia sem legenda). Só alimenta a prévia da lista.';
COMMENT ON COLUMN public.conversations.last_message_direction IS
  'Direção da última mensagem, já normalizada para ''inbound'' | ''outbound'' (o banco aceita ''incoming'' em messages.direction; aqui não). NULL = conversa sem mensagem, e o front trata isso como "Aguardando".';
COMMENT ON COLUMN public.conversations.last_message_status IS
  'Status da última mensagem (sent/delivered/read/...). Escrito por update_conversation_on_message no INSERT e mantido em dia por sync_conversation_last_message conforme o status evolui. Alimenta o ícone de confirmação na lista.';
COMMENT ON COLUMN public.conversations.last_message_type IS
  'Tipo da última mensagem (text/image/audio/...). Define o rótulo da prévia ("📷 Imagem", "🎤 Áudio", ...).';
