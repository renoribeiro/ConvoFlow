-- Campaigns upgrade (Phase 3): campaign_metrics (real-time aggregates) + campaign_imports (CSV).

CREATE TABLE IF NOT EXISTS public.campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  total_contacts integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_delivered integer NOT NULL DEFAULT 0,
  total_read integer NOT NULL DEFAULT 0,
  total_replied integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  total_pending integer NOT NULL DEFAULT 0,
  delivery_rate numeric(5,2) NOT NULL DEFAULT 0,
  read_rate numeric(5,2) NOT NULL DEFAULT 0,
  reply_rate numeric(5,2) NOT NULL DEFAULT 0,
  conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_tenant ON public.campaign_metrics (tenant_id);

CREATE TABLE IF NOT EXISTS public.campaign_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_imports_tenant ON public.campaign_imports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_imports_campaign ON public.campaign_imports (campaign_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_imports_status_chk') THEN
    ALTER TABLE public.campaign_imports
      ADD CONSTRAINT campaign_imports_status_chk CHECK (status IN ('processing','completed','failed'));
  END IF;
END $$;

-- RLS mirroring the existing campaign tables: super-admin bypass + tenant isolation.
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can access all campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "Super admins can access all campaign_metrics" ON public.campaign_metrics
  FOR ALL USING (public.is_super_admin());
DROP POLICY IF EXISTS "Users can access own tenant campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "Users can access own tenant campaign_metrics" ON public.campaign_metrics
  FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "Super admins can access all campaign_imports" ON public.campaign_imports;
CREATE POLICY "Super admins can access all campaign_imports" ON public.campaign_imports
  FOR ALL USING (public.is_super_admin());
DROP POLICY IF EXISTS "Users can access own tenant campaign_imports" ON public.campaign_imports;
CREATE POLICY "Users can access own tenant campaign_imports" ON public.campaign_imports
  FOR ALL USING (tenant_id = public.get_current_user_tenant_id());
