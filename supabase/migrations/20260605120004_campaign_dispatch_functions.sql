-- Campaigns upgrade (Phase 3/5): self-contained dispatch model.
-- Campaigns no longer enqueue into the generic job_queue (which the worker never drained for
-- campaign_message). Instead schedule_campaign_messages materializes campaign_executions (pending)
-- and the process-campaign-dispatch edge function drains them directly.

-- Recompute aggregate metrics for a campaign from its executions (idempotent upsert).
CREATE OR REPLACE FUNCTION public.recompute_campaign_metrics(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant uuid;
  v_total int; v_sent int; v_delivered int; v_read int; v_replied int; v_failed int; v_pending int;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.mass_message_campaigns WHERE id = p_campaign_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status IN ('sent','delivered','read','replied')),
    count(*) FILTER (WHERE status IN ('delivered','read','replied') OR delivered_at IS NOT NULL),
    count(*) FILTER (WHERE status IN ('read','replied') OR read_at IS NOT NULL),
    count(*) FILTER (WHERE status = 'replied' OR replied_at IS NOT NULL),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status IN ('pending','processing'))
  INTO v_total, v_sent, v_delivered, v_read, v_replied, v_failed, v_pending
  FROM public.campaign_executions
  WHERE campaign_id = p_campaign_id;

  INSERT INTO public.campaign_metrics AS m (
    campaign_id, tenant_id, total_contacts, total_sent, total_delivered, total_read,
    total_replied, total_failed, total_pending,
    delivery_rate, read_rate, reply_rate, conversion_rate, updated_at)
  VALUES (
    p_campaign_id, v_tenant, v_total, v_sent, v_delivered, v_read,
    v_replied, v_failed, v_pending,
    CASE WHEN v_sent > 0 THEN round(v_delivered::numeric * 100 / v_sent, 2) ELSE 0 END,
    CASE WHEN v_sent > 0 THEN round(v_read::numeric * 100 / v_sent, 2) ELSE 0 END,
    CASE WHEN v_sent > 0 THEN round(v_replied::numeric * 100 / v_sent, 2) ELSE 0 END,
    CASE WHEN v_total > 0 THEN round(v_replied::numeric * 100 / v_total, 2) ELSE 0 END,
    now())
  ON CONFLICT (campaign_id) DO UPDATE SET
    total_contacts = excluded.total_contacts,
    total_sent = excluded.total_sent,
    total_delivered = excluded.total_delivered,
    total_read = excluded.total_read,
    total_replied = excluded.total_replied,
    total_failed = excluded.total_failed,
    total_pending = excluded.total_pending,
    delivery_rate = excluded.delivery_rate,
    read_rate = excluded.read_rate,
    reply_rate = excluded.reply_rate,
    conversion_rate = excluded.conversion_rate,
    updated_at = now();

  UPDATE public.mass_message_campaigns
     SET sent_count = v_sent,
         failed_count = v_failed,
         delivered_count = v_delivered,
         read_count = v_read,
         replied_count = v_replied,
         total_recipients = v_total,
         updated_at = now()
   WHERE id = p_campaign_id;
END;
$$;

