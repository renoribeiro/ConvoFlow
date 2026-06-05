-- Campaigns upgrade (Phase 3): extend existing broadcast schema in place.
-- The real broadcast table is mass_message_campaigns; per-recipient tracking is campaign_executions.
-- We extend them rather than introduce parallel tables, preserving tenant RLS.

-- 1. mass_message_campaigns: message type / media / audience / dispatch settings / counters
ALTER TABLE public.mass_message_campaigns
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_caption text,
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'tags',
  ADD COLUMN IF NOT EXISTS audience_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS min_delay_seconds integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_delay_seconds integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS message_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS enable_message_randomization boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS respect_business_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_hours_start time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS business_hours_end time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS daily_send_limit integer,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replied_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mmc_message_type_chk') THEN
    ALTER TABLE public.mass_message_campaigns
      ADD CONSTRAINT mmc_message_type_chk CHECK (message_type IN ('text','image','video','document','audio'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mmc_audience_type_chk') THEN
    ALTER TABLE public.mass_message_campaigns
      ADD CONSTRAINT mmc_audience_type_chk CHECK (audience_type IN ('csv_import','tags','contact_list'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mmc_status_chk') THEN
    ALTER TABLE public.mass_message_campaigns
      ADD CONSTRAINT mmc_status_chk CHECK (status IN ('draft','scheduled','active','paused','completed','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mmc_delay_chk') THEN
    ALTER TABLE public.mass_message_campaigns
      ADD CONSTRAINT mmc_delay_chk CHECK (min_delay_seconds >= 0 AND max_delay_seconds >= min_delay_seconds);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mmc_created_by_fk') THEN
    ALTER TABLE public.mass_message_campaigns
      ADD CONSTRAINT mmc_created_by_fk FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. campaign_executions: richer per-recipient tracking + CSV recipients without a contact row
ALTER TABLE public.campaign_executions
  ADD COLUMN IF NOT EXISTS contact_identifier text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

-- CSV-imported recipients may not map to a contacts row.
ALTER TABLE public.campaign_executions ALTER COLUMN contact_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_exec_status_chk') THEN
    ALTER TABLE public.campaign_executions
      ADD CONSTRAINT campaign_exec_status_chk
      CHECK (status IN ('pending','processing','sent','delivered','read','replied','failed','skipped'));
  END IF;
END $$;

-- 3. Dispatch / lookup indexes
CREATE INDEX IF NOT EXISTS idx_campaign_exec_dispatch
  ON public.campaign_executions (campaign_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_campaign_exec_provider_msg
  ON public.campaign_executions (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mmc_status_scheduled
  ON public.mass_message_campaigns (status, scheduled_at);
