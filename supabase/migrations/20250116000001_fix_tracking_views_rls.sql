-- Fix access to tracking materialized views by creating filtered views
-- Since materialized views don't support RLS, we create regular views with tenant filtering

-- Create a filtered view for tracking_metrics_daily
CREATE OR REPLACE VIEW tracking_metrics_daily_filtered AS
SELECT *
FROM tracking_metrics_daily
WHERE tenant_id = public.get_current_user_tenant_id();

-- Create a filtered view for campaign_performance_daily
CREATE OR REPLACE VIEW campaign_performance_daily_filtered AS
SELECT *
FROM campaign_performance_daily
WHERE tenant_id = public.get_current_user_tenant_id();

-- Grant permissions on the new filtered views
GRANT SELECT ON tracking_metrics_daily_filtered TO anon, authenticated;
GRANT SELECT ON campaign_performance_daily_filtered TO anon, authenticated;

-- Add comments for documentation
COMMENT ON VIEW tracking_metrics_daily_filtered IS 'Filtered view of tracking_metrics_daily that automatically applies tenant filtering';
COMMENT ON VIEW campaign_performance_daily_filtered IS 'Filtered view of campaign_performance_daily that automatically applies tenant filtering';