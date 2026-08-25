-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250805020239`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
-- Idempotente: já está aplicada, rodar de novo é no-op.
--
-- `get_admin_users_data()` é VIVA — alimenta a tela de administração de
-- usuários. É SECURITY DEFINER porque precisa ler `auth.users` para trazer o
-- e-mail, o que o RLS de `profiles` sozinho não permitiria.
--
-- Nota de história: o ledger tem cinco iterações desta função entre
-- 20250805015619 e 20250805020239 (`create_admin_users_function`,
-- `fix_admin_users_function`, `recreate_admin_users_data_function`,
-- `fix_admin_users_data_function_role_cast` e esta). Só o resultado final
-- sobrevive no catálogo — os passos intermediários não são recuperáveis, e não
-- fazem falta: `CREATE OR REPLACE` deixa o mesmo estado final.
--
-- Cuidado ao editar: os `::text` em toda coluna não são enfeite. `profiles.role`
-- é o enum `user_role`, e sem o cast a assinatura de retorno não bate — foi
-- exatamente isso que gerou as cinco tentativas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_users_data()
 RETURNS TABLE(id text, user_id text, first_name text, last_name text, role text,
               phone text, avatar_url text, is_active boolean,
               created_at timestamp with time zone, updated_at timestamp with time zone,
               tenant_id text, email text, tenant_name text, plan_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id::text,
    p.user_id::text,
    p.first_name::text,
    p.last_name::text,
    p.role::text,
    p.phone::text,
    p.avatar_url::text,
    p.is_active,
    p.created_at,
    p.updated_at,
    p.tenant_id::text,
    au.email::text,
    COALESCE(t.name, 'Sem tenant')::text as tenant_name,
    COALESCE(t.plan_type, 'free')::text as plan_type
  FROM profiles p
  LEFT JOIN auth.users au ON p.user_id = au.id
  LEFT JOIN tenants t ON p.tenant_id = t.id
  ORDER BY p.created_at DESC;
END;
$function$;
