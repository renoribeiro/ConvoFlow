-- Migration: Stripe Integration and Commission Payments
-- Created: 2025-01-03
-- Description: Adds tables for Stripe integration and commission payment processing

-- Stripe configuration table
CREATE TABLE IF NOT EXISTS public.stripe_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publishable_key TEXT NOT NULL,
    secret_key TEXT NOT NULL, -- This should be encrypted in production
    webhook_secret TEXT,
    connect_client_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commission payments table
CREATE TABLE IF NOT EXISTS public.commission_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'pending',
    stripe_transfer_id TEXT,
    stripe_payout_id TEXT,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ,
    
    CONSTRAINT valid_payment_status CHECK (
        status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')
    ),
    CONSTRAINT valid_currency CHECK (
        currency IN ('BRL', 'USD', 'EUR')
    ),
    CONSTRAINT positive_amount CHECK (amount > 0)
);

-- Stripe webhooks log table
CREATE TABLE IF NOT EXISTS public.stripe_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    payload JSONB NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Commission calculation history
CREATE TABLE IF NOT EXISTS public.commission_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    referral_id UUID REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
    calculation_type TEXT NOT NULL, -- 'first_month', 'recurring', 'bonus'
    base_amount DECIMAL(10,2) NOT NULL,
    commission_rate DECIMAL(5,4) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    payment_id UUID REFERENCES public.commission_payments(id),
    billing_period_start DATE,
    billing_period_end DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT valid_calculation_type CHECK (
        calculation_type IN ('first_month', 'recurring', 'bonus', 'adjustment')
    )
);

