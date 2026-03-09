import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';

interface QueryFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: any;
}

interface UseSupabaseQueryOptions {
  table: string;
  queryKey?: any[];
  select?: string;
  filter?: QueryFilter[];
  filters?: QueryFilter[];
  order?: {
    column: string;
    ascending?: boolean;
  };
  orderBy?: {
    column: string;
    ascending?: boolean;
  }[];
  limit?: number;
  enabled?: boolean;
  refetchInterval?: number;
  staleTime?: number;
}

export function useSupabaseQuery(options: UseSupabaseQueryOptions) {
  const {
    table,
    queryKey,
    select = '*',
    filter = [],
    filters = [],
    order,
    orderBy,
    limit,
    enabled = true,
    refetchInterval,
    staleTime
  } = options;

  const { tenant } = useTenant();
  const { toast } = useToast();

  // Combinar filtros de ambas as propriedades
  const allFilters = [...filter, ...filters];

  return useQuery({
    queryKey: queryKey || [table, select, allFilters, order || orderBy, limit, tenant?.id],
    queryFn: async () => {
      try {
        let query = supabase.from(table).select(select);

        // Filtrar por tenant automaticamente se não for a tabela profiles, tenants ou affiliates
        if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates' && table !== 'admin_users_view') {
          query = query.eq('tenant_id', tenant.id);
        }

        // Aplicar filtros
        allFilters.forEach(({ column, operator, value }) => {
          switch (operator) {
            case 'eq':
              query = query.eq(column, value);
              break;
            case 'neq':
              query = query.neq(column, value);
              break;
            case 'gt':
              query = query.gt(column, value);
              break;
            case 'gte':
              query = query.gte(column, value);
              break;
            case 'lt':
              query = query.lt(column, value);
              break;
            case 'lte':
              query = query.lte(column, value);
              break;
            case 'like':
              query = query.like(column, value);
              break;
            case 'ilike':
              query = query.ilike(column, value);
              break;
            case 'in':
              query = query.in(column, value);
              break;
            case 'is':
              query = query.is(column, value);
              break;
          }
        });

        // Aplicar ordenação (priorizar 'order' sobre 'orderBy')
        if (order) {
          query = query.order(order.column, { ascending: order.ascending ?? true });
        } else if (orderBy) {
          // Suportar tanto array quanto objeto único
          const orderArray = Array.isArray(orderBy) ? orderBy : [orderBy];
          orderArray.forEach(orderItem => {
            query = query.order(orderItem.column, { ascending: orderItem.ascending ?? true });
          });
        }

        // Aplicar limite
        if (limit) {
          query = query.limit(limit);
        }

        const { data, error } = await query;

        if (error) {
          console.error(`Erro na query da tabela ${table}:`, error);
          throw error;
        }

        return data || [];
      } catch (error) {
        console.error(`Erro ao executar query na tabela ${table}:`, error);
        toast({
          title: 'Erro ao carregar dados',
          description: `Falha ao carregar dados da tabela ${table}`,
          variant: 'destructive',
        });
        throw error;
      }
    },
    enabled,
    refetchInterval,
    staleTime,
  });
}

// Hook simplificado para queries básicas
export function useSupabaseTable(tableName: string, options?: Partial<UseSupabaseQueryOptions>) {
  return useSupabaseQuery({
    table: tableName,
    ...options,
  });
}

// Hook para buscar um único registro
export function useSupabaseQuerySingle(options: UseSupabaseQueryOptions) {
  const { tenant } = useTenant();
  const { toast } = useToast();

  return useQuery({
    queryKey: [options.table, 'single', options.filters, tenant?.id],
    queryFn: async () => {
      let query = supabase.from(options.table).select(options.select || '*');

      // Filtrar por tenant automaticamente
      if (tenant?.id && options.table !== 'profiles' && options.table !== 'tenants' && options.table !== 'affiliates' && options.table !== 'admin_users_view') {
        query = query.eq('tenant_id', tenant.id);
      }

      // Aplicar filtros
      if (options.filters) {
        options.filters.forEach(({ column, operator, value }) => {
          switch (operator) {
            case 'eq':
              query = query.eq(column, value);
              break;
            case 'neq':
              query = query.neq(column, value);
              break;
            case 'gt':
              query = query.gt(column, value);
              break;
            case 'gte':
              query = query.gte(column, value);
              break;
            case 'lt':
              query = query.lt(column, value);
              break;
            case 'lte':
              query = query.lte(column, value);
              break;
            case 'like':
              query = query.like(column, value);
              break;
            case 'ilike':
              query = query.ilike(column, value);
              break;
            case 'in':
              query = query.in(column, value);
              break;
            case 'is':
              query = query.is(column, value);
              break;
          }
        });
      }

      const { data, error } = await query.single();

      if (error) {
        toast({
          title: 'Erro ao buscar registro',
          description: error.message,
          variant: 'destructive',
        });
        throw error;
      }

      return data;
    },
    enabled: options.enabled,
  });
}

// Hook para contar registros
export function useSupabaseCount(
  table: string,
  filters?: QueryFilter[],
  options?: { enabled?: boolean; refetchInterval?: number; staleTime?: number }
) {
  const { tenant } = useTenant();
  const { toast } = useToast();

  return useQuery({
    queryKey: ['count', table, filters, tenant?.id],
    queryFn: async () => {
      let query = supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      // Filtrar por tenant automaticamente
      if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates' && table !== 'admin_users_view') {
        query = query.eq('tenant_id', tenant.id);
      }

      // Aplicar filtros adicionais
      if (filters) {
        filters.forEach(({ column, operator, value }) => {
          switch (operator) {
            case 'eq':
              query = query.eq(column, value);
              break;
            case 'neq':
              query = query.neq(column, value);
              break;
            case 'gt':
              query = query.gt(column, value);
              break;
            case 'gte':
              query = query.gte(column, value);
              break;
            case 'lt':
              query = query.lt(column, value);
              break;
            case 'lte':
              query = query.lte(column, value);
              break;
            case 'like':
              query = query.like(column, value);
              break;
            case 'ilike':
              query = query.ilike(column, value);
              break;
            case 'in':
              query = query.in(column, value);
              break;
            case 'is':
              query = query.is(column, value);
              break;
          }
        });
      }

      const { count, error } = await query;

      if (error) {
        console.error(`Erro ao contar registros na tabela ${table}:`, error);
        toast({
          title: 'Erro ao contar registros',
          description: error.message,
          variant: 'destructive',
        });
        throw error;
      }

      return count || 0;
    },
    enabled: options?.enabled ?? !!tenant?.id,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
  });
}