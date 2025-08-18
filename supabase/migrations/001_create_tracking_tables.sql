-- Migração para Sistema de Tracking e UTMs
-- Criação das tabelas: traffic_sources, lead_tracking, tracking_events

-- Tabela para fontes de tráfego
CREATE TABLE traffic_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('organic', 'paid', 'social', 'direct', 'referral', 'email')),
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para tracking de leads
CREATE TABLE lead_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    traffic_source_id UUID REFERENCES traffic_sources(id) ON DELETE SET NULL,
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),
    referrer_url TEXT,
    landing_page TEXT,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    country VARCHAR(100),
    city VARCHAR(100),
    converted BOOLEAN DEFAULT false,
    conversion_date TIMESTAMP WITH TIME ZONE,
    conversion_value DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para eventos de tracking
CREATE TABLE tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_tracking_id UUID REFERENCES lead_tracking(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    page_url TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_traffic_sources_tenant_id ON traffic_sources(tenant_id);
CREATE INDEX idx_traffic_sources_type ON traffic_sources(type);
CREATE INDEX idx_traffic_sources_is_active ON traffic_sources(is_active);

CREATE INDEX idx_lead_tracking_tenant_id ON lead_tracking(tenant_id);
CREATE INDEX idx_lead_tracking_contact_id ON lead_tracking(contact_id);
CREATE INDEX idx_lead_tracking_session_id ON lead_tracking(session_id);
CREATE INDEX idx_lead_tracking_traffic_source_id ON lead_tracking(traffic_source_id);
CREATE INDEX idx_lead_tracking_created_at ON lead_tracking(created_at DESC);
CREATE INDEX idx_lead_tracking_utm_campaign ON lead_tracking(utm_campaign);
CREATE INDEX idx_lead_tracking_converted ON lead_tracking(converted);
CREATE INDEX idx_lead_tracking_conversion_date ON lead_tracking(conversion_date DESC);

CREATE INDEX idx_tracking_events_tenant_id ON tracking_events(tenant_id);
CREATE INDEX idx_tracking_events_lead_tracking_id ON tracking_events(lead_tracking_id);
CREATE INDEX idx_tracking_events_contact_id ON tracking_events(contact_id);
CREATE INDEX idx_tracking_events_event_type ON tracking_events(event_type);
CREATE INDEX idx_tracking_events_timestamp ON tracking_events(timestamp DESC);

-- Trigger para atualização automática do updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_traffic_sources_updated_at 
    BEFORE UPDATE ON traffic_sources 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views materializadas para performance
CREATE MATERIALIZED VIEW tracking_metrics_daily AS
SELECT 
    tenant_id,
    DATE(created_at) as date,
    COUNT(*) as total_leads,
    COUNT(*) FILTER (WHERE converted = true) as conversions,
    ROUND(COUNT(*) FILTER (WHERE converted = true) * 100.0 / NULLIF(COUNT(*), 0), 2) as conversion_rate,
    SUM(COALESCE(conversion_value, 0)) as total_revenue,
    COUNT(DISTINCT traffic_source_id) as unique_sources
FROM lead_tracking
GROUP BY tenant_id, DATE(created_at);

CREATE UNIQUE INDEX idx_tracking_metrics_daily_unique ON tracking_metrics_daily(tenant_id, date);

CREATE MATERIALIZED VIEW campaign_performance_daily AS
SELECT 
    lt.tenant_id,
    lt.utm_campaign,
    DATE(lt.created_at) as date,
    COUNT(*) as leads,
    COUNT(*) FILTER (WHERE lt.converted = true) as conversions,
    ROUND(COUNT(*) FILTER (WHERE lt.converted = true) * 100.0 / NULLIF(COUNT(*), 0), 2) as conversion_rate,
    SUM(COALESCE(lt.conversion_value, 0)) as revenue,
    AVG(lt.conversion_value) FILTER (WHERE lt.converted = true) as avg_order_value
FROM lead_tracking lt
WHERE lt.utm_campaign IS NOT NULL
GROUP BY lt.tenant_id, lt.utm_campaign, DATE(lt.created_at);

CREATE UNIQUE INDEX idx_campaign_performance_daily_unique ON campaign_performance_daily(tenant_id, utm_campaign, date);

-- Função para refresh automático das views
CREATE OR REPLACE FUNCTION refresh_tracking_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY tracking_metrics_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_performance_daily;
END;
$$ LANGUAGE plpgsql;

-- Políticas RLS (Row Level Security)
ALTER TABLE traffic_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

-- Políticas para traffic_sources
CREATE POLICY "Users can view their tenant traffic sources" ON traffic_sources
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant traffic sources" ON traffic_sources
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Políticas para lead_tracking
CREATE POLICY "Users can view their tenant lead tracking" ON lead_tracking
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant lead tracking" ON lead_tracking
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Políticas para tracking_events
CREATE POLICY "Users can view their tenant tracking events" ON tracking_events
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant tracking events" ON tracking_events
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Grants para roles
GRANT SELECT ON traffic_sources TO anon, authenticated;
GRANT ALL ON traffic_sources TO authenticated;

GRANT SELECT ON lead_tracking TO anon, authenticated;
GRANT ALL ON lead_tracking TO authenticated;

GRANT SELECT ON tracking_events TO anon, authenticated;
GRANT ALL ON tracking_events TO authenticated;

GRANT SELECT ON tracking_metrics_daily TO anon, authenticated;
GRANT SELECT ON campaign_performance_daily TO anon, authenticated;

-- Comentários para documentação
COMMENT ON TABLE traffic_sources IS 'Tabela para armazenar fontes de tráfego e parâmetros UTM';
COMMENT ON TABLE lead_tracking IS 'Tabela para rastreamento de leads com informações de origem e conversão';
COMMENT ON TABLE tracking_events IS 'Tabela para eventos de tracking detalhados';
COMMENT ON MATERIALIZED VIEW tracking_metrics_daily IS 'View materializada com métricas diárias de tracking agregadas';
COMMENT ON MATERIALIZED VIEW campaign_performance_daily IS 'View materializada com performance diária de campanhas';