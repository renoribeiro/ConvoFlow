-- Add randomization fields to mass_message_campaigns table
-- This migration adds support for:
-- 1. Random delay between messages (min/max seconds)
-- 2. Multiple message templates for randomization
-- 3. Flag to enable message randomization

ALTER TABLE public.mass_message_campaigns 
ADD COLUMN IF NOT EXISTS min_delay_seconds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_delay_seconds INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS message_templates JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS enable_message_randomization BOOLEAN DEFAULT false;

-- Add constraints to ensure valid delay ranges
ALTER TABLE public.mass_message_campaigns 
ADD CONSTRAINT check_min_delay_non_negative CHECK (min_delay_seconds >= 0),
ADD CONSTRAINT check_max_delay_non_negative CHECK (max_delay_seconds >= 0),
ADD CONSTRAINT check_delay_range CHECK (max_delay_seconds >= min_delay_seconds);

-- Add comment to explain the new fields
COMMENT ON COLUMN public.mass_message_campaigns.min_delay_seconds IS 'Minimum delay in seconds between messages (0-15 seconds recommended for Evolution API v2)';
COMMENT ON COLUMN public.mass_message_campaigns.max_delay_seconds IS 'Maximum delay in seconds between messages (0-15 seconds recommended for Evolution API v2)';
COMMENT ON COLUMN public.mass_message_campaigns.message_templates IS 'Array of message templates for randomization. When enable_message_randomization is true, messages will be randomly selected from this array';
COMMENT ON COLUMN public.mass_message_campaigns.enable_message_randomization IS 'When true, randomly selects messages from message_templates array instead of using message_template';

-- Update existing campaigns to have default randomization settings
UPDATE public.mass_message_campaigns 
SET 
  min_delay_seconds = 0,
  max_delay_seconds = 15,
  message_templates = CASE 
    WHEN message_template IS NOT NULL AND message_template != '' 
    THEN jsonb_build_array(message_template)
    ELSE '[]'::jsonb
  END,
  enable_message_randomization = false
WHERE min_delay_seconds IS NULL;

-- Create index for better performance on randomization queries
CREATE INDEX IF NOT EXISTS idx_campaigns_randomization 
ON public.mass_message_campaigns(enable_message_randomization, tenant_id) 
WHERE enable_message_randomization = true;