-- =============================================================================
-- ConvoFlow — "Relatar Bug": aplica as 3 migrações de uma vez.
-- Rodar no SQL Editor do Supabase. Idempotente (pode rodar de novo).
-- Equivale a: 20260810000001 + 20260810000002 + 20260810000003
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Feature flag por Conta
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS bug_report_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenants.bug_report_enabled IS
  'Quando false, oculta o botão "Reportar bug" da Navbar para os usuários desta Conta/Loja. Default true.';

-- ---------------------------------------------------------------------------
-- 2) Tabela bug_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email      text NOT NULL,
  user_role       text NOT NULL,
  description     text NOT NULL,
  attachment_url  text,
  attachment_type text CHECK (attachment_type IN ('image', 'video')),
  page_url        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_tenant_created_idx
  ON public.bug_reports (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_created_idx
  ON public.bug_reports (created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bug_reports_superadmin_select" ON public.bug_reports;
CREATE POLICY "bug_reports_superadmin_select" ON public.bug_reports
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "bug_reports_tenant_insert" ON public.bug_reports;
CREATE POLICY "bug_reports_tenant_insert" ON public.bug_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_super_admin()
      OR tenant_id = public.get_current_user_tenant_id()
      OR EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id = bug_reports.tenant_id
          AND t.parent_tenant_id = public.get_current_user_tenant_id()
      )
    )
  );

GRANT SELECT, INSERT ON public.bug_reports TO authenticated;
REVOKE UPDATE, DELETE ON public.bug_reports FROM authenticated;
REVOKE ALL ON public.bug_reports FROM anon;

-- ---------------------------------------------------------------------------
-- 3) Bucket privado bug-reports (50 MB, imagem/vídeo)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bug-reports', 'bug-reports', false, 52428800, ARRAY['image/*', 'video/*'])
ON CONFLICT (id) DO UPDATE
  SET public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "bug_reports_tenant_select" ON storage.objects;
CREATE POLICY "bug_reports_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bug-reports'
    AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = public.get_current_user_tenant_id()::text
      OR EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.parent_tenant_id = public.get_current_user_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS "bug_reports_tenant_insert" ON storage.objects;
CREATE POLICY "bug_reports_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bug-reports'
    AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = public.get_current_user_tenant_id()::text
      OR EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.parent_tenant_id = public.get_current_user_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS "bug_reports_tenant_delete" ON storage.objects;
CREATE POLICY "bug_reports_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bug-reports'
    AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = public.get_current_user_tenant_id()::text
      OR EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.parent_tenant_id = public.get_current_user_tenant_id()
      )
    )
  );

COMMIT;

-- =============================================================================
-- CONFERÊNCIA (rodar depois, deve devolver 1 linha cada)
--   select id, public, file_size_limit from storage.buckets where id = 'bug-reports';
--   select count(*) from public.bug_reports;
--   select column_name from information_schema.columns
--     where table_name = 'tenants' and column_name = 'bug_report_enabled';
-- =============================================================================
