import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsSuperAdmin } from '@/contexts/TenantContext';

interface RoleGuardProps {
  children: React.ReactNode;
  role: string;
  fallbackPath?: string;
}

export const RoleGuard = ({ 
  children, 
  role,
  fallbackPath = '/' 
}: RoleGuardProps) => {
  const { user, isLoading } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();

  // Se está carregando, mostra estado de loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Super admin tem acesso a tudo, ou verifica se o profile tem a role exata
  const userRole = user?.user_metadata?.role;
  const hasAccess = isSuperAdmin || userRole === role;

  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
