-- Agendador de relatórios — cron de disparo do process-report-dispatch.
-- Mesmo padrão de process-campaign-dispatch / process-followup-dispatch: pg_net
-- chama a edge function com bearer anon; a função autentica internamente via
-- service role.
--
-- A cada 5 minutos (e não a cada minuto como os outros): relatório é uma entrega
-- de baixa frequência, e a função tolera tick perdido — ela decide o vencimento
-- por cron + last_run, com janela de recuperação de 60 minutos.

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('process-report-dispatch-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL; -- ainda não agendado
END $$;

SELECT cron.schedule(
  'process-report-dispatch-every-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/process-report-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);

-- Registro no ledger. O projeto aplica migração pelo SQL Editor — sem esta
-- linha, quem rodar este arquivo direto (em vez de docs/agendar_relatorios_cron.sql)
-- deixa a migração aplicada no banco e ausente do histórico. `statements` fica
-- NULL de propósito: a coluna é preenchida pela CLI quando é ela quem aplica.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260819000001', 'report_dispatch_cron')
ON CONFLICT (version) DO NOTHING;
