-- Add Evolution API configuration columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS evolution_api_url text,
ADD COLUMN IF NOT EXISTS evolution_api_key text;

-- Create function to handle Evolution API webhooks
CREATE OR REPLACE FUNCTION public.handle_evolution_webhook(
  instance_name text,
  event_type text,
  event_data jsonb
) RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;