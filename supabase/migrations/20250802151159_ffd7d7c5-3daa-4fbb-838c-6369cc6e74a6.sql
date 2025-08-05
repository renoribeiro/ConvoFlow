-- Create webhook handler for incoming WhatsApp messages and chatbot processing
CREATE OR REPLACE FUNCTION public.process_incoming_message(
  p_phone text,
  p_message_content text,
  p_whatsapp_instance_id uuid,
  p_evolution_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact_id uuid;
  v_tenant_id uuid;
  v_message_id uuid;
  v_chatbot chatbots%ROWTYPE;
  v_response_data jsonb;
  v_job_id uuid;
BEGIN
  -- Get tenant_id from whatsapp instance
  SELECT tenant_id INTO v_tenant_id
  FROM public.whatsapp_instances 
  WHERE id = p_whatsapp_instance_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp instance not found';
  END IF;

  -- Find or create contact
  SELECT id INTO v_contact_id
  FROM public.contacts 
  WHERE phone = p_phone AND tenant_id = v_tenant_id;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (tenant_id, phone, whatsapp_instance_id, first_message, last_interaction_at)
    VALUES (v_tenant_id, p_phone, p_whatsapp_instance_id, p_message_content, now())
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts 
    SET last_interaction_at = now()
    WHERE id = v_contact_id;
  END IF;

  -- Save incoming message
  INSERT INTO public.messages (
    contact_id,
    tenant_id,
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) VALUES (
    v_contact_id,
    v_tenant_id,
    p_whatsapp_instance_id,
    'inbound',
    'text',
    p_message_content,
    p_evolution_message_id,
    'received'
  ) RETURNING id INTO v_message_id;

  -- Find matching chatbot
  SELECT * INTO v_chatbot
  FROM public.chatbots
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND (whatsapp_instance_id IS NULL OR whatsapp_instance_id = p_whatsapp_instance_id)
    AND (
      trigger_type = 'all' OR
      (trigger_type = 'keyword' AND p_message_content ILIKE ANY(trigger_phrases))
    )
  ORDER BY 
    CASE WHEN whatsapp_instance_id = p_whatsapp_instance_id THEN 1 ELSE 2 END,
    priority DESC
  LIMIT 1;

  -- If chatbot found, enqueue response
  IF v_chatbot.id IS NOT NULL THEN
    SELECT public.enqueue_job(
      v_tenant_id,
      'chatbot_response',
      jsonb_build_object(
        'chatbotId', v_chatbot.id,
        'contactId', v_contact_id,
        'incomingMessage', p_message_content,
        'instanceName', (
          SELECT instance_key 
          FROM public.whatsapp_instances 
          WHERE id = p_whatsapp_instance_id
        )
      ),
      2 -- High priority for chatbot responses
    ) INTO v_job_id;

    v_response_data := jsonb_build_object(
      'matched', true,
      'chatbot_id', v_chatbot.id,
      'chatbot_name', v_chatbot.name,
      'job_id', v_job_id
    );
  ELSE
    v_response_data := jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'message_id', v_message_id,
    'chatbot_response', v_response_data
  );
END;
$function$;

-- Create function to process variables in chatbot messages
CREATE OR REPLACE FUNCTION public.process_chatbot_variables(
  p_message_template text,
  p_contact_id uuid,
  p_incoming_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact contacts%ROWTYPE;
  v_processed_message text;
BEGIN
  -- Get contact data
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;

  v_processed_message := p_message_template;

  -- Replace contact variables
  v_processed_message := REPLACE(v_processed_message, '{name}', COALESCE(v_contact.name, 'there'));
  v_processed_message := REPLACE(v_processed_message, '{phone}', v_contact.phone);
  v_processed_message := REPLACE(v_processed_message, '{first_name}', SPLIT_PART(COALESCE(v_contact.name, ''), ' ', 1));
  
  -- Replace message variables
  v_processed_message := REPLACE(v_processed_message, '{incoming_message}', COALESCE(p_incoming_message, ''));
  
  -- Replace time variables
  v_processed_message := REPLACE(v_processed_message, '{time}', TO_CHAR(now(), 'HH24:MI'));
  v_processed_message := REPLACE(v_processed_message, '{date}', TO_CHAR(now(), 'DD/MM/YYYY'));
  v_processed_message := REPLACE(v_processed_message, '{datetime}', TO_CHAR(now(), 'DD/MM/YYYY HH24:MI'));

  RETURN v_processed_message;
END;
$function$;