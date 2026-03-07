import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useModules } from '@/hooks/useModules';
import { useIsSuperAdmin, useTenant } from '@/contexts/TenantContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModuleGuardProps {
  children: React.ReactNode;
  moduleName: string;
  fallbackPath?: string;
}

const PREMIUM_MODULES = ['chatbots', 'automation', 'campaigns', 'followups', 'reports', 'tracking', 'funnel'];

export const ModuleGuard = ({ 
  children, 
  moduleName, 
  fallbackPath = '/' 
}: ModuleGuardProps) => {
  const { visibleModules, isLoading } = useModules();
  const isSuperAdmin = useIsSuperAdmin();
  const { tenant } = useTenant();
  const navigate = useNavigate();

  // Super admins sempre têm acesso a todos os módulos
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Mostrar loading enquanto carrega os módulos
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Verificar se o módulo está habilitado para o usuário (System Settings)
  const moduleEnabled = visibleModules?.some(
    module => module.module_name === moduleName && module.is_enabled
  );

  if (!moduleEnabled) {
    // Opção 1: Redirecionar para uma página específica
    if (fallbackPath !== null) {
      return <Navigate to={fallbackPath} replace />;
    }
    
    // Opção 2: Mostrar mensagem de acesso negado
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Você não tem acesso a este módulo. Entre em contato com o administrador se precisar de acesso.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Verificar Assinatura (Premium Check)
  const isPremiumModule = PREMIUM_MODULES.includes(moduleName);
  const isPro = tenant?.plan_type === 'pro' && tenant?.subscription_status === 'active';
  const trialEnds = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const isTrial = tenant?.status === 'trial' && (!trialEnds || trialEnds > new Date());
  
  const hasAccess = isPro || isTrial;

  if (isPremiumModule && !hasAccess) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="bg-yellow-100 p-4 rounded-full">
            <Lock className="h-12 w-12 text-yellow-600" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Recurso Premium</h2>
            <p className="text-muted-foreground">
              O módulo <strong>{moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}</strong> está disponível apenas no plano Pro.
              Atualize sua assinatura para desbloquear este e outros recursos avançados.
            </p>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Voltar
            </Button>
            <Button onClick={() => navigate('/dashboard/settings?tab=subscription')} className="bg-green-600 hover:bg-green-700">
              Fazer Upgrade Agora
            </Button>
          </div>
        </div>
      );
  }

  return <>{children}</>;
};

// Hook para verificar se um módulo específico está habilitado e acessível
export const useModuleAccess = (moduleName: string) => {
  const { visibleModules, isLoading } = useModules();
  const isSuperAdmin = useIsSuperAdmin();
  const { tenant } = useTenant();

  // Super admins sempre têm acesso
  if (isSuperAdmin) {
    return { hasAccess: true, isLoading };
  }

  const moduleEnabled = visibleModules?.some(
    module => module.module_name === moduleName && module.is_enabled
  ) ?? false;

  const isPremiumModule = PREMIUM_MODULES.includes(moduleName);
  const isPro = tenant?.plan_type === 'pro' && tenant?.subscription_status === 'active';
  const trialEnds = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const isTrial = tenant?.status === 'trial' && (!trialEnds || trialEnds > new Date());
  const hasSubscriptionAccess = !isPremiumModule || isPro || isTrial;

  return { hasAccess: moduleEnabled && hasSubscriptionAccess, isLoading };
};