-- Materialize the recipient list into campaign_executions and move the campaign into its
-- sending lifecycle. Enforces tenant ownership (was anon-executable before).
CREATE OR REPLACE FUNCTION public.schedule_campaign_messages(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c RECORD;
  v_caller_tenant uuid;
  rec RECORD;
  v_item jsonb;
  v_count int := 0;
  v_base timestamptz;
  v_step int;
  v_exec_time timestamptz;
BEGIN
  SELECT * INTO c FROM public.mass_message_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Authorization: only the owning tenant (or a super admin) may dispatch this campaign.
  v_caller_tenant := public.get_current_user_tenant_id();
  IF NOT public.is_super_admin()
     AND (v_caller_tenant IS NULL OR v_caller_tenant <> c.tenant_id) THEN
    RAISE EXCEPTION 'Not authorized for this campaign';
  END IF;

  -- Re-schedule safety: drop any previous still-pending executions.
  DELETE FROM public.campaign_executions
   WHERE campaign_id = p_campaign_id AND status = 'pending';

  v_base := COALESCE(c.scheduled_at, now());
  v_step := GREATEST(COALESCE(c.delay_between_messages, 5), 1);

  IF c.audience_type = 'csv_import' THEN
    FOR v_item IN
      SELECT * FROM jsonb_array_elements(COALESCE(c.audience_config -> 'contacts', '[]'::jsonb))
    LOOP
      IF COALESCE(v_item ->> 'phone', '') = '' THEN CONTINUE; END IF;
      v_exec_time := v_base + (v_count * v_step) * interval '1 second';
      INSERT INTO public.campaign_executions
        (campaign_id, tenant_id, contact_id, contact_identifier, contact_name, message_text, status, scheduled_at)
      VALUES
        (p_campaign_id, c.tenant_id, NULL, v_item ->> 'phone', v_item ->> 'name',
         c.message_template, 'pending', v_exec_time);
      v_count := v_count + 1;
    END LOOP;
  ELSE
    FOR rec IN
      SELECT ct.id, ct.phone, ct.name, ct.email
      FROM public.contacts ct
      WHERE ct.tenant_id = c.tenant_id
        AND ct.is_blocked = false
        AND ct.opt_out_mass_message = false
        AND ct.phone IS NOT NULL
        AND (
          (c.audience_type = 'contact_list'
            AND ct.id IN (
              SELECT (jsonb_array_elements_text(COALESCE(c.audience_config -> 'contact_ids', '[]'::jsonb)))::uuid
            ))
          OR
          (c.audience_type = 'tags'
            AND (array_length(c.target_stages, 1) IS NULL OR ct.current_stage_id = ANY (c.target_stages))
            AND (array_length(c.target_tags, 1) IS NULL OR EXISTS (
              SELECT 1 FROM public.contact_tags x
              WHERE x.contact_id = ct.id AND x.tag_id = ANY (c.target_tags)
            )))
        )
    LOOP
      v_exec_time := v_base + (v_count * v_step) * interval '1 second';
      INSERT INTO public.campaign_executions
        (campaign_id, tenant_id, contact_id, contact_identifier, contact_name, message_text, status, scheduled_at)
      VALUES
        (p_campaign_id, c.tenant_id, rec.id, rec.phone, rec.name,
         c.message_template, 'pending', v_exec_time);
      v_count := v_count + 1;
    END LOOP;
  END IF;

  UPDATE public.mass_message_campaigns
     SET status = CASE WHEN c.scheduled_at IS NULL OR c.scheduled_at <= now() THEN 'active' ELSE 'scheduled' END,
         total_recipients = v_count,
         paused_at = NULL,
         cancelled_at = NULL,
         started_at = COALESCE(started_at,
           CASE WHEN c.scheduled_at IS NULL OR c.scheduled_at <= now() THEN now() ELSE NULL END),
         updated_at = now()
   WHERE id = p_campaign_id;

  PERFORM public.recompute_campaign_metrics(p_campaign_id);
  RETURN v_count;
END;
$$;

-- Lifecycle controls (tenant-checked) used by the UI action buttons.
CREATE OR REPLACE FUNCTION public.set_campaign_status(p_campaign_id uuid, p_action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c RECORD;
  v_caller_tenant uuid;
  v_new_status text;
BEGIN
  SELECT * INTO c FROM public.mass_message_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  v_caller_tenant := public.get_current_user_tenant_id();
  IF NOT public.is_super_admin()
     AND (v_caller_tenant IS NULL OR v_caller_tenant <> c.tenant_id) THEN
    RAISE EXCEPTION 'Not authorized for this campaign';
  END IF;

  IF p_action = 'pause' THEN
    v_new_status := 'paused';
    UPDATE public.mass_message_campaigns SET status = 'paused', paused_at = now(), updated_at = now()
      WHERE id = p_campaign_id;
  ELSIF p_action = 'resume' THEN
    v_new_status := 'active';
    UPDATE public.mass_message_campaigns SET status = 'active', paused_at = NULL, updated_at = now()
      WHERE id = p_campaign_id;
  ELSIF p_action = 'cancel' THEN
    v_new_status := 'cancelled';
    UPDATE public.mass_message_campaigns SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      WHERE id = p_campaign_id;
    UPDATE public.campaign_executions SET status = 'skipped'
      WHERE campaign_id = p_campaign_id AND status = 'pending';
  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  PERFORM public.recompute_campaign_metrics(p_campaign_id);
  RETURN v_new_status;
END;
$$;

-- Flip active campaigns to completed once nothing is left to send. Called by the dispatch cron.
CREATE OR REPLACE FUNCTION public.finalize_completed_campaigns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  r RECORD;
  v_done int := 0;
BEGIN
  FOR r IN
    SELECT mc.id
    FROM public.mass_message_campaigns mc
    WHERE mc.status IN ('active','scheduled')
      AND mc.started_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_executions e
        WHERE e.campaign_id = mc.id AND e.status IN ('pending','processing')
      )
      AND EXISTS (SELECT 1 FROM public.campaign_executions e WHERE e.campaign_id = mc.id)
  LOOP
    UPDATE public.mass_message_campaigns
       SET status = 'completed', completed_at = now(), updated_at = now()
     WHERE id = r.id;
    PERFORM public.recompute_campaign_metrics(r.id);
    v_done := v_done + 1;
  END LOOP;
  RETURN v_done;
END;
$$;
