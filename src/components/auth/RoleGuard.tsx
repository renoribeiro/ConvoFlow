import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant, useRole, useHasMinRole } from '@/contexts/TenantContext';
import { UserRole } from '@/types/userHierarchy';

interface RoleGuardProps {
  children: React.ReactNode;
  role?: UserRole | UserRole[];
  minRole?: UserRole;
  fallbackPath?: string;
}

export const RoleGuard = ({
  children,
  role,
  minRole,
  fallbackPath = '/dashboard',
}: RoleGuardProps) => {
  const { isLoading: authLoading } = useAuth();
  const { loading: tenantLoading, profile } = useTenant();
  const userRole = useRole();
  const hasMinRole = useHasMinRole(minRole ?? 'user');

  // Aguardar AMBOS auth e tenant antes de decidir redirect.
  // Caso contrário o redirect dispara antes do profile carregar -> loop visual
  // entre landing page e dashboard.
  if (authLoading || tenantLoading || profile === null) {
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
