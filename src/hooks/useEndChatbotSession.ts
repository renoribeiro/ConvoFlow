import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';

/**
 * Encerra manualmente a sessão ativa do chatbot de um contato.
 *
 * Contexto: quando um lead não escolhe uma opção válida, o motor do chatbot
 * fica reenviando o menu (o nó `show_options` permanece aguardando). Só existe
 * UMA sessão `active` por (contact_id, whatsapp_instance_id) — índice único
 * `uq_chatbot_active_session`. Marcar essa sessão como `completed` libera o
 * contato e faz o bot parar de reenviar; ele só volta a agir se um trigger novo
 * casar numa próxima mensagem.
 *
 * RLS: a policy "Users can access own tenant chatbot_sessions"
 * (tenant_id = get_current_user_tenant_id()) já permite o UPDATE pelo operador,
 * então não é preciso Edge Function.
 */
interface EndChatbotSessionArgs {
  contactId: string;
  whatsappInstanceId?: string | null;
}

interface EndChatbotSessionResult {
  /** true quando havia uma sessão ativa e ela foi encerrada. */
  ended: boolean;
}

export const useEndChatbotSession = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation<EndChatbotSessionResult, Error, EndChatbotSessionArgs>({
    mutationFn: async ({ contactId, whatsappInstanceId }) => {
      if (!tenant?.id) throw new Error('Tenant ID is required');
      if (!contactId) throw new Error('Contact ID is required');

      // Localiza a sessão ativa do contato. O filtro por instância é aplicado
      // apenas quando conhecido — sessões antigas podem ter whatsapp_instance_id
      // nulo, e nesse caso o índice único garante que ainda há só uma ativa.
      let query = supabase
        .from('chatbot_sessions')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('contact_id', contactId)
        .eq('status', 'active');

      if (whatsappInstanceId) {
        query = query.eq('whatsapp_instance_id', whatsappInstanceId);
      }

      const { data: session, error: findError } = await query.maybeSingle();
      if (findError) throw findError;
      if (!session?.id) return { ended: false };

      const { error: updateError } = await supabase
        .from('chatbot_sessions')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          awaiting_input: false,
        })
        .eq('id', session.id)
        .eq('tenant_id', tenant.id);

      if (updateError) throw updateError;
      return { ended: true };
    },
    onError: (error) => {
      logger.error('[useEndChatbotSession] falha ao encerrar sessão do bot', {
        error: error instanceof Error ? error.message : String(error),
      });
    },
    onSettled: (_data, _error, variables) => {
      // A UI não lê chatbot_sessions diretamente; invalidamos as conversas para
      // manter a lista fresca após a ação do operador.
      queryClient.invalidateQueries({ queryKey: ['conversations', tenant?.id] });
      queryClient.invalidateQueries({
        queryKey: ['chatbot-session', variables?.contactId, tenant?.id],
      });
    },
  });
};
