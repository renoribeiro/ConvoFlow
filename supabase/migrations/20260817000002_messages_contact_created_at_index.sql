-- =============================================================================
-- Desnormaliza a última mensagem na linha da conversa (2/5 — índice)
--
-- `messages` tinha idx_messages_contact_id e idx_messages_created_at
-- SEPARADOS. Toda busca de "última mensagem deste contato" varria o índice de
-- contact_id e ordenava depois. O índice composto resolve a ordenação dentro do
-- próprio índice.
--
-- Serve para duas coisas:
--   1. o backfill (migração 4/5), que faz esse acesso uma vez por conversa;
--   2. qualquer consulta remanescente por contato ordenada no tempo — inclusive
--      a paginação de mensagens do chat (useMessages), que faz exatamente
--      `contact_id = ? ORDER BY created_at DESC`.
--
-- Nota para bases grandes: aqui vai sem CONCURRENTLY porque o script de
-- aplicação é transacional e a tabela é pequena. Em uma base com milhões de
-- mensagens, criar com CREATE INDEX CONCURRENTLY fora de transação.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_contact_created_at
  ON public.messages (contact_id, created_at DESC);

COMMENT ON INDEX public.idx_messages_contact_created_at IS
  'Última mensagem de um contato sem sort: (contact_id, created_at DESC). Usado pelo backfill da desnormalização e pela paginação de mensagens do chat.';
