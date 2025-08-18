-- ==========================================
-- Migration: Adicionar índice único para evolution_message_id
-- Objetivo: Garantir idempotência no processamento de webhooks
-- ==========================================

-- Criar índice único parcial para evolution_message_id (apenas quando não for NULL)
-- Isso previne mensagens duplicadas da Evolution API
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_evolution_message_id_unique 
ON public.messages (evolution_message_id) 
WHERE evolution_message_id IS NOT NULL;

-- Comentário para documentação
COMMENT ON INDEX idx_messages_evolution_message_id_unique IS 
'Índice único para evolution_message_id garantindo idempotência no processamento de webhooks da Evolution API';