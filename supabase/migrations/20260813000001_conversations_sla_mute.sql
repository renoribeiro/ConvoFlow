-- =============================================================================
-- Sinalização de SLA — silenciar conversa: conversations.sla_muted_at/_by
-- =============================================================================
-- Suporte à feature "Sinalização de conversas não respondidas" (opt-in por Loja,
-- ligada em Configurações → Atendimento → settings.sla.enabled).
--
-- Quando o atendente marca "Cliente não vai responder", a conversa deixa de ser
-- sinalizada como pendente — sem arquivar e sem mexer em unread_count. É só um
-- carimbo: quem marcou e quando. Reverter é setar as duas colunas de volta para
-- NULL.
--
-- Por que colunas e não uma tabela nova: `conversations` já é a linha que a
-- lista lê, o estado é 1:1 com a conversa e o filtro é sempre "está silenciada
-- ou não". Uma tabela de eventos custaria um join em cada render da lista.
--
-- NÃO existe coluna `status` aqui e esta migration não cria nenhuma: o nível de
-- atendimento continua sendo DERIVADO no cliente (src/components/conversations/
-- conversationGroups.ts + slaLevels.ts).
--
-- POLICIES: nenhuma nova é necessária. O RLS de public.conversations é por
-- linha e por Conta —
--   "Users can view conversations from their tenant"   (SELECT)
--   "Users can update conversations from their tenant" (UPDATE)
-- ambas com `tenant_id IN (SELECT tenant_id FROM profiles WHERE user_id =
-- auth.uid())`. Colunas novas herdam essas policies, e o GRANT de UPDATE já é no
-- nível da tabela (não há grants por coluna em conversations). Ou seja: ninguém
-- silencia conversa de outra Conta.
--
-- Idempotente de propósito — o histórico de migrations deste projeto está
-- dessincronizado e esta pode rodar depois de já ter sido aplicada à mão.
-- =============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sla_muted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sla_muted_by uuid NULL;

-- FK separada do ADD COLUMN para continuar idempotente em bases que já têm as
-- colunas mas ainda não a constraint. ON DELETE SET NULL: perder o usuário que
-- silenciou não pode "dessilenciar" a conversa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_sla_muted_by_fkey'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_sla_muted_by_fkey
      FOREIGN KEY (sla_muted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A lista busca só as conversas silenciadas da Conta (são poucas — cada uma é um
-- clique manual). Índice parcial: ocupa quase nada e não pesa nos INSERTs de
-- conversa nova, que nascem com sla_muted_at NULL.
CREATE INDEX IF NOT EXISTS idx_conversations_sla_muted
  ON public.conversations (tenant_id)
  WHERE sla_muted_at IS NOT NULL;

COMMENT ON COLUMN public.conversations.sla_muted_at IS
  'Quando preenchido, a conversa foi marcada como "o cliente não vai responder" e fica fora da sinalização de SLA. NULL = sinalizada normalmente. Não arquiva e não altera unread_count.';
COMMENT ON COLUMN public.conversations.sla_muted_by IS
  'Usuário (auth.users.id) que silenciou a sinalização de SLA desta conversa.';

-- =============================================================================
-- ROLLBACK
--   DROP INDEX IF EXISTS public.idx_conversations_sla_muted;
--   ALTER TABLE public.conversations
--     DROP CONSTRAINT IF EXISTS conversations_sla_muted_by_fkey,
--     DROP COLUMN IF EXISTS sla_muted_by,
--     DROP COLUMN IF EXISTS sla_muted_at;
-- =============================================================================
