-- Campaigns upgrade (fix): guard against double-dispatch.
-- schedule_campaign_messages materializes recipients + flips status to active. Calling it again
-- on an already-running/finished campaign (e.g. user double-clicks "Confirmar e Disparar")
-- re-materialized pending executions and sent duplicates. Only allow it from draft/scheduled.

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

  v_caller_tenant := public.get_current_user_tenant_id();
  IF NOT public.is_super_admin()
     AND (v_caller_tenant IS NULL OR v_caller_tenant <> c.tenant_id) THEN
    RAISE EXCEPTION 'Not authorized for this campaign';
  END IF;

  -- Guard: a campaign can only be dispatched from draft/scheduled. Re-dispatching an
  -- active/paused/completed/cancelled campaign would duplicate sends.
  IF c.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campanha "%" já foi disparada (status: %). Duplique-a para enviar novamente.', c.name, c.status;
  END IF;

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
