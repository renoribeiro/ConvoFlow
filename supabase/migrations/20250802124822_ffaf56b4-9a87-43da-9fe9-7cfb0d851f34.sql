-- ============================================================================
-- CONVOFLOW SAAS - COMPLETE DATABASE SCHEMA 
-- Multi-tenant WhatsApp Business Platform
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- GROUP 1: CORE MULTI-TENANCY TABLES
-- ============================================================================

-- Enum for tenant status
CREATE TYPE tenant_status AS ENUM ('active', 'inactive', 'trial', 'suspended', 'past_due');

-- Enum for user roles
CREATE TYPE user_role AS ENUM ('super_admin', 'tenant_admin', 'tenant_user');

-- Tenants table (companies/clients)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    domain TEXT,
    status tenant_status DEFAULT 'trial',
    subscription_id TEXT, -- Stripe subscription ID
    subscription_status TEXT,
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Billing info
    plan_type TEXT DEFAULT 'basic',
    max_users INTEGER DEFAULT 1,
    max_whatsapp_instances INTEGER DEFAULT 1,
    -- Affiliate tracking
    affiliate_id UUID REFERENCES public.tenants(id),
    affiliate_code TEXT,
    -- Settings
    settings JSONB DEFAULT '{}'::jsonb
);

-- Profiles table (extends auth.users with tenant info)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role user_role DEFAULT 'tenant_user',
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, tenant_id)
);

-- WhatsApp instances for each tenant
CREATE TABLE public.whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instance_key TEXT UNIQUE NOT NULL, -- Evolution API instance key
    phone_number TEXT,
    status TEXT DEFAULT 'disconnected', -- connected, disconnected, connecting
    qr_code TEXT,
    webhook_url TEXT,
    evolution_api_url TEXT,
    evolution_api_key TEXT,
    profile_name TEXT,
    profile_picture_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- GROUP 2: CRM AND CONTACTS TABLES
-- ============================================================================

-- Lead sources (UTM, keywords, etc.)
CREATE TABLE public.lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'utm', 'keyword', 'manual', 'api'
    parameters JSONB DEFAULT '{}'::jsonb, -- UTM parameters, keywords, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Funnel stages (customizable per tenant)
CREATE TABLE public.funnel_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    "order" INTEGER NOT NULL DEFAULT 0,
    is_final BOOLEAN DEFAULT false, -- marks conversion stages
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts/Leads table
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id),
    phone TEXT NOT NULL,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    -- Lead tracking
    lead_source_id UUID REFERENCES public.lead_sources(id),
    source_details JSONB DEFAULT '{}'::jsonb,
    first_message TEXT,
    -- Funnel position
    current_stage_id UUID REFERENCES public.funnel_stages(id),
    stage_entered_at TIMESTAMPTZ DEFAULT now(),
    -- Contact info
    notes TEXT,
    opt_out_mass_message BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    last_interaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, phone)
);

-- Tags system
CREATE TABLE public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- Contact tags junction table
CREATE TABLE public.contact_tags (
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, tag_id)
);

-- Messages log
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id),
    contact_id UUID NOT NULL REFERENCES public.contacts(id),
    direction TEXT NOT NULL, -- 'inbound', 'outbound'
    message_type TEXT NOT NULL, -- 'text', 'image', 'document', 'audio', 'video'
    content TEXT,
    media_url TEXT,
    evolution_message_id TEXT,
    status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'failed'
    is_from_bot BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- GROUP 3: AUTOMATION TABLES
-- ============================================================================

-- Chatbots rules
CREATE TABLE public.chatbots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id),
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'keyword', -- 'keyword', 'first_message', 'time_based'
    trigger_phrases TEXT[] DEFAULT '{}',
    response_message TEXT NOT NULL,
    response_type TEXT DEFAULT 'text', -- 'text', 'media', 'template'
    media_url TEXT,
    variables JSONB DEFAULT '{}'::jsonb,
    conditions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mass message campaigns
