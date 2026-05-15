/**
 * Tipos compartilhados para a hierarquia de usuários (3 níveis).
 *
 * Hierarquia: superadmin > agencia > loja
 *
 * Estes tipos espelham o enum `public.user_role` após a migration
 * `20260513130000_rename_hierarchy_loja_agencia.sql`.
 *
 * Valores legados (`account_manager`, `enterprise`, `user`, `super_admin`,
 * `tenant_admin`, `tenant_user`) ainda existem no enum por compatibilidade
 * do Postgres mas são bloqueados pela constraint `profiles_role_modern_only`.
 *
 * `LegacyUserRole` + `normalizeRole()` continuam aceitando valores antigos
 * pra suportar dados em trânsito (cache do TanStack Query, tokens JWT
 * antigos, etc.) até a próxima rotação de sessão.
 */
export type UserRole = 'superadmin' | 'agencia' | 'loja';

/** Roles legadas — apenas pra compatibilidade durante a transição. */
export type LegacyUserRole =
  | 'super_admin'
  | 'account_manager'
  | 'tenant_admin'
  | 'enterprise'
  | 'tenant_user'
  | 'user';

export type AnyUserRole = UserRole | LegacyUserRole;

export type UserStatus = 'active' | 'suspended' | 'pending' | 'deleted';

export const ROLE_ORDER: Record<UserRole, number> = {
  loja: 1,
  agencia: 2,
  superadmin: 3,
};

/** Mapa de role legada → role nova. */
const LEGACY_ROLE_MAP: Record<LegacyUserRole, UserRole> = {
  super_admin: 'superadmin',
  account_manager: 'agencia',
  tenant_admin: 'loja',
  enterprise: 'loja',
  tenant_user: 'loja',
  user: 'loja',
};

/**
 * Normaliza uma role potencialmente legada para o enum atual.
 * Retorna null se for um valor desconhecido.
 */
export function normalizeRole(role: AnyUserRole | null | undefined): UserRole | null {
  if (!role) return null;
  if (role in ROLE_ORDER) return role as UserRole;
  if (role in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[role as LegacyUserRole];
  return null;
}

/**
 * Compara duas roles segundo a ordem hierárquica.
 * `roleAtLeast('agencia', 'loja') === true`.
 * Aceita valores legados via normalização interna.
 */
export function roleAtLeast(actual: AnyUserRole | null, minimum: AnyUserRole): boolean {
  const a = normalizeRole(actual);
  const m = normalizeRole(minimum);
  if (!a || !m) return false;
  return ROLE_ORDER[a] >= ROLE_ORDER[m];
}

/** Labels PT-BR pra cada role atual. */
export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  agencia: 'Agência',
  loja: 'Loja',
};

/** Retorna label PT-BR de qualquer role (normaliza legadas antes). */
export function roleLabel(role: AnyUserRole | null | undefined): string {
  const normalized = normalizeRole(role);
  if (!normalized) return 'Desconhecido';
  return ROLE_LABELS[normalized];
}

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  pending: 'Pendente',
  deleted: 'Excluído',
};
