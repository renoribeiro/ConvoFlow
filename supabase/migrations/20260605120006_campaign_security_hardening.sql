-- Campaigns upgrade (Phase 3): security hardening for the campaign surface.

-- 1. schedule_campaign_messages was executable by the anon role: any unauthenticated client could
--    trigger a blast for any campaign_id. The function now enforces tenant ownership internally, but
--    we also revoke EXECUTE from anon. Internal/cron-only helpers are locked to definer/service_role.
REVOKE EXECUTE ON FUNCTION public.schedule_campaign_messages(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_campaign_sent_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_campaign_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_campaign_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_completed_campaigns() FROM anon, authenticated;

-- 2. Campaign performance aggregates were readable across tenants by anon/authenticated (no RLS on
--    (materialized) views). Reports now read RLS-protected tables instead, so close the exposure.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'campaign_performance_daily' AND c.relkind = 'm') THEN
    EXECUTE 'REVOKE SELECT ON public.campaign_performance_daily FROM anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'campaign_performance_daily_filtered' AND c.relkind = 'v') THEN
    EXECUTE 'REVOKE SELECT ON public.campaign_performance_daily_filtered FROM anon, authenticated';
  END IF;
END $$;
