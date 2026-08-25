-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20250804093819`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
--
-- ⚠️ ATENÇÃO AO LER: este arquivo NÃO é a forma que a tabela tinha em
-- 2025-08-04. É a forma que ela tem HOJE. Não dá para recuperar o formato
-- original — o catálogo só guarda o estado atual.
--
-- Consequência prática: num rebuild do zero, este CREATE já traz colunas que
-- migrações posteriores acrescentariam de novo. Elas usam ADD COLUMN IF NOT
-- EXISTS, então viram no-op e o resultado final é o mesmo. As posteriores são:
--   20260813000001_conversations_sla_mute        → sla_muted_at, sla_muted_by
--   20260817000001_conversations_last_message_denorm → last_message_*
--
-- Antes disto, o único CREATE de `conversations` no repositório estava dentro de
-- `20250109000001_fix_chatbots_schema.sql`, que foi arquivado por ser perigosa
-- (ela apaga seis colunas de `chatbots`). Ou seja: a tabela central de Conversas
-- não tinha CREATE em nenhum arquivo executável. Este arquivo fecha isso.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id                     uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id              uuid NOT NULL,
  contact_id             uuid NOT NULL,
  whatsapp_instance_id   uuid,
  last_message_at        timestamp with time zone DEFAULT now(),
  unread_count           integer DEFAULT 0,
  is_archived            boolean DEFAULT false,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  sla_muted_at           timestamp with time zone,
  sla_muted_by           uuid,
  last_message_content   text,
  last_message_direction text,
  last_message_status    text,
  last_message_type      text
);

DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;

-- Esta UNIQUE é o que faz o ON CONFLICT de `update_conversation_on_message`
-- funcionar (migração 20260817000003). Note que ela NÃO inclui
-- whatsapp_instance_id: duas instâncias no mesmo contato compartilham a mesma
-- conversa. É um defeito conhecido, registrado e adiado de propósito.
DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_tenant_id_contact_id_key UNIQUE (tenant_id, contact_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_whatsapp_instance_id_fkey
    FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_sla_muted_by_fkey
    FOREIGN KEY (sla_muted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_last_message_direction_check
    CHECK (last_message_direction IS NULL OR last_message_direction = ANY (ARRAY['inbound'::text,'outbound'::text]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id       ON public.conversations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id      ON public.conversations USING btree (contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations USING btree (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_sla_muted       ON public.conversations USING btree (tenant_id) WHERE (sla_muted_at IS NOT NULL);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Não existe policy de superadmin aqui, e isso é PROPOSITAL: privacidade.
-- Superadmin não lê Conversas nem da própria Loja. Não "conserte" isto.
-- As quatro usam a subquery direta em `profiles`, e não o helper
-- get_current_user_tenant_id(). Reproduzido exatamente como está no banco.
DROP POLICY IF EXISTS "Users can view conversations from their tenant" ON public.conversations;
CREATE POLICY "Users can view conversations from their tenant" ON public.conversations
  FOR SELECT USING (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert conversations for their tenant" ON public.conversations;
CREATE POLICY "Users can insert conversations for their tenant" ON public.conversations
  FOR INSERT WITH CHECK (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update conversations from their tenant" ON public.conversations;
CREATE POLICY "Users can update conversations from their tenant" ON public.conversations
  FOR UPDATE USING (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete conversations from their tenant" ON public.conversations;
CREATE POLICY "Users can delete conversations from their tenant" ON public.conversations
  FOR DELETE USING (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.user_id = auth.uid()));
