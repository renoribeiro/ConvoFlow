-- Campaigns upgrade (Phase 3): storage buckets for campaign media + CSV imports.
-- Files are namespaced by tenant_id as the first path segment: "<tenant_id>/<file>".

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-media', 'campaign-media', true, 52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-imports', 'campaign-imports', false, 10485760,
  ARRAY['text/csv','application/vnd.ms-excel','text/plain']
)
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Tenant-scoped object policies (first folder must equal the caller's tenant_id).
DO $$
DECLARE
  b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['campaign-media','campaign-imports'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_tenant_select');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_tenant_insert');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_tenant_update');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_tenant_delete');

    EXECUTE format($p$
      CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = %L AND (public.is_super_admin()
             OR (storage.foldername(name))[1] = public.get_current_user_tenant_id()::text))$p$,
      b || '_tenant_select', b);

    EXECUTE format($p$
      CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = %L AND (public.is_super_admin()
             OR (storage.foldername(name))[1] = public.get_current_user_tenant_id()::text))$p$,
      b || '_tenant_insert', b);

    EXECUTE format($p$
      CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = %L AND (public.is_super_admin()
             OR (storage.foldername(name))[1] = public.get_current_user_tenant_id()::text))$p$,
      b || '_tenant_update', b);

    EXECUTE format($p$
      CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = %L AND (public.is_super_admin()
             OR (storage.foldername(name))[1] = public.get_current_user_tenant_id()::text))$p$,
      b || '_tenant_delete', b);
  END LOOP;
END $$;
