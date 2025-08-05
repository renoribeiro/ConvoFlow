-- Enable Row Level Security on all tables that don't have it
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_dispatch_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_message_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get current user's tenant_id
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create security definer function to get current user's role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create security definer function to check if current user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT public.get_current_user_role() = 'super_admin';
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Profiles table policies
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all profiles" ON public.profiles
FOR SELECT USING (public.is_super_admin());

-- Tenants table policies
CREATE POLICY "Users can view own tenant" ON public.tenants
FOR SELECT USING (id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can view all tenants" ON public.tenants
FOR SELECT USING (public.is_super_admin());

CREATE POLICY "Super admins can manage all tenants" ON public.tenants
FOR ALL USING (public.is_super_admin());

-- Tenant-specific tables policies (contacts, messages, etc.)
CREATE POLICY "Users can access own tenant contacts" ON public.contacts
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all contacts" ON public.contacts
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant messages" ON public.messages
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all messages" ON public.messages
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant chatbots" ON public.chatbots
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all chatbots" ON public.chatbots
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant whatsapp instances" ON public.whatsapp_instances
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all whatsapp instances" ON public.whatsapp_instances
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant funnel stages" ON public.funnel_stages
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all funnel stages" ON public.funnel_stages
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant lead sources" ON public.lead_sources
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all lead sources" ON public.lead_sources
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant tags" ON public.tags
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all tags" ON public.tags
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant contact tags" ON public.contact_tags
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.contacts c 
    WHERE c.id = contact_id AND c.tenant_id = public.get_current_user_tenant_id()
  )
);

CREATE POLICY "Super admins can access all contact tags" ON public.contact_tags
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant campaigns" ON public.mass_message_campaigns
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all campaigns" ON public.mass_message_campaigns
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant campaign messages" ON public.campaign_messages
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.mass_message_campaigns c 
    WHERE c.id = campaign_id AND c.tenant_id = public.get_current_user_tenant_id()
  )
);

CREATE POLICY "Super admins can access all campaign messages" ON public.campaign_messages
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant campaign dispatch queue" ON public.campaign_dispatch_queue
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.mass_message_campaigns c 
    WHERE c.id = campaign_id AND c.tenant_id = public.get_current_user_tenant_id()
  )
);

CREATE POLICY "Super admins can access all campaign dispatch queue" ON public.campaign_dispatch_queue
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant follow up sequences" ON public.follow_up_sequences
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all follow up sequences" ON public.follow_up_sequences
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant follow up steps" ON public.follow_up_steps
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.follow_up_sequences s 
    WHERE s.id = sequence_id AND s.tenant_id = public.get_current_user_tenant_id()
  )
);

CREATE POLICY "Super admins can access all follow up steps" ON public.follow_up_steps
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant scheduled reports" ON public.scheduled_reports
FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all scheduled reports" ON public.scheduled_reports
FOR ALL USING (public.is_super_admin());

-- Super admin only tables
CREATE POLICY "Only super admins can access affiliates" ON public.affiliates
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Only super admins can access affiliate referrals" ON public.affiliate_referrals
FOR ALL USING (public.is_super_admin());

CREATE POLICY "Only super admins can access coupons" ON public.coupons
FOR ALL USING (public.is_super_admin());

-- Function to automatically create user profile after signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, role, tenant_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    'tenant_user'::user_role,
    -- For now, assign to a default tenant - this should be updated based on your business logic
    (SELECT id FROM public.tenants LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();