-- Affiliate Stripe Connect accounts
CREATE TABLE IF NOT EXISTS public.affiliate_stripe_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    stripe_account_id TEXT NOT NULL UNIQUE,
    account_status TEXT NOT NULL DEFAULT 'pending',
    charges_enabled BOOLEAN NOT NULL DEFAULT false,
    payouts_enabled BOOLEAN NOT NULL DEFAULT false,
    details_submitted BOOLEAN NOT NULL DEFAULT false,
    requirements JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT valid_account_status CHECK (
        account_status IN ('pending', 'restricted', 'enabled', 'disabled')
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_payments_affiliate_id ON public.commission_payments(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_status ON public.commission_payments(status);
CREATE INDEX IF NOT EXISTS idx_commission_payments_created_at ON public.commission_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_commission_payments_stripe_transfer_id ON public.commission_payments(stripe_transfer_id);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_logs_event_id ON public.stripe_webhook_logs(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_logs_processed ON public.stripe_webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_logs_event_type ON public.stripe_webhook_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_commission_calculations_affiliate_id ON public.commission_calculations(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commission_calculations_payment_id ON public.commission_calculations(payment_id);
CREATE INDEX IF NOT EXISTS idx_commission_calculations_type ON public.commission_calculations(calculation_type);

CREATE INDEX IF NOT EXISTS idx_affiliate_stripe_accounts_affiliate_id ON public.affiliate_stripe_accounts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_stripe_accounts_stripe_id ON public.affiliate_stripe_accounts(stripe_account_id);

-- RLS (Row Level Security) policies
ALTER TABLE public.stripe_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Policies for super admin access
CREATE POLICY "Super admin can manage stripe config" ON public.stripe_config
    FOR ALL USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Super admin can manage commission payments" ON public.commission_payments
    FOR ALL USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Super admin can view webhook logs" ON public.stripe_webhook_logs
    FOR SELECT USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Super admin can manage commission calculations" ON public.commission_calculations
    FOR ALL USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Super admin can manage affiliate stripe accounts" ON public.affiliate_stripe_accounts
    FOR ALL USING (auth.jwt() ->> 'role' = 'super_admin');

-- Policies for affiliates to view their own data
CREATE POLICY "Affiliates can view their commission payments" ON public.commission_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.affiliates 
            WHERE affiliates.id = commission_payments.affiliate_id 
            AND affiliates.email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY "Affiliates can view their commission calculations" ON public.commission_calculations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.affiliates 
            WHERE affiliates.id = commission_calculations.affiliate_id 
            AND affiliates.email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY "Affiliates can view their stripe accounts" ON public.affiliate_stripe_accounts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.affiliates 
            WHERE affiliates.id = affiliate_stripe_accounts.affiliate_id 
            AND affiliates.email = auth.jwt() ->> 'email'
        )
    );

-- Functions for automatic calculations
CREATE OR REPLACE FUNCTION calculate_affiliate_commission(
    p_affiliate_id UUID,
    p_base_amount DECIMAL,
    p_calculation_type TEXT,
    p_billing_period_start DATE DEFAULT NULL,
    p_billing_period_end DATE DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_affiliate_record RECORD;
    v_commission_rate DECIMAL(5,4);
    v_commission_amount DECIMAL(10,2);
    v_calculation_id UUID;
    v_payment_id UUID;
BEGIN
    -- Get affiliate information
    SELECT * INTO v_affiliate_record 
    FROM public.affiliates 
    WHERE id = p_affiliate_id AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Affiliate not found or inactive';
    END IF;
    
    -- Determine commission rate based on calculation type
    CASE p_calculation_type
        WHEN 'first_month' THEN
            v_commission_rate := v_affiliate_record.commission_rate_first_month;
        WHEN 'recurring' THEN
            v_commission_rate := v_affiliate_record.commission_rate_recurring;
        ELSE
            RAISE EXCEPTION 'Invalid calculation type';
    END CASE;
    
    -- Calculate commission amount
    v_commission_amount := p_base_amount * v_commission_rate;
    
    -- Create commission calculation record
    INSERT INTO public.commission_calculations (
        affiliate_id,
        calculation_type,
        base_amount,
        commission_rate,
        commission_amount,
        billing_period_start,
        billing_period_end
    ) VALUES (
        p_affiliate_id,
        p_calculation_type,
        p_base_amount,
        v_commission_rate,
        v_commission_amount,
        p_billing_period_start,
        p_billing_period_end
    ) RETURNING id INTO v_calculation_id;
    
    -- Create or update commission payment
    INSERT INTO public.commission_payments (
        affiliate_id,
        amount,
        description
    ) VALUES (
        p_affiliate_id,
        v_commission_amount,
        'Commission for ' || p_calculation_type || ' - Period: ' || 
        COALESCE(p_billing_period_start::TEXT, 'N/A') || ' to ' || 
        COALESCE(p_billing_period_end::TEXT, 'N/A')
    ) RETURNING id INTO v_payment_id;
    
    -- Link calculation to payment
    UPDATE public.commission_calculations 
    SET payment_id = v_payment_id 
    WHERE id = v_calculation_id;
    
    RETURN v_calculation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update affiliate totals
CREATE OR REPLACE FUNCTION update_affiliate_totals(p_affiliate_id UUID) RETURNS VOID AS $$
DECLARE
    v_total_commission DECIMAL(10,2);
    v_total_referrals INTEGER;
BEGIN
    -- Calculate total commission from paid payments
    SELECT COALESCE(SUM(amount), 0) INTO v_total_commission
    FROM public.commission_payments
    WHERE affiliate_id = p_affiliate_id AND status = 'paid';
    
    -- Calculate total referrals
    SELECT COUNT(*) INTO v_total_referrals
    FROM public.affiliate_referrals
    WHERE affiliate_id = p_affiliate_id;
    
    -- Update affiliate record
    UPDATE public.affiliates
    SET 
        total_commission = v_total_commission,
        total_referrals = v_total_referrals,
        updated_at = now()
    WHERE id = p_affiliate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update affiliate totals when payments change
CREATE OR REPLACE FUNCTION trigger_update_affiliate_totals() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM update_affiliate_totals(NEW.affiliate_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM update_affiliate_totals(OLD.affiliate_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_commission_payments_update_totals
    AFTER INSERT OR UPDATE OR DELETE ON public.commission_payments
    FOR EACH ROW EXECUTE FUNCTION trigger_update_affiliate_totals();

-- Insert sample data for testing (optional)
INSERT INTO public.commission_payments (affiliate_id, amount, status, description, created_at)
SELECT 
    a.id,
    ROUND((RANDOM() * 500 + 50)::NUMERIC, 2),
    CASE 
        WHEN RANDOM() < 0.3 THEN 'pending'
        WHEN RANDOM() < 0.7 THEN 'paid'
        ELSE 'processing'
    END,
    'Sample commission payment',
    NOW() - (RANDOM() * INTERVAL '30 days')
FROM public.affiliates a
WHERE EXISTS (SELECT 1 FROM public.affiliates LIMIT 1)
LIMIT 10;

COMMIT;