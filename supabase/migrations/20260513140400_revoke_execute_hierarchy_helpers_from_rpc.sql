-- =============================================================================
-- Hardening: revogar EXECUTE dos helpers de hierarquia pra anon/authenticated
-- =============================================================================
-- Defense-in-depth: helpers de hierarquia (is_agencia, is_loja, etc.) só são
-- usados internamente em RLS policies via auth.uid(). Expô-los via
-- `/rest/v1/rpc/<fn>` do PostgREST não traz benefício e amplia superfície.
--
-- O Supabase advisor flagga isso em duas regras:
--   • anon_security_definer_function_executable
--   • authenticated_security_definer_function_executable
--
-- Revogamos EXECUTE pra anon e authenticated. service_role continua tendo acesso
-- (não é afetado por REVOKE pra esses dois roles específicos).
--
-- handle_new_user é um trigger handler — não deve ser chamado via RPC sob
-- nenhuma circunstância, então também revogamos.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.is_agencia()              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_agencia_safe()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_loja()                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_loja_safe()            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_child_tenant_ids() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()         FROM anon, authenticated;
