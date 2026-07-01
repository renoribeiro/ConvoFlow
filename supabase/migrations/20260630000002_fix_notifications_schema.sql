-- =============================================================================
-- Reconciliação do schema de notifications + preferências de notificação
-- =============================================================================
-- Contexto (2026-06-30): a tabela `notifications` tinha sido alterada
-- (tenant_id NOT NULL, sem action_url/metadata, read→is_read), mas o frontend
-- (NotificationCenter) e os 3 criadores de notificação (meta-webhook,
-- policy-watch, chatbot-engine) continuaram usando o formato antigo
-- (user_id-only, com action_url/action_label/metadata). Resultado: TODOS os
-- inserts falhavam silenciosamente e o sino ficava sempre vazio.
--
-- Em vez de reescrever/redeployar os edge functions, reconciliamos a tabela
-- com o que o código já espera: action_url/action_label/metadata de volta e
-- tenant_id opcional (notificações de plataforma, ex.: policy-watch, não têm
-- Conta). As notificações são por USUÁRIO — o RLS por user_id já existe e
-- continua valendo (o sino passa a confiar nele).
-- =============================================================================

BEGIN;

ALTER TABLE public.notifications
  ALTER COLUMN tenant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS action_url   text,
  ADD COLUMN IF NOT EXISTS action_label text,
  ADD COLUMN IF NOT EXISTS metadata     jsonb DEFAULT '{}';

-- Preferências de notificação por usuário (a aba Configurações → Notificações
-- passa a salvar de verdade aqui).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}';

-- Garante o RLS por usuário (o sino confia nele em vez de filtrar por tenant).
-- Idempotente: recria as policies de leitura/atualização das próprias notificações.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
