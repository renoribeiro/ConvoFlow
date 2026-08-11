-- =============================================================================
-- coupons: duração do desconto + id do Promotion Code
-- -----------------------------------------------------------------------------
-- A tabela public.coupons (criada em 20250802124822) guardava só o Coupon do
-- Stripe. O Gerenciador de Cupons do superadmin cria DOIS objetos no Stripe:
--   Coupon         → o desconto (percent_off / amount_off + duration)
--   Promotion Code → o texto que o cliente digita no Checkout
-- Estas colunas fecham essa lacuna.
--
-- Idempotente de propósito: o histórico de migrações deste projeto está
-- dessincronizado, então a migração precisa ser segura para rodar de novo.
-- =============================================================================

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT 'once';

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS duration_in_months INTEGER;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT;

-- Espelha os valores aceitos pelo Stripe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coupons_duration_check'
      AND conrelid = 'public.coupons'::regclass
  ) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT coupons_duration_check
      CHECK (duration IN ('once', 'repeating', 'forever'));
  END IF;
END $$;

-- duration_in_months só faz sentido em cupons recorrentes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coupons_duration_in_months_check'
      AND conrelid = 'public.coupons'::regclass
  ) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT coupons_duration_in_months_check
      CHECK (
        (duration = 'repeating' AND duration_in_months IS NOT NULL AND duration_in_months >= 1)
        OR (duration <> 'repeating' AND duration_in_months IS NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_stripe_promotion_code_id
  ON public.coupons (stripe_promotion_code_id)
  WHERE stripe_promotion_code_id IS NOT NULL;

COMMENT ON COLUMN public.coupons.duration IS
  'Duração do desconto no Stripe: once | repeating | forever';
COMMENT ON COLUMN public.coupons.duration_in_months IS
  'Quantidade de meses do desconto — obrigatório quando duration = repeating';
COMMENT ON COLUMN public.coupons.stripe_promotion_code_id IS
  'ID do Promotion Code no Stripe (promo_...) — é o code digitado no Checkout';
