-- =============================================================================
-- ConvoFlow — aplicar as 2 migrações de SLA (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor do Supabase. É transacional: ou entra tudo,
-- ou não entra nada. Idempotente: rodar duas vezes não quebra.
--
-- Equivale a:
--   supabase/migrations/20260813000001_conversations_sla_mute.sql
--   supabase/migrations/20260813000002_clear_sla_mute_on_inbound.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1/2 — Colunas de silenciamento
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sla_muted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sla_muted_by uuid NULL;

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

CREATE INDEX IF NOT EXISTS idx_conversations_sla_muted
  ON public.conversations (tenant_id)
  WHERE sla_muted_at IS NOT NULL;

COMMENT ON COLUMN public.conversations.sla_muted_at IS
  'Quando preenchido, a conversa foi marcada como "o cliente não vai responder" e fica fora da sinalização de SLA. NULL = sinalizada normalmente. Não arquiva e não altera unread_count.';
COMMENT ON COLUMN public.conversations.sla_muted_by IS
  'Usuário (auth.users.id) que silenciou a sinalização de SLA desta conversa.';

-- ---------------------------------------------------------------------------
-- 2/2 — Trigger limpa o silenciamento quando o cliente volta a escrever
--       (só inbound; outbound da Loja preserva o silenciamento)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.conversations (tenant_id, contact_id, whatsapp_instance_id, last_message_at, unread_count)
  VALUES (NEW.tenant_id, NEW.contact_id, NEW.whatsapp_instance_id, NEW.created_at,
          CASE WHEN NEW.direction IN ('inbound','incoming') THEN 1 ELSE 0 END)
  ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
    last_message_at = NEW.created_at,
    unread_count = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN conversations.unread_count + 1
                        ELSE conversations.unread_count END,
    -- Mensagem do cliente reabre a pendência: volta a sinalizar.
    sla_muted_at = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_at END,
    sla_muted_by = CASE WHEN NEW.direction IN ('inbound','incoming')
                        THEN NULL
                        ELSE conversations.sla_muted_by END,
    updated_at = NOW();
  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.update_conversation_on_message() IS
  'Mantém conversations.last_message_at/unread_count a cada mensagem e limpa o silenciamento de SLA (sla_muted_at/_by) quando a mensagem é do cliente (inbound). Trigger AFTER INSERT em public.messages.';

-- ---------------------------------------------------------------------------
-- 3/3 — Registra as duas no ledger, para o histórico não ficar mais fora de
--       sincronia do que já está.
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260813000001', 'conversations_sla_mute'),
  ('20260813000002', 'clear_sla_mute_on_inbound')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO — rodar depois, deve devolver 3 linhas com "ok"
-- =============================================================================
-- SELECT 'colunas' AS item,
--        count(*)::text || ' de 2' AS valor,
--        CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FALTA' END AS status
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='conversations'
--    AND column_name IN ('sla_muted_at','sla_muted_by')
-- UNION ALL
-- SELECT 'indice', coalesce(max(indexname),'-'),
--        CASE WHEN count(*)=1 THEN 'ok' ELSE 'FALTA' END
--   FROM pg_indexes
--  WHERE schemaname='public' AND indexname='idx_conversations_sla_muted'
-- UNION ALL
-- SELECT 'trigger limpa sla',
--        CASE WHEN pg_get_functiondef(p.oid) LIKE '%sla_muted_at%' THEN 'contem sla_muted_at' ELSE 'versao antiga' END,
--        CASE WHEN pg_get_functiondef(p.oid) LIKE '%sla_muted_at%' THEN 'ok' ELSE 'FALTA' END
--   FROM pg_proc p
--  WHERE p.proname='update_conversation_on_message' AND p.pronamespace='public'::regnamespace;
-- =============================================================================
