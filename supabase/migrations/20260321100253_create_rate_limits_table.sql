-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20260321100253`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
-- Idempotente: já está aplicada, rodar de novo é no-op.
--
-- Tabela de limite de taxa por chave, usada pelas Edge Functions. RLS ligada e
-- ZERO policies: só a service_role (que ignora RLS) escreve nela. Isso é o
-- desenho correto — nenhum cliente deve ler ou furar o próprio limite.
-- Tinha 3 linhas vivas em 2026-08-24.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id         uuid DEFAULT gen_random_uuid() NOT NULL,
  key        text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires     ON public.rate_limits USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created ON public.rate_limits USING btree (key, created_at DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
