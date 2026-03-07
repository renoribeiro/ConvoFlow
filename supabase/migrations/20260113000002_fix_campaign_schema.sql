-- Fix Campaign Schema and Columns
-- Ensures compatibility between Frontend, Database Table, and Stored Procedures

BEGIN;

-- 1. Ensure target_tags is UUID[] (Array of UUIDs)
-- If it's JSONB, we convert it to UUID[]
ALTER TABLE public.mass_message_campaigns 
ALTER COLUMN target_tags DROP DEFAULT;

ALTER TABLE public.mass_message_campaigns 
ALTER COLUMN target_tags TYPE UUID[] USING (
    CASE 
        WHEN target_tags IS NULL THEN '{}'::UUID[]
        -- Handle JSONB conversion if necessary (complex, assuming empty if jsonb for safety or straight cast if possible)
        -- Ideally we assume it's either already array or compatible
        ELSE target_tags::text::UUID[] 
    END
);

ALTER TABLE public.mass_message_campaigns 
ALTER COLUMN target_tags SET DEFAULT '{}'::UUID[];

-- 2. Ensure target_stages exists and is UUID[]
-- Add column if not exists
ADD COLUMN IF NOT EXISTS target_stages UUID[] DEFAULT '{}'::UUID[];

-- If exists but wrong type, convert
ALTER TABLE public.mass_message_campaigns 
ALTER COLUMN target_stages TYPE UUID[] USING (
    CASE 
        WHEN target_stages IS NULL THEN '{}'::UUID[]
        ELSE target_stages::text::UUID[] 
    END
);

ALTER TABLE public.mass_message_campaigns 
ALTER COLUMN target_stages SET DEFAULT '{}'::UUID[];

-- 3. Ensure other fields exist
ADD COLUMN IF NOT EXISTS min_delay_seconds INTEGER DEFAULT 0;
ADD COLUMN IF NOT EXISTS max_delay_seconds INTEGER DEFAULT 15;
ADD COLUMN IF NOT EXISTS message_templates JSONB DEFAULT '[]'::jsonb;
ADD COLUMN IF NOT EXISTS enable_message_randomization BOOLEAN DEFAULT false;

-- 4. Verify message_templates is JSONB (Frontend sends array of strings, which fits JSONB)
-- No action needed if already JSONB as per previous migration check.

COMMIT;
