-- Fix search path for security compliance
CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_tenant_id uuid,
  p_job_type text,
  p_job_data jsonb DEFAULT '{}',
  p_priority integer DEFAULT 0,
  p_scheduled_at timestamp with time zone DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_id uuid;
BEGIN
  INSERT INTO public.job_queue (
    tenant_id,
    job_type,
    job_data,
    priority,
    scheduled_at
  ) VALUES (
    p_tenant_id,
    p_job_type,
    p_job_data,
    p_priority,
    p_scheduled_at
  ) RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dequeue_next_job(
  p_job_types text[] DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  job_type text,
  job_data jsonb,
  current_attempts integer
)
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Find and lock the next job to process
  SELECT jq.id, jq.tenant_id, jq.job_type, jq.job_data, jq.current_attempts
  INTO job_record
  FROM public.job_queue jq
  WHERE jq.status = 'pending'
    AND jq.scheduled_at <= now()
    AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
  ORDER BY jq.priority DESC, jq.scheduled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job_record.id IS NOT NULL THEN
    -- Mark job as processing
    UPDATE public.job_queue 
    SET 
      status = 'processing',
      started_at = now(),
      current_attempts = current_attempts + 1,
      updated_at = now()
    WHERE public.job_queue.id = job_record.id;
    
    -- Return job details
    RETURN QUERY SELECT 
      job_record.id,
      job_record.tenant_id,
      job_record.job_type,
      job_record.job_data,
      job_record.current_attempts;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id uuid,
  p_success boolean DEFAULT TRUE,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.job_queue 
    SET 
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.job_queue 
    SET 
      status = CASE 
        WHEN current_attempts >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      failed_at = CASE 
        WHEN current_attempts >= max_attempts THEN now()
        ELSE NULL
      END,
      error_message = p_error_message,
      updated_at = now(),
      scheduled_at = CASE 
        WHEN current_attempts < max_attempts THEN now() + interval '5 minutes'
        ELSE scheduled_at
      END
    WHERE id = p_job_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_evolution_webhook(
  instance_name text,
  event_type text,
  event_data jsonb
) RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Update instance status based on webhook events
  IF event_type = 'connection.update' THEN
    UPDATE public.whatsapp_instances 
    SET 
      status = COALESCE(event_data->>'state', status),
      qr_code = CASE 
        WHEN event_data->>'qr' IS NOT NULL THEN event_data->>'qr'
        WHEN event_data->>'state' = 'open' THEN NULL
        ELSE qr_code
      END,
      last_connected_at = CASE 
        WHEN event_data->>'state' = 'open' THEN now()
        ELSE last_connected_at
      END,
      profile_name = COALESCE(event_data->>'profileName', profile_name),
      profile_picture_url = COALESCE(event_data->>'profilePicUrl', profile_picture_url)
    WHERE instance_key = instance_name;
  END IF;

  -- Handle QR code updates
  IF event_type = 'qrcode.updated' THEN
    UPDATE public.whatsapp_instances 
    SET 
      qr_code = event_data->>'qr',
      status = 'qrcode'
    WHERE instance_key = instance_name;
  END IF;

  -- Log the webhook event for debugging
  INSERT INTO public.messages (
    contact_id, 
    tenant_id, 
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) SELECT 
    NULL,
    wi.tenant_id,
    wi.id,
    'system',
    'webhook',
    format('Webhook %s: %s', event_type, event_data::text),
    concat('webhook_', extract(epoch from now())),
    'received'
  FROM public.whatsapp_instances wi 
  WHERE wi.instance_key = instance_name;
END;
$$;