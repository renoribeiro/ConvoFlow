-- Migration to add multi-provider support (Waha Integration)

-- 1. Create provider enum type if not exists (or just use text constraint for simplicity and flexibility)
-- We will use a text check constraint for now to avoid enum complexity with existing types

-- 2. Add columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'evolution' CHECK (provider IN ('evolution', 'waha')),
ADD COLUMN IF NOT EXISTS connection_config JSONB DEFAULT '{}'::jsonb;

-- 3. Comment on columns
COMMENT ON COLUMN public.whatsapp_instances.provider IS 'Provider of the WhatsApp API (evolution, waha)';
COMMENT ON COLUMN public.whatsapp_instances.connection_config IS 'JSON configuration specific to the provider (baseUrl, apiKey, etc)';

-- 4. Create an index on provider for filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_provider ON public.whatsapp_instances(provider);

-- 5. Data Migration (Optional but recommended for consistency)
-- Move existing evolution credentials to connection_config for rows where it's empty
UPDATE public.whatsapp_instances
SET connection_config = jsonb_build_object(
    'baseUrl', evolution_api_url,
    'apiKey', evolution_api_key
)
WHERE provider = 'evolution' 
  AND (connection_config IS NULL OR connection_config = '{}'::jsonb)
  AND evolution_api_url IS NOT NULL;
