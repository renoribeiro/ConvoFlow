-- Follow-up upgrade — Fase 2: cron de disparo do motor de follow-up.
-- Mesmo padrão de process-campaign-dispatch: pg_net chama a edge function a cada
-- minuto com bearer anon; a função autentica internamente via service role.

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('process-followup-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL; -- ainda não agendado
END $$;

SELECT cron.schedule(
  'process-followup-dispatch-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/process-followup-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);
