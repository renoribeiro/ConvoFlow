-- =============================================================================
-- Extensão da Migration 20260513120000: remover policies write permissivas
-- em webhook_logs / webhook_errors
-- =============================================================================
-- Achado pós-A: webhook_logs e webhook_errors ainda tinham:
--   webhook_*_insert_policy   INSERT  WITH CHECK (true)  TO public
--   webhook_*_update_policy   UPDATE  USING (true)       TO public
--   webhook_*_delete_policy   DELETE  USING (true)       TO public
--
-- Vetor: qualquer cliente com a anon key conseguia injetar logs falsos,
-- atualizar/esconder rastros, ou apagar a tabela inteira. Edge Functions
-- escrevem via service_role (bypassa RLS), então essas policies são lixo
-- permissivo herdado.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "webhook_logs_insert_policy"   ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_update_policy"   ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_delete_policy"   ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_errors_insert_policy" ON public.webhook_errors;
DROP POLICY IF EXISTS "webhook_errors_update_policy" ON public.webhook_errors;
DROP POLICY IF EXISTS "webhook_errors_delete_policy" ON public.webhook_errors;

-- Nenhuma policy de write para authenticated/anon é necessária:
--   - Edge Functions (evolution-webhook, waha-webhook) usam service_role,
--     que bypassa RLS por padrão no Supabase.
--   - Frontend nunca escreve em webhook_logs / webhook_errors.

COMMIT;
