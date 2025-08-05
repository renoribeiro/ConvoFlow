-- Create function to increment campaign sent count
CREATE OR REPLACE FUNCTION public.increment_campaign_sent_count(
  p_campaign_id uuid
) RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.mass_message_campaigns 
  SET 
    sent_count = sent_count + 1,
    updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

-- Create function to schedule campaign messages
CREATE OR REPLACE FUNCTION public.schedule_campaign_messages(
  p_campaign_id uuid
) RETURNS integer
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  campaign_record RECORD;
  contact_record RECORD;
  message_text TEXT;
  delay_seconds INTEGER := 0;
  scheduled_count INTEGER := 0;
  execution_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get campaign details
  SELECT * INTO campaign_record
  FROM public.mass_message_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Get target contacts
  FOR contact_record IN
    SELECT c.id, c.phone, c.name
    FROM public.contacts c
    WHERE c.tenant_id = campaign_record.tenant_id
      AND c.is_blocked = FALSE
      AND c.opt_out_mass_message = FALSE
      AND (
        array_length(campaign_record.target_tags, 1) IS NULL OR
        EXISTS (
          SELECT 1 FROM public.contact_tags ct
          WHERE ct.contact_id = c.id
            AND ct.tag_id = ANY(campaign_record.target_tags)
        )
      )
      AND (
        array_length(campaign_record.target_stages, 1) IS NULL OR
        c.current_stage_id = ANY(campaign_record.target_stages)
      )
  LOOP
    -- Calculate execution time with delay
    execution_time := COALESCE(campaign_record.scheduled_at, now()) + (delay_seconds * interval '1 second');
    
    -- Create campaign execution record
    INSERT INTO public.campaign_executions (
      campaign_id,
      tenant_id,
      contact_id,
      message_text,
      scheduled_at
    ) VALUES (
      p_campaign_id,
      campaign_record.tenant_id,
      contact_record.id,
      campaign_record.message_template,
      execution_time
    );

    -- Enqueue job for this message
    PERFORM public.enqueue_job(
      campaign_record.tenant_id,
      'campaign_message',
      jsonb_build_object(
        'campaignId', p_campaign_id,
        'contactId', contact_record.id,
        'messageText', campaign_record.message_template,
        'instanceName', (
          SELECT instance_key 
          FROM public.whatsapp_instances 
          WHERE id = campaign_record.whatsapp_instance_id
        )
      ),
      1, -- High priority for campaigns
      execution_time
    );

    scheduled_count := scheduled_count + 1;
    delay_seconds := delay_seconds + COALESCE(campaign_record.delay_between_messages, 30);
  END LOOP;

  -- Update campaign status and counts
  UPDATE public.mass_message_campaigns
  SET 
    status = 'scheduled',
    total_recipients = scheduled_count,
    started_at = now(),
    updated_at = now()
  WHERE id = p_campaign_id;

  RETURN scheduled_count;
END;
$$;

-- Create function to schedule follow-up messages
CREATE OR REPLACE FUNCTION public.schedule_follow_up_message(
  p_contact_id uuid,
  p_sequence_id uuid,
  p_step_id uuid,
  p_delay_hours integer
) RETURNS uuid
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_id uuid;
  contact_record RECORD;
  sequence_record RECORD;
BEGIN
  -- Get contact and sequence info
  SELECT c.tenant_id, c.phone, c.name INTO contact_record
  FROM public.contacts c
  WHERE c.id = p_contact_id;

  SELECT s.whatsapp_instance_id INTO sequence_record
  FROM public.follow_up_sequences s
  WHERE s.id = p_sequence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact or sequence not found';
  END IF;

  -- Enqueue follow-up job
  SELECT public.enqueue_job(
    contact_record.tenant_id,
    'follow_up_message',
    jsonb_build_object(
      'sequenceId', p_sequence_id,
      'stepId', p_step_id,
      'contactId', p_contact_id,
      'instanceName', (
        SELECT instance_key 
        FROM public.whatsapp_instances 
        WHERE id = sequence_record.whatsapp_instance_id
      )
    ),
    0, -- Normal priority
    now() + (p_delay_hours * interval '1 hour')
  ) INTO job_id;

  RETURN job_id;
END;
$$;

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job worker to run every minute
SELECT cron.schedule(
  'job-worker-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/job-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) as request_id;
  $$
);