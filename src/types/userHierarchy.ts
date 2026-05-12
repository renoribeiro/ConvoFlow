/**
 * Tipos compartilhados para a hierarquia de usuários (4 níveis).
 *
 * Estes tipos espelham o enum `public.user_role` e a coluna `profiles.status`
 * definidos na migration `20260513000001_user_hierarchy_schema.sql`.
 *
 * Quando `supabase gen types typescript` for executado após aplicar a
 * migration, `Tables<'profiles'>.role` passará a refletir esses mesmos
 * valores. Até lá, usar `as UserRole` para casts onde os tipos gerados
 * ainda mostrem o enum antigo.
 */
export type UserRole = 'superadmin' | 'account_manager' | 'enterprise' | 'user';

export type UserStatus = 'active' | 'suspended' | 'pending' | 'deleted';

export const ROLE_ORDER: Record<UserRole, number> = {
  user: 1,
  enterprise: 2,
  account_manager: 3,
  superadmin: 4,
};

/**
 * Compara duas roles segundo a ordem hierárquica.
 * `gte('enterprise','user') === true`.
 */
export function roleAtLeast(actual: UserRole, minimum: UserRole): boolean {
  return ROLE_ORDER[actual] >= ROLE_ORDER[minimum];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadministrador',
  account_manager: 'Gestor de Contas',
  enterprise: 'Enterprise',
  user: 'Usuário',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  pending: 'Pendente',
  deleted: 'Excluído',
};
