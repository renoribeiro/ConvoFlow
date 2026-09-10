-- =============================================================================
-- 20260909000005_storage_gerente_uploads_child_store_media
--
-- O QUE MUDA
--   O gerente passa a subir midia (foto, audio, documento) para a pasta das
--   Lojas filhas no bucket `whatsapp-media`.
--
-- POR QUE FALTAVA
--   A 20260909000004 liberou a escrita nas TABELAS da caixa de entrada, e com
--   isso a mensagem de TEXTO passou a sair. Midia nao: ela sobe antes para o
--   Storage, e `whatsapp_media_tenant_upload` so aceita a pasta da Conta do
--   proprio perfil. `uploadWhatsAppMedia` monta o caminho como
--   `<tenant_id>/<timestamp>-<arquivo>`, e para a gerente `tenant_id` e a LOJA
--   escolhida no seletor - nunca a Conta dela. Medido em 2026-09-09 como a
--   Camila: pasta da EncaixaRH = false, pasta da propria Conta = true.
--
-- ATENCAO - O "PRECEDENTE" DO BUCKET bug-reports ESTA QUEBRADO. NAO COPIE.
--   As tres policies de `bug-reports` carregam esta clausula:
--       EXISTS (SELECT 1 FROM tenants t
--                WHERE t.id::text = (storage.foldername(t.name))[1]
--                  AND t.parent_tenant_id = get_current_user_tenant_id())
--   Repare no argumento: `t.name` e o NOME DO TENANT, nao o caminho do objeto.
--   `storage.foldername('EncaixaRH')` devolve `{}`, entao `[1]` e NULL e o
--   EXISTS nunca casa. Ou seja: a permissao de Loja filha em `bug-reports`
--   e CODIGO MORTO desde que foi escrita. Medido em 2026-09-09:
--       clausula como esta -> false     clausula com o `name` do objeto -> true
--   Nao foi corrigida aqui (outro bucket, outra decisao), mas fica registrado.
--
-- ESCOPO
--   SO INSERT, e so no bucket `whatsapp-media`. `uploadWhatsAppMedia` usa
--   `upsert: false`, entao subir arquivo e INSERT puro - UPDATE nao entra.
--   A leitura ja e publica no bucket (`whatsapp_media_public_read`), e o
--   DELETE continua restrito a Conta do proprio perfil, igual as tabelas:
--   apagar nao faz parte de responder cliente.
--
--   O predicado usa `public.gerente_child_store_ids()`, o mesmo helper das
--   20260909000001/4 - uma fonte da verdade so, e gerente-only por construcao.
--   Subconsulta nao correlacionada, entao continua InitPlan.
-- =============================================================================

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gerente_child_store_ids'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: helper gerente_child_store_ids() nao existe. Rode a 20260909000001 antes.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'whatsapp-media') THEN
    RAISE EXCEPTION 'ABORTADO: bucket whatsapp-media nao existe.';
  END IF;

  DROP POLICY IF EXISTS whatsapp_media_gerente_child_store_upload ON storage.objects;

  CREATE POLICY whatsapp_media_gerente_child_store_upload
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'whatsapp-media'
      AND (storage.foldername(name))[1] IN (
        SELECT s::text FROM public.gerente_child_store_ids() s
      )
    );

  RAISE NOTICE 'whatsapp_media_gerente_child_store_upload criada.';
END
$mig$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260909000005','storage_gerente_uploads_child_store_media')
ON CONFLICT (version) DO NOTHING;
