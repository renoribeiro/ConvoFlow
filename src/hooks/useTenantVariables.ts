import { useMemo } from 'react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';

/**
 * Variáveis personalizadas disponíveis na conta (tenant), agregadas a partir de
 * todos os chatbots. São as variáveis que os fluxos coletam (ex.: {nome}, {email})
 * e que ficam disponíveis para as automações usarem em ações, gatilhos e condições.
 *
 * Diferente do chatbot (onde as variáveis pertencem a um único bot), as automações
 * são tenant-wide, então deduplicamos os nomes de `chatbot_variables` por nome.
 */
export function useTenantVariables() {
  const { data: rows = [], isLoading } = useSupabaseQuery({
    table: 'chatbot_variables',
    queryKey: ['tenant-variables'],
    select: 'name',
  });

  const customVariables = useMemo(() => {
    const names = (rows as { name: string }[])
      .map((r) => r.name)
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '');
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return { customVariables, isLoading };
}
