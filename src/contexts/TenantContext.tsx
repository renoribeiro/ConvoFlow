import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/supabase/types';

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

      if (!profileData?.tenant_id) {
        throw new Error('Usuário não possui tenant associado');
      }

      setProfile(profileData);

      // Buscar dados do tenant
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

// Hook para verificar se o usuário é admin do tenant
export const useIsTenantAdmin = () => {
  const { profile } = useTenant();
  return profile?.role === 'tenant_admin';
};

// Hook para verificar se o usuário é super admin
export const useIsSuperAdmin = () => {
  const { profile } = useTenant();
  return profile?.role === 'super_admin';
};