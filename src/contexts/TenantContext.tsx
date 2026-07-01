import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { AnyUserRole, UserRole, normalizeRole, roleAtLeast } from '@/types/userHierarchy';

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
  /**
   * True quando um superadmin está "dentro" de uma Conta que não é a sua
   * (impersonação). Usado para mostrar o banner/seletor de Conta ativa.
   */
  isImpersonating: boolean;
  /**
   * Define a Conta ativa do superadmin. Passar `null` volta ao estado
   * sem Conta. Só tem efeito para superadmin — para os demais, o tenant
   * é sempre derivado do próprio profile.
   */
  setActiveTenant: (tenantId: string | null) => void;
}

/**
 * Chave de localStorage que guarda a Conta que o superadmin escolheu
 * "entrar". Persistida para sobreviver a reloads. Ignorada para qualquer
 * usuário que não seja superadmin (gate por role em loadTenantData).
 */
const ACTIVE_TENANT_KEY = 'convoflow-active-tenant';

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
  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_TENANT_KEY);
    } catch {
      return null;
    }
  });
  const { user } = useAuth();
  const { toast } = useToast();

  const loadTenantData = async () => {
    if (!user) {
      setTenant(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Buscar perfil do usuário — falha aqui é crítica
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[TenantContext] Erro ao buscar perfil:', profileError);
      setError(`Erro ao buscar perfil: ${profileError.message}`);
      setProfile(null);
      setTenant(null);
      setLoading(false);
      return;
    }

    if (!profileData) {
      console.warn('[TenantContext] Profile não encontrado para user:', user.id);
      setProfile(null);
      setTenant(null);
      setLoading(false);
      return;
    }

    setProfile(profileData);

    // Resolver o tenant efetivo.
    // Um superadmin não tem tenant_id próprio, mas pode "entrar" numa Conta
    // específica (impersonação) — nesse caso usamos o tenant escolhido. O RLS
    // já libera o superadmin a ler qualquer tenant (policies "Super admins can
    // access all ..."), então basta filtrar as queries por esse tenant_id.
    // Para qualquer outra role o impersonatedTenantId é ignorado.
    const isSuper = normalizeRole(profileData.role as AnyUserRole | undefined) === 'superadmin';
    const effectiveTenantId = (isSuper && impersonatedTenantId)
      ? impersonatedTenantId
      : profileData.tenant_id;

    if (!effectiveTenantId) {
      setTenant(null);
      setLoading(false);
      return;
    }

    // Buscar tenant — falha aqui NÃO deve apagar o profile já carregado.
    // Profile carregado é mais importante que tenant (auth/permissions usam o profile).
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', effectiveTenantId)
      .maybeSingle();

    if (tenantError) {
      console.error('[TenantContext] Erro ao buscar tenant (profile preservado):', tenantError);
      setError(`Erro ao buscar Conta: ${tenantError.message}`);
      setTenant(null);
    } else {
      setTenant(tenantData);
    }

    setLoading(false);
  };

  const refreshTenant = async () => {
    await loadTenantData();
  };

  const setActiveTenant = (tenantId: string | null) => {
    try {
      if (tenantId) {
        localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
      } else {
        localStorage.removeItem(ACTIVE_TENANT_KEY);
      }
    } catch {
      // localStorage indisponível (modo privado, etc.) — segue só com o estado.
    }
    // Dispara o useEffect (deps inclui impersonatedTenantId) → recarrega o
    // tenant efetivo. Como o queryKey das queries inclui tenant?.id, o
    // TanStack Query refetcha automaticamente os dados da nova Conta.
    setImpersonatedTenantId(tenantId);
  };

  const updateTenantSettings = async (settings: Record<string, unknown>) => {
    if (!tenant) {
      throw new Error('Nenhuma Conta carregada');
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
  }, [user, impersonatedTenantId]);

  const isImpersonating = !!impersonatedTenantId
    && normalizeRole(profile?.role as AnyUserRole | undefined) === 'superadmin';

  const value: TenantContextType = {
    tenant,
    profile,
    tenantId: tenant?.id || null,
    loading,
    error,
    refreshTenant,
    updateTenantSettings,
    isImpersonating,
    setActiveTenant,
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
 * Retorna a role do usuário atual normalizada para o enum atual
 * (`superadmin` | `agencia` | `loja`), ou null se ainda não carregada.
 *
 * `normalizeRole()` converte valores legados (`user`/`enterprise`/
 * `account_manager`) para o enum atual, então este hook permanece
 * estável mesmo quando o cache do TanStack Query ainda contém um
 * profile pré-migration.
 */
export const useRole = (): UserRole | null => {
  const { profile } = useTenant();
  return normalizeRole(profile?.role as AnyUserRole | undefined);
};

export const useIsSuperAdmin = () => useRole() === 'superadmin';
export const useIsAgencia = () => useRole() === 'agencia';
export const useIsLoja = () => useRole() === 'loja';

/** @deprecated Use useIsAgencia. Mantido por 1 release. */
export const useIsAccountManager = useIsAgencia;
/** @deprecated Use useIsLoja. Mantido por 1 release. */
export const useIsEnterprise = useIsLoja;
/** @deprecated Use useIsLoja. Mantido por 1 release. */
export const useIsTenantAdmin = useIsLoja;

/** Retorna true se a role do usuário for ao menos `minimum` na hierarquia. */
export const useHasMinRole = (minimum: UserRole): boolean => {
  const role = useRole();
  return role !== null && roleAtLeast(role, minimum);
};