CREATE TABLE public.mass_message_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id),
    name TEXT NOT NULL,
    description TEXT,
    target_tags UUID[] DEFAULT '{}', -- Array of tag IDs
    target_stages UUID[] DEFAULT '{}', -- Array of stage IDs
    message_template TEXT NOT NULL,
    media_url TEXT,
    status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'completed', 'failed'
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    delay_between_messages INTEGER DEFAULT 30, -- seconds
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign message variations (Spintax)
CREATE TABLE public.campaign_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    weight INTEGER DEFAULT 1, -- for random selection
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign dispatch queue
CREATE TABLE public.campaign_dispatch_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Follow-up sequences
CREATE TABLE public.follow_up_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id),
    funnel_stage_id UUID NOT NULL REFERENCES public.funnel_stages(id),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Follow-up steps
CREATE TABLE public.follow_up_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
    "order" INTEGER NOT NULL,
    delay_hours INTEGER NOT NULL,
    message_text TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    media_url TEXT,
    conditions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- GROUP 4: SUPER ADMIN TABLES
-- ============================================================================

-- Affiliates program
CREATE TABLE public.affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    affiliate_code TEXT UNIQUE NOT NULL,
    stripe_account_id TEXT, -- Stripe Connect account
    commission_rate_first_month DECIMAL(5,2) DEFAULT 30.00,
    commission_rate_recurring DECIMAL(5,2) DEFAULT 10.00,
    is_active BOOLEAN DEFAULT true,
    total_referrals INTEGER DEFAULT 0,
    total_commission DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Affiliate referrals tracking
CREATE TABLE public.affiliate_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    referral_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_payment_date TIMESTAMPTZ,
    total_commission_paid DECIMAL(10,2) DEFAULT 0.00,
    status TEXT DEFAULT 'pending', -- 'pending', 'active', 'cancelled'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Discount coupons
CREATE TABLE public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    stripe_coupon_id TEXT UNIQUE,
    discount_type TEXT NOT NULL, -- 'percent', 'amount'
    discount_value DECIMAL(10,2) NOT NULL,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    valid_from TIMESTAMPTZ DEFAULT now(),
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scheduled reports
CREATE TABLE public.scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    report_type TEXT NOT NULL, -- 'contacts', 'messages', 'campaigns', 'conversion'
    frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
    recipients TEXT[] DEFAULT '{}',
    parameters JSONB DEFAULT '{}'::jsonb,
    last_sent_at TIMESTAMPTZ,
    next_send_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Multi-tenant indexes
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_whatsapp_instances_tenant_id ON public.whatsapp_instances(tenant_id);
CREATE INDEX idx_contacts_tenant_id ON public.contacts(tenant_id);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_messages_tenant_id ON public.messages(tenant_id);
CREATE INDEX idx_messages_contact_id ON public.messages(contact_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_chatbots_tenant_id ON public.chatbots(tenant_id);
CREATE INDEX idx_campaigns_tenant_id ON public.mass_message_campaigns(tenant_id);
CREATE INDEX idx_campaign_queue_status ON public.campaign_dispatch_queue(status);
CREATE INDEX idx_campaign_queue_scheduled_at ON public.campaign_dispatch_queue(scheduled_at);
CREATE INDEX idx_funnel_stages_tenant_id ON public.funnel_stages(tenant_id);
CREATE INDEX idx_lead_sources_tenant_id ON public.lead_sources(tenant_id);
CREATE INDEX idx_tags_tenant_id ON public.tags(tenant_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_instances_updated_at
    BEFORE UPDATE ON public.whatsapp_instances
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chatbots_updated_at
    BEFORE UPDATE ON public.chatbots
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON public.mass_message_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_follow_up_sequences_updated_at
    BEFORE UPDATE ON public.follow_up_sequences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_affiliates_updated_at
    BEFORE UPDATE ON public.affiliates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coupons_updated_at
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scheduled_reports_updated_at
    BEFORE UPDATE ON public.scheduled_reports
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tenant-specific tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_message_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_dispatch_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;