-- Criar tabela para logs de webhook
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB,
    destination TEXT,
    sender TEXT,
    server_url TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar tabela para erros de webhook
CREATE TABLE IF NOT EXISTS public.webhook_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_instance_name ON public.webhook_logs(instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON public.webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_errors_instance_name ON public.webhook_errors(instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_event_type ON public.webhook_errors(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_created_at ON public.webhook_errors(created_at);

-- Habilitar RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_errors ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para webhook_logs
CREATE POLICY "webhook_logs_select_policy" ON public.webhook_logs
    FOR SELECT USING (true);

CREATE POLICY "webhook_logs_insert_policy" ON public.webhook_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "webhook_logs_update_policy" ON public.webhook_logs
    FOR UPDATE USING (true);

CREATE POLICY "webhook_logs_delete_policy" ON public.webhook_logs
    FOR DELETE USING (true);

-- Políticas de RLS para webhook_errors
CREATE POLICY "webhook_errors_select_policy" ON public.webhook_errors
    FOR SELECT USING (true);

CREATE POLICY "webhook_errors_insert_policy" ON public.webhook_errors
    FOR INSERT WITH CHECK (true);

CREATE POLICY "webhook_errors_update_policy" ON public.webhook_errors
    FOR UPDATE USING (true);

CREATE POLICY "webhook_errors_delete_policy" ON public.webhook_errors
    FOR DELETE USING (true);

-- Conceder permissões
GRANT ALL PRIVILEGES ON public.webhook_logs TO anon;
GRANT ALL PRIVILEGES ON public.webhook_logs TO authenticated;
GRANT ALL PRIVILEGES ON public.webhook_errors TO anon;
GRANT ALL PRIVILEGES ON public.webhook_errors TO authenticated;

-- Comentários para documentação
COMMENT ON TABLE public.webhook_logs IS 'Logs de eventos de webhook da Evolution API';
COMMENT ON TABLE public.webhook_errors IS 'Erros ocorridos durante processamento de webhooks';

COMMENT ON COLUMN public.webhook_logs.instance_name IS 'Nome da instância do WhatsApp';
COMMENT ON COLUMN public.webhook_logs.event_type IS 'Tipo do evento (messages.upsert, connection.update, etc.)';
COMMENT ON COLUMN public.webhook_logs.event_data IS 'Dados completos do evento em formato JSON';
COMMENT ON COLUMN public.webhook_logs.processed_at IS 'Timestamp de quando o evento foi processado';

COMMENT ON COLUMN public.webhook_errors.error_message IS 'Mensagem de erro';
COMMENT ON COLUMN public.webhook_errors.error_stack IS 'Stack trace do erro para debugging';