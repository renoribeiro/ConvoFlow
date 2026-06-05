-- Campaigns upgrade (Phase 3/5): repair scheduled dispatch infrastructure.
-- pg_net was missing, so the existing net.http_post-based cron silently failed every minute
-- (nothing was auto-dispatched: campaigns, follow-ups, chatbot queue). Enabling it repairs the
-- shared job-worker cron and lets us add a dedicated campaign dispatch cron.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Dedicated minute cron that drives the campaign dispatch engine.
DO $$
BEGIN
  PERFORM cron.unschedule('process-campaign-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'process-campaign-dispatch-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/process-campaign-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);
