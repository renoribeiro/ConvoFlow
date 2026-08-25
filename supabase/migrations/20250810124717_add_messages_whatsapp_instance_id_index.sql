-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250810124717`) sem nenhum arquivo local.
-- Extraída de pg_indexes em 2026-08-24. NÃO é o texto original.
-- Idempotente: já está aplicada, rodar de novo é no-op.
--
-- Índice simples por instância. Não confunda com
-- `idx_messages_instance_created_at (whatsapp_instance_id, created_at DESC)`,
-- que é outro índice e continua existindo em paralelo.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_instance_id
  ON public.messages USING btree (whatsapp_instance_id);
