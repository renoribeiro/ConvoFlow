-- =============================================================================
-- Agenda o webhook-dispatcher para rodar a cada minuto (pg_cron + pg_net)
-- =============================================================================
-- IMPORTANTE: troque <SUA_ANON_KEY> pela ANON public key do projeto
-- (Supabase → Project Settings → API → "anon public"). É a mesma chave usada
-- pelos outros cron jobs (process-campaign-dispatch, process-followup-dispatch).
-- A edge function autentica internamente via service_role; o bearer aqui é só
-- pra passar pelo gateway das Edge Functions.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('webhook-dispatcher-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'webhook-dispatcher-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/webhook-dispatcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SUA_ANON_KEY>"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);
