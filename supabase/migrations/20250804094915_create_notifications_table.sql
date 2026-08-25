-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250804094915`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
--
-- ⚠️ Como no `create_conversations_table`, esta é a forma de HOJE, não a de
-- 2025-08-04. A migração posterior `20260630000002_fix_notifications_schema`
-- afrouxa o NOT NULL de tenant_id e recria as policies — rodando depois desta,
-- num rebuild, o resultado final é o mesmo.
--
-- O único CREATE de `notifications` no repositório estava em
-- `20250103000002_notifications.sql`, arquivado por ser supersedido: aquele
-- arquivo tem a coluna `read`, e a coluna real hoje é `is_read`. Ou seja, a
-- tabela do sino não tinha CREATE em nenhum arquivo executável. Este fecha isso.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id    uuid,
  user_id      uuid,
  title        text NOT NULL,
  message      text NOT NULL,
  type         text DEFAULT 'info'::text NOT NULL,
  is_read      boolean DEFAULT false NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL,
  action_url   text,
  action_label text,
  metadata     jsonb DEFAULT '{}'::jsonb
);

DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY['info'::text,'success'::text,'warning'::text,'error'::text]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id  ON public.notifications USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON public.notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON public.notifications USING btree (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications USING btree (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Par antigo, por Conta. Continua no banco junto com o par novo, por usuário,
-- que a 20260630000002 acrescentou. Policies PERMISSIVE somam: quem passa em
-- qualquer uma das duas lê. Reproduzido como está.
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (tenant_id = public.get_current_user_tenant_id()
                    AND (user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (tenant_id = public.get_current_user_tenant_id()
                    AND (user_id IS NULL OR user_id = auth.uid()));

-- Sem restrição de propósito: quem escreve notificação é a service_role nas
-- Edge Functions e os triggers internos.
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);
