-- Adicionar colunas de métricas de performance às tabelas de webhook

-- Atualizar tabela webhook_logs
ALTER TABLE webhook_logs 
ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS memory_usage JSONB;

-- Atualizar tabela webhook_errors
ALTER TABLE webhook_errors 
ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS memory_usage JSONB,
ADD COLUMN IF NOT EXISTS error_context JSONB,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Adicionar comentários para documentação
COMMENT ON COLUMN webhook_logs.processing_time_ms IS 'Tempo de processamento do evento em milissegundos';
COMMENT ON COLUMN webhook_logs.memory_usage IS 'Informações de uso de memória durante o processamento';
COMMENT ON COLUMN webhook_errors.processing_time_ms IS 'Tempo de processamento antes do erro em milissegundos';
COMMENT ON COLUMN webhook_errors.memory_usage IS 'Informações de uso de memória durante o processamento';
COMMENT ON COLUMN webhook_errors.error_context IS 'Contexto adicional do erro (circuit breaker state, etc.)';
COMMENT ON COLUMN webhook_errors.retry_count IS 'Número de tentativas de retry antes do erro final';

-- Criar índices para melhor performance de consultas
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processing_time ON webhook_logs(processing_time_ms);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type_instance ON webhook_logs(event_type, instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_event_type_instance ON webhook_errors(event_type, instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_retry_count ON webhook_errors(retry_count);

-- Adicionar política RLS para permitir acesso aos usuários autenticados
GRANT SELECT, INSERT, UPDATE ON webhook_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON webhook_errors TO authenticated;

-- Permitir acesso anônimo apenas para inserção (webhooks externos)
GRANT INSERT ON webhook_logs TO anon;
GRANT INSERT ON webhook_errors TO anon;