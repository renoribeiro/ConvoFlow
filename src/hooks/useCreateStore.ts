import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';

export interface CreatedStore {
  id: string;
  name: string;
  slug: string;
}

/**
 * Mensagem de erro da edge function, em pt-BR.
 *
 * Quando a função responde 4xx/5xx, o supabase-js devolve um FunctionsHttpError
 * com o `Response` original em `context` e deixa `data` nulo — a frase que o
 * servidor escreveu fica dentro desse corpo. Sem ler `context`, o usuário veria
 * só "Edge Function returned a non-2xx status code", que não ajuda ninguém.
 */
async function mensagemDoErro(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;

  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      const mensagem = body?.error?.message ?? body?.error;
      if (typeof mensagem === 'string' && mensagem.trim()) return mensagem;
    } catch {
      // corpo vazio ou não-JSON: cai no fallback abaixo
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível criar a loja. Tente novamente.';
}

/**
 * Cria uma Loja na Conta do gerente logado.
 *
 * O INSERT acontece na edge function `create-store` porque `public.tenants` não
 * tem policy de INSERT para gerente — do navegador a escrita é sempre negada.
 *
 * Depois de criar, invalida as duas consultas que mostram Loja. As duas ficam
 * na faixa estática do cache (30 minutos, ver queryClient.ts): sem invalidar, a
 * Loja recém-criada só apareceria na próxima meia hora.
 */
export function useCreateStore() {
  const queryClient = useQueryClient();
  const { profile } = useTenant();
  const accountId = profile?.tenant_id ?? null;

  return useMutation({
    mutationFn: async (name: string): Promise<CreatedStore> => {
      const { data, error } = await supabase.functions.invoke('create-store', {
        body: { name },
      });

      if (error) throw new Error(await mensagemDoErro(error));

      // Resposta 200 carregando erro no corpo (padrão de algumas funções).
      if (data && typeof data === 'object' && 'error' in data) {
        const payload = (data as { error: { message?: string } | string }).error;
        throw new Error(
          typeof payload === 'string'
            ? payload
            : payload?.message ?? 'Não foi possível criar a loja.',
        );
      }

      const store = (data as { store?: CreatedStore } | null)?.store;
      if (!store?.id) {
        throw new Error('A loja foi criada, mas o servidor não devolveu os dados dela.');
      }
      return store;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TENANT, 'my-stores', accountId],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TENANT, 'store-slots', accountId],
      });
    },
  });
}
