-- Campaigns upgrade (Phase 5): dispatch-tick housekeeping RPC.
-- Called at the top of every process-campaign-dispatch run (service role):
--  1. promote scheduled campaigns whose time has come to 'active';
--  2. reclaim executions stuck in 'processing' from a crashed/timed-out run.

CREATE OR REPLACE FUNCTION public.promote_scheduled_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.mass_message_campaigns
     SET status = 'active',
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE status = 'scheduled'
     AND scheduled_at <= now()
     AND paused_at IS NULL
     AND cancelled_at IS NULL;

  -- A processing row whose lock is older than 5 minutes belongs to a run that
  -- never finished; a healthy run completes a row within seconds. Reclaim it.
  UPDATE public.campaign_executions
     SET status = 'pending',
         updated_at = now()
   WHERE status = 'processing'
     AND updated_at < now() - interval '5 minutes';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_scheduled_campaigns() FROM anon, authenticated;
