/**
 * followup-reply.ts — reply-detection das sequências de follow-up.
 *
 * Quando um contato responde (mensagem inbound), as cadências ativas dele que
 * têm stop_on_reply=true devem parar automaticamente (padrão HubSpot Sequences:
 * auto-pause on reply). Chamado pelos webhooks (Evolution/WAHA/Meta) logo após
 * resolver o contato da mensagem recebida.
 *
 * Não-fatal por design: qualquer falha é apenas logada — nunca deve impedir o
 * processamento normal da mensagem recebida.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function stopSequencesOnReply(
  supabase: SupabaseClient,
  contactId: string,
  logger?: { info?: (m: string, c?: any) => void; warn?: (m: string, c?: any) => void },
): Promise<number> {
  try {
    const { data: enrolls, error } = await supabase
      .from('followup_sequence_enrollments')
      .select('id, sequence_id')
      .eq('contact_id', contactId)
      .eq('status', 'active');

    if (error) {
      logger?.warn?.('stopSequencesOnReply: erro ao buscar inscrições', { error: error.message });
      return 0;
    }
    if (!enrolls || enrolls.length === 0) return 0;

    // Filtra apenas as cadências configuradas para parar na resposta.
    const seqIds = [...new Set(enrolls.map((e: any) => e.sequence_id))];
    const { data: seqs } = await supabase
      .from('followup_sequences')
      .select('id, stop_on_reply')
      .in('id', seqIds);

    const stopSeqIds = new Set(
      (seqs ?? []).filter((s: any) => s.stop_on_reply !== false).map((s: any) => s.id),
    );
    const toStop = enrolls.filter((e: any) => stopSeqIds.has(e.sequence_id)).map((e: any) => e.id);
    if (toStop.length === 0) return 0;

    const { error: updErr } = await supabase
      .from('followup_sequence_enrollments')
      .update({
        status: 'stopped_reply',
        stopped_at: new Date().toISOString(),
        stopped_reason: 'Contato respondeu',
        next_run_at: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', toStop);

    if (updErr) {
      logger?.warn?.('stopSequencesOnReply: erro ao parar inscrições', { error: updErr.message });
      return 0;
    }

    logger?.info?.('Sequências pausadas por resposta do contato', { contactId, count: toStop.length });
    return toStop.length;
  } catch (e: any) {
    logger?.warn?.('stopSequencesOnReply falhou', { error: e?.message });
    return 0;
  }
}
