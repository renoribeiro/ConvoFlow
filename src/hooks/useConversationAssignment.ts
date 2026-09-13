import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';
import {
  assumeConversation,
  transferConversation,
  type AssumeResult,
  type ConversationsClient,
} from '@/lib/conversations/assignment';
import { memberFirstName, useTeamMemberLookup } from '@/hooks/useTeamDirectory';

/**
 * Assumir e transferir conversa — a camada React em cima de
 * `src/lib/conversations/assignment.ts`.
 *
 * Neste passo QUALQUER cargo assume e transfere; quem pode o quê é
 * configuração de um passo posterior. O RLS de `conversations` já dá UPDATE a
 * todo mundo da Loja (e ao gerente nas Lojas filhas), então não há política
 * nova aqui.
 *
 * As invalidações são as mesmas de `useMarkConversationAsRead`: a lista, a
 * conversa aberta e as recentes. A lista também se refaz sozinha a cada 30 s.
 */
const invalidarConversa = (
  queryClient: ReturnType<typeof useQueryClient>,
  tenantId: string | undefined,
  conversationId: string,
) => {
  queryClient.invalidateQueries({ queryKey: ['conversations', tenantId] });
  queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, tenantId] });
  queryClient.invalidateQueries({ queryKey: ['recent-conversations', tenantId] });
};

// O builder do Supabase é estruturalmente compatível com o mínimo que
// `assignment.ts` pede; o cast só existe porque os genéricos do PostgREST não
// batem com a interface enxuta declarada lá.
const client = supabase as unknown as ConversationsClient;

export const useAssumeConversation = () => {
  const queryClient = useQueryClient();
  const { tenant, profile } = useTenant();
  const lookup = useTeamMemberLookup();

  return useMutation<AssumeResult, Error, { conversationId: string }>({
    mutationFn: async ({ conversationId }) => {
      if (!tenant?.id) throw new Error('Nenhuma Conta carregada');
      if (!profile?.id) throw new Error('Perfil ainda não carregado');
      return assumeConversation(client, {
        conversationId,
        tenantId: tenant.id,
        profileId: profile.id,
      });
    },

    onSuccess: (result, { conversationId }) => {
      // Nos dois desfechos a tela precisa se atualizar — no "taken" é o que
      // faz o nome de quem ficou aparecer no chip.
      invalidarConversa(queryClient, tenant?.id, conversationId);

      if (result.status === 'assigned') {
        toast.success('Conversa assumida.');
        return;
      }

      const holder = lookup(result.holderProfileId);
      toast.warning(
        holder
          ? `${memberFirstName(holder)} assumiu esta conversa antes de você.`
          : 'Alguém assumiu esta conversa antes de você. A tela foi atualizada.',
      );
    },

    onError: (error) => {
      logger.error('Erro ao assumir conversa', undefined, error);
      toast.error('Não foi possível assumir a conversa. Tente novamente.');
    },
  });
};

export const useTransferConversation = () => {
  const queryClient = useQueryClient();
  const { tenant, profile } = useTenant();
  const lookup = useTeamMemberLookup();

  return useMutation<{ status: 'transferred' }, Error, { conversationId: string; toProfileId: string }>({
    mutationFn: async ({ conversationId, toProfileId }) => {
      if (!tenant?.id) throw new Error('Nenhuma Conta carregada');
      if (!profile?.id) throw new Error('Perfil ainda não carregado');
      return transferConversation(client, {
        conversationId,
        tenantId: tenant.id,
        toProfileId,
        byProfileId: profile.id,
      });
    },

    onSuccess: (_result, { conversationId, toProfileId }) => {
      invalidarConversa(queryClient, tenant?.id, conversationId);
      const receiver = lookup(toProfileId);
      toast.success(
        toProfileId === profile?.id
          ? 'Conversa assumida.'
          : receiver
            ? `Conversa transferida para ${memberFirstName(receiver)}.`
            : 'Conversa transferida.',
      );
    },

    onError: (error) => {
      logger.error('Erro ao transferir conversa', undefined, error);
      toast.error('Não foi possível transferir a conversa. Tente novamente.');
    },
  });
};
