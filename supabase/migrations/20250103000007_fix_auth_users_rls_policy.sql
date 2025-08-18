-- Migração para permitir acesso aos dados da tabela auth.users para super admins
-- Criando uma função que retorna os dados dos usuários de forma segura

-- Criar função para buscar dados de usuários (apenas para super admins)
CREATE OR REPLACE FUNCTION public.get_auth_users_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Verificar se o usuário atual é super admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super administradores podem acessar esta função';
  END IF;

  -- Retornar dados dos usuários
  RETURN QUERY
  SELECT 
    au.id,
    au.email::text,
    au.created_at,
    au.last_sign_in_at,
    au.email_confirmed_at
  FROM auth.users au
  WHERE au.deleted_at IS NULL
  ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Dar permissões para usuários autenticados chamarem a função
GRANT EXECUTE ON FUNCTION public.get_auth_users_for_admin() TO authenticated;

-- Comentário explicativo
COMMENT ON FUNCTION public.get_auth_users_for_admin() IS 
'Função segura para permitir que super admins acessem dados básicos da tabela auth.users';

-- Dropar a view existente se houver
DROP VIEW IF EXISTS public.admin_users_view;

-- Criar uma view que combina dados de auth.users com profiles
CREATE VIEW public.admin_users_view AS
SELECT 
  au.id,
  au.email,
  au.created_at,
  au.last_sign_in_at,
  au.email_confirmed_at,
  p.tenant_id,
  p.first_name,
  p.last_name,
  p.role,
  p.is_active,
  p.phone,
  p.updated_at as profile_updated_at
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.user_id
WHERE au.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles current_user_profile
    WHERE current_user_profile.user_id = auth.uid()
    AND current_user_profile.role = 'super_admin'
  )
ORDER BY au.created_at DESC;

-- Adicionar política RLS para a view
ALTER VIEW public.admin_users_view OWNER TO postgres;
GRANT SELECT ON public.admin_users_view TO authenticated;

-- Comentário na view
COMMENT ON VIEW public.admin_users_view IS 
'View que combina dados de auth.users com profiles, acessível apenas para super admins';