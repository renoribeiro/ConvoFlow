import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { UserRole, roleAtLeast } from '@/types/userHierarchy';

type Tenant = Tables<'tenants'>;
type Profile = Tables<'profiles'>;

interface TenantContextType {
  tenant: Tenant | null;
  profile: Profile | null;
  tenantId: string | null;
  loading: boolean;
  error: string | null;
  refreshTenant: () => Promise<void>;
  updateTenantSettings: (settings: any) => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const loadTenantData = async () => {
    if (!user) {
      setTenant(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Buscar perfil do usuário
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
      }

      setProfile(profileData);

      // Superadmin e account_manager podem não ter tenant_id; nesse caso o
      // contexto carrega só o profile e segue sem tenant.
      if (!profileData?.tenant_id) {
        setTenant(null);
        return;
      }

      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profileData.tenant_id)
        .single();

      if (tenantError) {
        throw new Error(`Erro ao buscar tenant: ${tenantError.message}`);
      }

      setTenant(tenantData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      setTenant(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshTenant = async () => {
    await loadTenantData();
  };

  const updateTenantSettings = async (settings: Record<string, unknown>) => {
    if (!tenant) {
      throw new Error('Nenhum tenant carregado');
    }

    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          settings: {
            ...tenant.settings,
            ...settings
          }
        })
        .eq('id', tenant.id);

      if (error) {
        throw error;
      }

      // Atualizar estado local
      setTenant(prev => prev ? {
        ...prev,
        settings: {
          ...prev.settings,
          ...settings
        }
      } : null);

      toast({
        title: 'Sucesso',
        description: 'Configurações atualizadas com sucesso',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar configurações';
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      await loadTenantData();
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const value: TenantContextType = {
    tenant,
    profile,
    tenantId: tenant?.id || null,
    loading,
    error,
    refreshTenant,
    updateTenantSettings,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

// Hook para obter tenant_id de forma mais simples
export const useTenantId = () => {
  const { tenantId } = useTenant();
  return tenantId;
};

/**
 * Retorna a role do usuário atual no novo enum, ou null se ainda não
 * carregada. Faz cast porque os tipos gerados (`Tables<'profiles'>.role`)
 * podem refletir o enum antigo até `supabase gen types` ser executado.
 */
export const useRole = (): UserRole | null => {
  const { profile } = useTenant();
  return (profile?.role as UserRole | undefined) ?? null;
};

export const useIsSuperAdmin = () => useRole() === 'superadmin';
export const useIsAccountManager = () => useRole() === 'account_manager';
export const useIsEnterprise = () => useRole() === 'enterprise';

/** @deprecated Use useIsEnterprise. Mantido por 1 release. */
export const useIsTenantAdmin = useIsEnterprise;

/** Retorna true se a role do usuário for ao menos `minimum` na hierarquia. */
export const useHasMinRole = (minimum: UserRole): boolean => {
  const role = useRole();
  return role !== null && roleAtLeast(role, minimum);
};
