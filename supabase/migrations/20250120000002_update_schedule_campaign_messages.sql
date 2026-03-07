-- Update schedule_campaign_messages function to support randomization
-- This function now supports:
-- 1. Random delay between messages using min_delay_seconds and max_delay_seconds
-- 2. Multiple message templates with randomization
-- 3. Better Evolution API v2 compliance

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
  random_delay INTEGER;
  scheduled_count INTEGER := 0;
  execution_time TIMESTAMP WITH TIME ZONE;
  selected_message TEXT;
  message_templates_array JSONB;
  template_count INTEGER;
  random_index INTEGER;
BEGIN
  -- Get campaign details with new randomization fields
  SELECT 
    c.*,
    COALESCE(c.min_delay_seconds, 0) as min_delay,
    COALESCE(c.max_delay_seconds, 15) as max_delay,
    COALESCE(c.message_templates, '[]'::jsonb) as templates,
    COALESCE(c.enable_message_randomization, false) as use_randomization
  INTO campaign_record
  FROM public.mass_message_campaigns c
  WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Validate message templates if randomization is enabled
  IF campaign_record.use_randomization THEN
    template_count := jsonb_array_length(campaign_record.templates);
    IF template_count = 0 THEN
      RAISE EXCEPTION 'Message randomization is enabled but no message templates provided';
    END IF;
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
    -- Generate random delay between min and max (0-15 seconds for Evolution API v2)
    IF campaign_record.max_delay > campaign_record.min_delay THEN
      random_delay := campaign_record.min_delay + floor(random() * (campaign_record.max_delay - campaign_record.min_delay + 1))::integer;
    ELSE
      random_delay := campaign_record.min_delay;
    END IF;
    
    -- Calculate execution time with base delay + random delay
    execution_time := COALESCE(campaign_record.scheduled_at, now()) + 
                     (delay_seconds * interval '1 second') + 
                     (random_delay * interval '1 second');
    
    -- Select message template
    IF campaign_record.use_randomization AND template_count > 0 THEN
      -- Randomly select a message from templates array
      random_index := floor(random() * template_count)::integer;
      selected_message := campaign_record.templates->random_index->>'text';
      
      -- Fallback to first template if extraction fails
      IF selected_message IS NULL OR selected_message = '' THEN
        selected_message := campaign_record.templates->0->>'text';
      END IF;
      
      -- Final fallback to message_template
      IF selected_message IS NULL OR selected_message = '' THEN
        selected_message := campaign_record.message_template;
      END IF;
    ELSE
      -- Use default message template
      selected_message := campaign_record.message_template;
    END IF;
    
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
      selected_message,
      execution_time
    );

    -- Enqueue job for this message with randomized timing
    PERFORM public.enqueue_job(
      campaign_record.tenant_id,
      'campaign_message',
      jsonb_build_object(
        'campaignId', p_campaign_id,
        'contactId', contact_record.id,
        'messageText', selected_message,
        'instanceName', (
          SELECT instance_key 
          FROM public.whatsapp_instances 
          WHERE id = campaign_record.whatsapp_instance_id
        ),
        'useRandomization', campaign_record.use_randomization,
        'messageTemplates', campaign_record.templates,
        'randomDelay', random_delay
      ),
      1, -- High priority for campaigns
      execution_time
    );

    scheduled_count := scheduled_count + 1;
    
    -- Increment base delay using the original delay_between_messages
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

-- Add comment explaining the updated function
COMMENT ON FUNCTION public.schedule_campaign_messages(uuid) IS 
'Updated function to support Evolution API v2 best practices with random delays (0-15 seconds) and message template randomization to reduce blocking risks';