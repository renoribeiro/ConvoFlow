import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRole, useHasMinRole } from '@/contexts/TenantContext';
import { UserRole } from '@/types/userHierarchy';

interface RoleGuardProps {
  children: React.ReactNode;
  /**
   * Role(s) exigida(s) para acesso. Pode ser uma role específica, um
   * array de roles, ou usar `minRole` para hierarquia.
   * Superadmin sempre tem acesso.
   */
  role?: UserRole | UserRole[];
  /**
   * Nível mínimo na hierarquia (`user < enterprise < account_manager < superadmin`).
   * Mutuamente exclusivo com `role`.
   */
  minRole?: UserRole;
  fallbackPath?: string;
}

export const RoleGuard = ({
  children,
  role,
  minRole,
  fallbackPath = '/',
}: RoleGuardProps) => {
  const { isLoading } = useAuth();
  const userRole = useRole();
  const hasMinRole = useHasMinRole(minRole ?? 'user');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isSuperAdmin = userRole === 'superadmin';
  let hasAccess = isSuperAdmin;

  if (!hasAccess && minRole) {
    hasAccess = hasMinRole;
  }
  if (!hasAccess && role) {
    const allowed = Array.isArray(role) ? role : [role];
    hasAccess = userRole !== null && allowed.includes(userRole);
  }

  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
