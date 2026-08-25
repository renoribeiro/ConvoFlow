-- =============================================================================
-- RECONSTRUÍDA em 2026-08-24 a partir do estado vivo do banco.
-- =============================================================================
-- Esta versão existia no ledger (`20260309221219`) sem nenhum arquivo local.
-- Extraída do catálogo do PostgreSQL em 2026-08-24. NÃO é o texto original.
-- Idempotente: já está aplicada, rodar de novo é no-op.
--
-- `subscriptions` é a tabela da assinatura Stripe por perfil. Em 2026-08-24 ela
-- tinha 0 linhas: o paywall de hoje decide pela RPC `tenant_access_state`
-- (migração 20260818000001), que lê `tenants.subscription_status` e
-- `tenants.manual_access_granted` — não esta tabela. Ela continua no banco e é
-- lida pelo código do Stripe, então o rebuild precisa reproduzi-la.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id             uuid NOT NULL,
  tenant_id              uuid,
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_price_id        text,
  stripe_product_id      text,
  plan_name              text DEFAULT 'free'::text NOT NULL,
  status                 text DEFAULT 'active'::text NOT NULL,
  current_period_start   timestamp with time zone,
  current_period_end     timestamp with time zone,
  cancel_at_period_end   boolean DEFAULT false,
  amount                 integer DEFAULT 0,
  currency               text DEFAULT 'brl'::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status = ANY (ARRAY['active'::text,'past_due'::text,'canceled'::text,'trialing'::text,
                               'incomplete'::text,'incomplete_expired'::text,'paused'::text,'unpaid'::text]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_profile_id             ON public.subscriptions USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status                 ON public.subscriptions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions USING btree (stripe_subscription_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on subscriptions" ON public.subscriptions;
CREATE POLICY "Service role full access on subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT USING (profile_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Super admins can read all subscriptions" ON public.subscriptions;
CREATE POLICY "Super admins can read all subscriptions" ON public.subscriptions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'superadmin'::user_role));
