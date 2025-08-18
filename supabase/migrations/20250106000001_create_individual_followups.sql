-- Migração para criar tabela de follow-ups individuais
CREATE TABLE public.individual_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id),
    task TEXT NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    type TEXT NOT NULL CHECK (type IN ('call', 'email', 'whatsapp')),
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    recurring BOOLEAN DEFAULT false,
    recurring_type TEXT CHECK (recurring_type IN ('daily', 'weekly', 'monthly')),
    recurring_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_individual_followups_tenant_id ON public.individual_followups(tenant_id);
CREATE INDEX idx_individual_followups_contact_id ON public.individual_followups(contact_id);
CREATE INDEX idx_individual_followups_due_date ON public.individual_followups(due_date);
CREATE INDEX idx_individual_followups_status ON public.individual_followups(status);
CREATE INDEX idx_individual_followups_priority ON public.individual_followups(priority);

-- Trigger para updated_at
CREATE TRIGGER update_individual_followups_updated_at 
    BEFORE UPDATE ON public.individual_followups 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.individual_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own tenant individual followups" 
    ON public.individual_followups
    FOR ALL 
    USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all individual followups" 
    ON public.individual_followups
    FOR ALL 
    USING (public.is_super_admin());

-- Permissões
GRANT SELECT ON public.individual_followups TO anon;
GRANT ALL PRIVILEGES ON public.individual_followups TO authenticated;

-- Função para estatísticas
CREATE OR REPLACE FUNCTION public.get_followup_stats(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'completed_today', COUNT(*) FILTER (
            WHERE status = 'completed' 
            AND DATE(updated_at) = CURRENT_DATE
        ),
        'overdue', COUNT(*) FILTER (
            WHERE status = 'pending' 
            AND due_date < NOW()
        )
    )
    INTO result
    FROM public.individual_followups
    WHERE tenant_id = p_tenant_id;
    
    RETURN result;
END;
$$;

-- Dados iniciais para teste (apenas se existirem tenants e contatos)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.tenants LIMIT 1) AND EXISTS (SELECT 1 FROM public.contacts LIMIT 1) THEN
        INSERT INTO public.individual_followups (
            tenant_id, 
            contact_id, 
            task, 
            due_date, 
            priority, 
            type, 
            notes
        ) VALUES (
            (SELECT id FROM public.tenants LIMIT 1),
            (SELECT id FROM public.contacts LIMIT 1),
            'Follow-up de teste',
            NOW() + INTERVAL '1 day',
            'medium',
            'call',
            'Este é um follow-up de teste criado durante a migração'
        ) ON CONFLICT DO NOTHING;
    END IF;
END
$$;