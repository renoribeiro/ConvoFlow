-- =============================================================================
-- Relatar Bug — bucket privado `bug-reports` (prints e vídeos dos relatos)
-- =============================================================================
-- Convenção de caminho: "<tenant_id>/<user_id>/<timestamp>-<arquivo>"
-- O primeiro segmento é a Conta/Loja ativa, igual aos buckets whatsapp-media e
-- campaign-*. Bucket PRIVADO: o link do e-mail é uma URL assinada gerada pelo
-- frontend (validade de 1 ano), não uma URL pública.
--
-- O padrão de policy segue 20260605120003_campaign_storage_buckets.sql, com a
-- mesma extensão aplicada em 20260810000001: além da própria Conta, aceita uma
-- Loja filha, porque `useTenantId()` devolve a Conta/Loja ATIVA e um gerente com
-- Loja selecionada tem tenant ativo != profiles.tenant_id.
--
-- DELETE é obrigatório aqui: o fluxo de envio remove o anexo já subido quando
-- um passo posterior falha (rollback do BugReportButton).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-reports', 'bug-reports', false, 52428800,
  ARRAY['image/*', 'video/*']
)
ON CONFLICT (id) DO UPDATE
  SET public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "bug_reports_tenant_select" ON storage.objects;
CREATE POLICY "bug_reports_tenant_select" ON storage.objects
  FOR SELECT
  TO authenticated
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
  FOR INSERT
  TO authenticated
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
  FOR DELETE
  TO authenticated
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

-- =============================================================================
-- ROLLBACK
--   DROP POLICY IF EXISTS "bug_reports_tenant_select" ON storage.objects;
--   DROP POLICY IF EXISTS "bug_reports_tenant_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "bug_reports_tenant_delete" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'bug-reports';  -- exige bucket vazio
-- =============================================================================
