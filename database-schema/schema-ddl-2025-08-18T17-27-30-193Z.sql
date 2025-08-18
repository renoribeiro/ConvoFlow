-- ConvoFlow Database Schema Export
-- Generated at: 2025-08-18T17:27:30.812Z
-- Database: https://pqjkuwyshybxldzpfbbs.supabase.co

-- Migration: 001_create_tracking_tables.sql
-- Size: 7702 bytes
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

-- Migration: 002_create_reports_tables.sql
-- Size: 10738 bytes
-- Migração para Sistema de Relatórios
-- Criação das tabelas: report_templates, report_data, metrics_cache

-- Tabela para templates de relatórios
CREATE TABLE report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    type VARCHAR(50) CHECK (type IN ('chart', 'table', 'metric', 'dashboard')),
    config JSONB NOT NULL DEFAULT '{}',
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para dados de relatórios gerados
CREATE TABLE report_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id UUID REFERENCES report_templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('generating', 'generated', 'failed', 'expired')),
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Tabela para cache de métricas
CREATE TABLE metrics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_key VARCHAR(255) NOT NULL,
    metric_value JSONB NOT NULL DEFAULT '{}',
    time_range VARCHAR(50),
    filters JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Tabela para histórico de execução de relatórios
CREATE TABLE report_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id UUID REFERENCES report_templates(id) ON DELETE CASCADE,
    executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    execution_time INTEGER, -- em milissegundos
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'timeout')),
    error_message TEXT,
    parameters JSONB DEFAULT '{}',
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para agendamento de relatórios
CREATE TABLE report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id UUID REFERENCES report_templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cron_expression VARCHAR(100) NOT NULL,
    recipients JSONB DEFAULT '[]', -- array de emails
    parameters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_run TIMESTAMP WITH TIME ZONE,
    next_run TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_report_templates_tenant_id ON report_templates(tenant_id);
CREATE INDEX idx_report_templates_category ON report_templates(category);
CREATE INDEX idx_report_templates_type ON report_templates(type);
CREATE INDEX idx_report_templates_created_by ON report_templates(created_by);
CREATE INDEX idx_report_templates_usage_count ON report_templates(usage_count DESC);

CREATE INDEX idx_report_data_tenant_id ON report_data(tenant_id);
CREATE INDEX idx_report_data_template_id ON report_data(template_id);
CREATE INDEX idx_report_data_status ON report_data(status);
CREATE INDEX idx_report_data_generated_at ON report_data(generated_at DESC);
CREATE INDEX idx_report_data_expires_at ON report_data(expires_at);

CREATE INDEX idx_metrics_cache_tenant_id ON metrics_cache(tenant_id);
CREATE INDEX idx_metrics_cache_key ON metrics_cache(metric_key);
CREATE INDEX idx_metrics_cache_expires_at ON metrics_cache(expires_at);
CREATE INDEX idx_metrics_cache_time_range ON metrics_cache(time_range);

CREATE INDEX idx_report_executions_tenant_id ON report_executions(tenant_id);
CREATE INDEX idx_report_executions_template_id ON report_executions(template_id);
CREATE INDEX idx_report_executions_executed_at ON report_executions(executed_at DESC);
CREATE INDEX idx_report_executions_status ON report_executions(status);

CREATE INDEX idx_report_schedules_tenant_id ON report_schedules(tenant_id);
CREATE INDEX idx_report_schedules_template_id ON report_schedules(template_id);
CREATE INDEX idx_report_schedules_is_active ON report_schedules(is_active);
CREATE INDEX idx_report_schedules_next_run ON report_schedules(next_run);

-- Triggers para atualização automática
CREATE TRIGGER update_report_templates_updated_at 
    BEFORE UPDATE ON report_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_report_schedules_updated_at 
    BEFORE UPDATE ON report_schedules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para incrementar usage_count
CREATE OR REPLACE FUNCTION increment_template_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE report_templates 
    SET usage_count = usage_count + 1 
    WHERE id = NEW.template_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_template_usage_trigger
    AFTER INSERT ON report_data
    FOR EACH ROW EXECUTE FUNCTION increment_template_usage();

-- Função para limpeza automática de cache expirado
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM metrics_cache WHERE expires_at < NOW();
    DELETE FROM report_data WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- View para estatísticas de relatórios
CREATE VIEW report_statistics AS
SELECT 
    rt.tenant_id,
    rt.id as template_id,
    rt.name as template_name,
    rt.category,
    rt.type,
    rt.usage_count,
    COUNT(rd.id) as total_executions,
    COUNT(rd.id) FILTER (WHERE rd.status = 'generated') as successful_executions,
    COUNT(rd.id) FILTER (WHERE rd.status = 'failed') as failed_executions,
    AVG(re.execution_time) as avg_execution_time,
    MAX(rd.generated_at) as last_execution
FROM report_templates rt
LEFT JOIN report_data rd ON rt.id = rd.template_id
LEFT JOIN report_executions re ON rt.id = re.template_id AND re.status = 'success'
GROUP BY rt.tenant_id, rt.id, rt.name, rt.category, rt.type, rt.usage_count;

-- View materializada para métricas de performance de relatórios
CREATE MATERIALIZED VIEW report_performance_daily AS
SELECT 
    tenant_id,
    DATE(generated_at) as date,
    COUNT(*) as total_reports,
    COUNT(*) FILTER (WHERE status = 'generated') as successful_reports,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_reports,
    ROUND(COUNT(*) FILTER (WHERE status = 'generated') * 100.0 / NULLIF(COUNT(*), 0), 2) as success_rate
FROM report_data
GROUP BY tenant_id, DATE(generated_at);

CREATE UNIQUE INDEX idx_report_performance_daily_unique ON report_performance_daily(tenant_id, date);

-- Políticas RLS (Row Level Security)
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

-- Políticas para report_templates
CREATE POLICY "Users can view their tenant report templates" ON report_templates
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id() OR is_public = true);

CREATE POLICY "Users can manage their tenant report templates" ON report_templates
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Políticas para report_data
CREATE POLICY "Users can view their tenant report data" ON report_data
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant report data" ON report_data
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Políticas para metrics_cache
CREATE POLICY "Users can view their tenant metrics cache" ON metrics_cache
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant metrics cache" ON metrics_cache
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Políticas para report_executions
CREATE POLICY "Users can view their tenant report executions" ON report_executions
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant report executions" ON report_executions
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Políticas para report_schedules
CREATE POLICY "Users can view their tenant report schedules" ON report_schedules
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant report schedules" ON report_schedules
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Grants para roles
GRANT SELECT ON report_templates TO anon, authenticated;
GRANT ALL ON report_templates TO authenticated;

GRANT SELECT ON report_data TO anon, authenticated;
GRANT ALL ON report_data TO authenticated;

GRANT SELECT ON metrics_cache TO anon, authenticated;
GRANT ALL ON metrics_cache TO authenticated;

GRANT SELECT ON report_executions TO anon, authenticated;
GRANT ALL ON report_executions TO authenticated;

GRANT SELECT ON report_schedules TO anon, authenticated;
GRANT ALL ON report_schedules TO authenticated;

GRANT SELECT ON report_statistics TO anon, authenticated;
GRANT SELECT ON report_performance_daily TO anon, authenticated;

-- Comentários para documentação
COMMENT ON TABLE report_templates IS 'Tabela para armazenar templates de relatórios personalizáveis';
COMMENT ON TABLE report_data IS 'Tabela para armazenar dados de relatórios gerados';
COMMENT ON TABLE metrics_cache IS 'Tabela para cache de métricas calculadas';
COMMENT ON TABLE report_executions IS 'Tabela para histórico de execução de relatórios';
COMMENT ON TABLE report_schedules IS 'Tabela para agendamento automático de relatórios';
COMMENT ON VIEW report_statistics IS 'View com estatísticas de uso dos templates de relatórios';
COMMENT ON MATERIALIZED VIEW report_performance_daily IS 'View materializada com métricas diárias de performance dos relatórios';

-- Migration: 003_create_monitoring_tables.sql
-- Size: 16083 bytes
-- Migração para Sistema de Monitoramento
-- Criação das tabelas: system_metrics, service_status, system_alerts

-- Tabela para métricas do sistema
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    unit VARCHAR(20) DEFAULT 'count',
    dimensions JSONB DEFAULT '{}',
    status VARCHAR(50) CHECK (status IN ('good', 'warning', 'critical')),
    threshold_value DECIMAL(15,4),
    description TEXT,
    service_name VARCHAR(100),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para status de serviços
CREATE TABLE service_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')) DEFAULT 'unknown',
    uptime DECIMAL(5,2),
    response_time DECIMAL(8,2), -- em milissegundos
    error_count INTEGER DEFAULT 0,
    health_data JSONB DEFAULT '{}',
    last_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    endpoint_url VARCHAR(500),
    version VARCHAR(50),
    dependencies JSONB DEFAULT '[]'
);

-- Tabela para alertas do sistema
CREATE TABLE system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    service_name VARCHAR(255),
    metric_name VARCHAR(255),
    current_value DECIMAL(15,4),
    threshold_value DECIMAL(15,4),
    metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    escalated BOOLEAN DEFAULT false,
    escalated_at TIMESTAMP WITH TIME ZONE
);

-- Tabela para configuração de alertas
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_name VARCHAR(255) NOT NULL,
    condition_operator VARCHAR(10) CHECK (condition_operator IN ('>', '<', '>=', '<=', '=', '!=')),
    threshold_value DECIMAL(15,4) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    evaluation_window INTEGER DEFAULT 300, -- em segundos
    cooldown_period INTEGER DEFAULT 900, -- em segundos
    is_active BOOLEAN DEFAULT true,
    notification_channels JSONB DEFAULT '[]', -- email, slack, webhook, etc
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para histórico de performance
CREATE TABLE performance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    metric_type VARCHAR(100) NOT NULL, -- cpu, memory, disk, network, response_time, etc
    value DECIMAL(10,4) NOT NULL,
    unit VARCHAR(20) DEFAULT 'percent',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    additional_data JSONB DEFAULT '{}'
);

-- Tabela para logs de sistema
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(20) CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    message TEXT NOT NULL,
    service_name VARCHAR(255),
    component VARCHAR(100),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    stack_trace TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_system_metrics_metric_name ON system_metrics(metric_name);
CREATE INDEX idx_system_metrics_recorded_at ON system_metrics(recorded_at DESC);
CREATE INDEX idx_system_metrics_status ON system_metrics(status);
CREATE INDEX idx_system_metrics_service_name ON system_metrics(service_name);

CREATE INDEX idx_service_status_service_name ON service_status(service_name);
CREATE INDEX idx_service_status_status ON service_status(status);
CREATE INDEX idx_service_status_last_check ON service_status(last_check DESC);

CREATE INDEX idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX idx_system_alerts_status ON system_alerts(status);
CREATE INDEX idx_system_alerts_triggered_at ON system_alerts(triggered_at DESC);
CREATE INDEX idx_system_alerts_service_name ON system_alerts(service_name);
CREATE INDEX idx_system_alerts_alert_type ON system_alerts(alert_type);

CREATE INDEX idx_alert_rules_metric_name ON alert_rules(metric_name);
CREATE INDEX idx_alert_rules_is_active ON alert_rules(is_active);

CREATE INDEX idx_performance_history_service_name ON performance_history(service_name);
CREATE INDEX idx_performance_history_metric_type ON performance_history(metric_type);
CREATE INDEX idx_performance_history_timestamp ON performance_history(timestamp DESC);

CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_service_name ON system_logs(service_name);
CREATE INDEX idx_system_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX idx_system_logs_user_id ON system_logs(user_id);

-- Trigger para atualização automática
CREATE TRIGGER update_alert_rules_updated_at 
    BEFORE UPDATE ON alert_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para avaliar regras de alerta
CREATE OR REPLACE FUNCTION evaluate_alert_rules()
RETURNS void AS $$
DECLARE
    rule_record RECORD;
    metric_record RECORD;
    should_alert BOOLEAN;
BEGIN
    FOR rule_record IN 
        SELECT * FROM alert_rules WHERE is_active = true
    LOOP
        -- Buscar a métrica mais recente
        SELECT * INTO metric_record 
        FROM system_metrics 
        WHERE metric_name = rule_record.metric_name 
        AND recorded_at > NOW() - INTERVAL '1 hour'
        ORDER BY recorded_at DESC 
        LIMIT 1;
        
        IF metric_record IS NOT NULL THEN
            -- Avaliar condição
            should_alert := CASE rule_record.condition_operator
                WHEN '>' THEN metric_record.metric_value > rule_record.threshold_value
                WHEN '<' THEN metric_record.metric_value < rule_record.threshold_value
                WHEN '>=' THEN metric_record.metric_value >= rule_record.threshold_value
                WHEN '<=' THEN metric_record.metric_value <= rule_record.threshold_value
                WHEN '=' THEN metric_record.metric_value = rule_record.threshold_value
                WHEN '!=' THEN metric_record.metric_value != rule_record.threshold_value
                ELSE false
            END;
            
            -- Criar alerta se necessário
            IF should_alert THEN
                INSERT INTO system_alerts (
                    alert_type, severity, title, message, service_name, 
                    metric_name, current_value, threshold_value, metadata
                ) VALUES (
                    'metric_threshold',
                    rule_record.severity,
                    rule_record.name,
                    format('Metric %s is %s (threshold: %s)', 
                           rule_record.metric_name, 
                           metric_record.metric_value, 
                           rule_record.threshold_value),
                    metric_record.service_name,
                    rule_record.metric_name,
                    metric_record.metric_value,
                    rule_record.threshold_value,
                    jsonb_build_object('rule_id', rule_record.id)
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Função para limpeza automática de dados antigos
CREATE OR REPLACE FUNCTION cleanup_monitoring_data()
RETURNS void AS $$
BEGIN
    -- Manter apenas 30 dias de métricas
    DELETE FROM system_metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
    
    -- Manter apenas 90 dias de histórico de performance
    DELETE FROM performance_history WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- Manter apenas 7 dias de logs de debug/info
    DELETE FROM system_logs 
    WHERE timestamp < NOW() - INTERVAL '7 days' 
    AND level IN ('debug', 'info');
    
    -- Manter apenas 30 dias de logs de warn/error/fatal
    DELETE FROM system_logs 
    WHERE timestamp < NOW() - INTERVAL '30 days' 
    AND level IN ('warn', 'error', 'fatal');
    
    -- Manter apenas alertas resolvidos dos últimos 30 dias
    DELETE FROM system_alerts 
    WHERE status = 'resolved' 
    AND resolved_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Views para dashboards de monitoramento
CREATE VIEW current_service_health AS
SELECT 
    service_name,
    status,
    uptime,
    response_time,
    error_count,
    last_check,
    CASE 
        WHEN last_check < NOW() - INTERVAL '5 minutes' THEN 'stale'
        ELSE 'current'
    END as data_freshness
FROM service_status
ORDER BY 
    CASE status 
        WHEN 'unhealthy' THEN 1
        WHEN 'degraded' THEN 2
        WHEN 'unknown' THEN 3
        WHEN 'healthy' THEN 4
    END,
    service_name;

CREATE VIEW active_alerts_summary AS
SELECT 
    severity,
    COUNT(*) as alert_count,
    MIN(triggered_at) as oldest_alert,
    MAX(triggered_at) as newest_alert
FROM system_alerts 
WHERE status = 'active'
GROUP BY severity
ORDER BY 
    CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
    END;

-- View materializada para métricas agregadas por hora
CREATE MATERIALIZED VIEW system_metrics_hourly AS
SELECT 
    metric_name,
    service_name,
    DATE_TRUNC('hour', recorded_at) as hour,
    AVG(metric_value) as avg_value,
    MIN(metric_value) as min_value,
    MAX(metric_value) as max_value,
    COUNT(*) as sample_count,
    STDDEV(metric_value) as std_deviation
FROM system_metrics
GROUP BY metric_name, service_name, DATE_TRUNC('hour', recorded_at);

CREATE UNIQUE INDEX idx_system_metrics_hourly_unique 
ON system_metrics_hourly(metric_name, service_name, hour);

-- Função para refresh das views materializadas
CREATE OR REPLACE FUNCTION refresh_monitoring_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY system_metrics_hourly;
END;
$$ LANGUAGE plpgsql;

-- Políticas RLS (Row Level Security) - Apenas para super admins
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para system_metrics (apenas super admins)
CREATE POLICY "Super admins can view system metrics" ON system_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can manage system metrics" ON system_metrics
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- Políticas para service_status (apenas super admins)
CREATE POLICY "Super admins can view service status" ON service_status
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can manage service status" ON service_status
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- Políticas para system_alerts (apenas super admins)
CREATE POLICY "Super admins can view system alerts" ON system_alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can manage system alerts" ON system_alerts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- Políticas para alert_rules (apenas super admins)
CREATE POLICY "Super admins can view alert rules" ON alert_rules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can manage alert rules" ON alert_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- Políticas para performance_history (apenas super admins)
CREATE POLICY "Super admins can view performance history" ON performance_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can manage performance history" ON performance_history
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- Políticas para system_logs (apenas super admins)
CREATE POLICY "Super admins can view system logs" ON system_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can manage system logs" ON system_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
        )
    );

-- Grants para roles
GRANT SELECT ON system_metrics TO authenticated;
GRANT ALL ON system_metrics TO service_role;

GRANT SELECT ON service_status TO authenticated;
GRANT ALL ON service_status TO service_role;

GRANT SELECT ON system_alerts TO authenticated;
GRANT ALL ON system_alerts TO service_role;

GRANT SELECT ON alert_rules TO authenticated;
GRANT ALL ON alert_rules TO service_role;

GRANT SELECT ON performance_history TO authenticated;
GRANT ALL ON performance_history TO service_role;

GRANT SELECT ON system_logs TO authenticated;
GRANT ALL ON system_logs TO service_role;

GRANT SELECT ON current_service_health TO authenticated;
GRANT SELECT ON active_alerts_summary TO authenticated;
GRANT SELECT ON system_metrics_hourly TO authenticated;

-- Comentários para documentação
COMMENT ON TABLE system_metrics IS 'Tabela para armazenar métricas do sistema em tempo real';
COMMENT ON TABLE service_status IS 'Tabela para status de saúde dos serviços';
COMMENT ON TABLE system_alerts IS 'Tabela para alertas e notificações do sistema';
COMMENT ON TABLE alert_rules IS 'Tabela para configuração de regras de alerta';
COMMENT ON TABLE performance_history IS 'Tabela para histórico de performance dos serviços';
COMMENT ON TABLE system_logs IS 'Tabela para logs estruturados do sistema';
COMMENT ON VIEW current_service_health IS 'View com status atual de saúde dos serviços';
COMMENT ON VIEW active_alerts_summary IS 'View com resumo dos alertas ativos';
COMMENT ON MATERIALIZED VIEW system_metrics_hourly IS 'View materializada com métricas agregadas por hora';

-- Migration: 20241220000000_create_stripe_config.sql
-- Size: 1905 bytes
-- Criação da tabela de configuração do Stripe
CREATE TABLE IF NOT EXISTS stripe_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  secret_key TEXT NOT NULL,
  publishable_key TEXT NOT NULL,
  webhook_secret TEXT,
  environment TEXT NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar RLS (Row Level Security)
ALTER TABLE stripe_config ENABLE ROW LEVEL SECURITY;

-- Política para permitir apenas administradores acessarem
CREATE POLICY "Apenas administradores podem acessar configuração do Stripe" ON stripe_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_stripe_config_environment ON stripe_config(environment);
CREATE INDEX IF NOT EXISTS idx_stripe_config_updated_at ON stripe_config(updated_at);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_stripe_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stripe_config_updated_at
  BEFORE UPDATE ON stripe_config
  FOR EACH ROW
  EXECUTE FUNCTION update_stripe_config_updated_at();

-- Comentários para documentação
COMMENT ON TABLE stripe_config IS 'Configurações do Stripe MCP para processamento de pagamentos';
COMMENT ON COLUMN stripe_config.secret_key IS 'Chave secreta do Stripe (sk_test_ ou sk_live_)';
COMMENT ON COLUMN stripe_config.publishable_key IS 'Chave pública do Stripe (pk_test_ ou pk_live_)';
COMMENT ON COLUMN stripe_config.webhook_secret IS 'Secret para validação de webhooks do Stripe';
COMMENT ON COLUMN stripe_config.environment IS 'Ambiente: test para desenvolvimento, live para produção';

-- Migration: 20241220000001_create_stripe_transactions.sql
-- Size: 4959 bytes
-- Criação da tabela de transações do Stripe
CREATE TABLE IF NOT EXISTS stripe_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  commission_payment_id UUID REFERENCES commission_payments(id),
  affiliate_id UUID REFERENCES affiliates(id),
  amount INTEGER NOT NULL, -- Valor em centavos
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'canceled')),
  payment_method TEXT,
  failure_reason TEXT,
  stripe_fee INTEGER, -- Taxa do Stripe em centavos
  net_amount INTEGER, -- Valor líquido após taxas
  metadata JSONB DEFAULT '{}',
  webhook_events JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Adicionar RLS (Row Level Security)
ALTER TABLE stripe_transactions ENABLE ROW LEVEL SECURITY;

-- Política para permitir apenas administradores acessarem
CREATE POLICY "Apenas administradores podem acessar transações do Stripe" ON stripe_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Política para afiliados verem apenas suas próprias transações
CREATE POLICY "Afiliados podem ver suas próprias transações" ON stripe_transactions
  FOR SELECT USING (
    affiliate_id = auth.uid()
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_payment_intent ON stripe_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_customer ON stripe_transactions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_commission_payment ON stripe_transactions(commission_payment_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_affiliate ON stripe_transactions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_status ON stripe_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_created_at ON stripe_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_processed_at ON stripe_transactions(processed_at);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_stripe_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Atualizar processed_at quando status muda para succeeded
  IF NEW.status = 'succeeded' AND OLD.status != 'succeeded' THEN
    NEW.processed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stripe_transactions_updated_at
  BEFORE UPDATE ON stripe_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_stripe_transactions_updated_at();

-- Função para calcular estatísticas de transações
CREATE OR REPLACE FUNCTION get_stripe_transaction_stats(
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  affiliate_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  total_transactions BIGINT,
  total_amount BIGINT,
  total_fees BIGINT,
  total_net_amount BIGINT,
  successful_transactions BIGINT,
  failed_transactions BIGINT,
  pending_transactions BIGINT,
  average_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_transactions,
    COALESCE(SUM(st.amount), 0) as total_amount,
    COALESCE(SUM(st.stripe_fee), 0) as total_fees,
    COALESCE(SUM(st.net_amount), 0) as total_net_amount,
    COUNT(*) FILTER (WHERE st.status = 'succeeded') as successful_transactions,
    COUNT(*) FILTER (WHERE st.status = 'failed') as failed_transactions,
    COUNT(*) FILTER (WHERE st.status IN ('pending', 'processing')) as pending_transactions,
    COALESCE(AVG(st.amount), 0) as average_amount
  FROM stripe_transactions st
  WHERE 
    (start_date IS NULL OR st.created_at >= start_date)
    AND (end_date IS NULL OR st.created_at <= end_date + INTERVAL '1 day')
    AND (affiliate_filter IS NULL OR st.affiliate_id = affiliate_filter);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários para documentação
COMMENT ON TABLE stripe_transactions IS 'Registro de todas as transações processadas via Stripe MCP';
COMMENT ON COLUMN stripe_transactions.stripe_payment_intent_id IS 'ID do Payment Intent no Stripe';
COMMENT ON COLUMN stripe_transactions.stripe_customer_id IS 'ID do Customer no Stripe';
COMMENT ON COLUMN stripe_transactions.amount IS 'Valor da transação em centavos';
COMMENT ON COLUMN stripe_transactions.stripe_fee IS 'Taxa cobrada pelo Stripe em centavos';
COMMENT ON COLUMN stripe_transactions.net_amount IS 'Valor líquido após dedução das taxas';
COMMENT ON COLUMN stripe_transactions.metadata IS 'Metadados adicionais da transação';
COMMENT ON COLUMN stripe_transactions.webhook_events IS 'Histórico de eventos de webhook recebidos';
COMMENT ON FUNCTION get_stripe_transaction_stats IS 'Função para obter estatísticas das transações do Stripe';

-- Migration: 20241230000001_add_evolution_message_id_unique_index.sql
-- Size: 750 bytes
-- ==========================================
-- Migration: Adicionar índice único para evolution_message_id
-- Objetivo: Garantir idempotência no processamento de webhooks
-- ==========================================

-- Criar índice único parcial para evolution_message_id (apenas quando não for NULL)
-- Isso previne mensagens duplicadas da Evolution API
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_evolution_message_id_unique 
ON public.messages (evolution_message_id) 
WHERE evolution_message_id IS NOT NULL;

-- Comentário para documentação
COMMENT ON INDEX idx_messages_evolution_message_id_unique IS 
'Índice único para evolution_message_id garantindo idempotência no processamento de webhooks da Evolution API';

-- Migration: 20250103000001_automation_flows.sql
-- Size: 17145 bytes
-- Criar tabela para fluxos de automação
CREATE TABLE automation_flows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT false,
  trigger_type VARCHAR(100) NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  steps JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT valid_trigger_type CHECK (
    trigger_type IN (
      'message_received',
      'contact_created', 
      'funnel_stage_changed',
      'scheduled_time',
      'tag_added',
      'webhook_received'
    )
  )
);

-- Criar tabela para execuções de automação
CREATE TABLE automation_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID REFERENCES automation_flows(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  trigger_data JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending',
  current_step INTEGER DEFAULT 0,
  execution_data JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

-- Criar tabela para logs de execução de steps
CREATE TABLE automation_step_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_id UUID REFERENCES automation_executions(id) ON DELETE CASCADE,
  step_id VARCHAR(100) NOT NULL,
  step_type VARCHAR(50) NOT NULL,
  step_config JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending',
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT valid_step_status CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'skipped')
  ),
  CONSTRAINT valid_step_type CHECK (
    step_type IN (
      'trigger', 'condition', 'action', 'delay',
      'send_message', 'change_funnel_stage', 'schedule_followup',
      'add_tag', 'remove_tag', 'webhook_call'
    )
  )
);

-- Criar índices para performance
CREATE INDEX idx_automation_flows_active ON automation_flows(active);
CREATE INDEX idx_automation_flows_trigger_type ON automation_flows(trigger_type);
CREATE INDEX idx_automation_flows_created_by ON automation_flows(created_by);

CREATE INDEX idx_automation_executions_flow_id ON automation_executions(flow_id);
CREATE INDEX idx_automation_executions_contact_id ON automation_executions(contact_id);
CREATE INDEX idx_automation_executions_status ON automation_executions(status);
CREATE INDEX idx_automation_executions_started_at ON automation_executions(started_at);

CREATE INDEX idx_automation_step_logs_execution_id ON automation_step_logs(execution_id);
CREATE INDEX idx_automation_step_logs_status ON automation_step_logs(status);
CREATE INDEX idx_automation_step_logs_step_type ON automation_step_logs(step_type);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_automation_flows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automation_flows_updated_at
  BEFORE UPDATE ON automation_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_flows_updated_at();

-- Função para processar gatilhos de automação
CREATE OR REPLACE FUNCTION process_automation_trigger(
  p_trigger_type VARCHAR,
  p_trigger_data JSONB,
  p_contact_id UUID DEFAULT NULL
)
RETURNS TABLE(
  flow_id UUID,
  execution_id UUID
) AS $$
DECLARE
  flow_record RECORD;
  execution_uuid UUID;
BEGIN
  -- Buscar fluxos ativos com o tipo de gatilho correspondente
  FOR flow_record IN 
    SELECT af.id, af.name, af.trigger_config, af.steps
    FROM automation_flows af
    WHERE af.active = true 
      AND af.trigger_type = p_trigger_type
  LOOP
    -- Verificar se o gatilho deve ser executado baseado na configuração
    IF should_execute_trigger(flow_record.trigger_config, p_trigger_data) THEN
      -- Criar nova execução
      INSERT INTO automation_executions (
        flow_id,
        contact_id,
        trigger_data,
        status
      ) VALUES (
        flow_record.id,
        p_contact_id,
        p_trigger_data,
        'pending'
      ) RETURNING id INTO execution_uuid;
      
      -- Retornar o ID do fluxo e da execução
      flow_id := flow_record.id;
      execution_id := execution_uuid;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Função auxiliar para verificar se um gatilho deve ser executado
CREATE OR REPLACE FUNCTION should_execute_trigger(
  trigger_config JSONB,
  trigger_data JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  keywords TEXT[];
  keyword TEXT;
  message_text TEXT;
  exact_match BOOLEAN;
BEGIN
  -- Para gatilho de mensagem recebida
  IF trigger_config ? 'keywords' THEN
    keywords := ARRAY(SELECT jsonb_array_elements_text(trigger_config->'keywords'));
    message_text := LOWER(trigger_data->>'message');
    exact_match := COALESCE((trigger_config->>'exact_match')::BOOLEAN, false);
    
    -- Se não há palavras-chave definidas, executar sempre
    IF array_length(keywords, 1) IS NULL THEN
      RETURN true;
    END IF;
    
    -- Verificar se alguma palavra-chave corresponde
    FOREACH keyword IN ARRAY keywords
    LOOP
      IF exact_match THEN
        IF message_text = LOWER(keyword) THEN
          RETURN true;
        END IF;
      ELSE
        IF message_text LIKE '%' || LOWER(keyword) || '%' THEN
          RETURN true;
        END IF;
      END IF;
    END LOOP;
    
    RETURN false;
  END IF;
  
  -- Para outros tipos de gatilho, executar sempre por padrão
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Função para executar próximo step de uma automação
CREATE OR REPLACE FUNCTION execute_automation_step(
  p_execution_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  execution_record RECORD;
  flow_record RECORD;
  steps_array JSONB;
  current_step_data JSONB;
  step_log_id UUID;
  step_result BOOLEAN;
BEGIN
  -- Buscar dados da execução
  SELECT * INTO execution_record
  FROM automation_executions
  WHERE id = p_execution_id
    AND status IN ('pending', 'running');
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Buscar dados do fluxo
  SELECT * INTO flow_record
  FROM automation_flows
  WHERE id = execution_record.flow_id
    AND active = true;
  
  IF NOT FOUND THEN
    UPDATE automation_executions
    SET status = 'failed', error_message = 'Fluxo não encontrado ou inativo'
    WHERE id = p_execution_id;
    RETURN false;
  END IF;
  
  -- Parsear steps
  steps_array := CASE 
    WHEN jsonb_typeof(flow_record.steps) = 'string' THEN
      flow_record.steps::TEXT::JSONB
    ELSE
      flow_record.steps
  END;
  
  -- Verificar se há mais steps para executar
  IF execution_record.current_step >= jsonb_array_length(steps_array) THEN
    UPDATE automation_executions
    SET status = 'completed', completed_at = NOW()
    WHERE id = p_execution_id;
    RETURN true;
  END IF;
  
  -- Obter step atual
  current_step_data := steps_array->execution_record.current_step;
  
  -- Criar log do step
  INSERT INTO automation_step_logs (
    execution_id,
    step_id,
    step_type,
    step_config,
    status,
    input_data
  ) VALUES (
    p_execution_id,
    current_step_data->>'id',
    current_step_data->>'type',
    current_step_data->'config',
    'running',
    execution_record.execution_data
  ) RETURNING id INTO step_log_id;
  
  -- Atualizar status da execução
  UPDATE automation_executions
  SET status = 'running'
  WHERE id = p_execution_id;
  
  -- Executar o step baseado no tipo
  step_result := execute_step_by_type(
    current_step_data->>'type',
    current_step_data->'config',
    execution_record.contact_id,
    execution_record.execution_data
  );
  
  -- Atualizar log do step
  UPDATE automation_step_logs
  SET 
    status = CASE WHEN step_result THEN 'completed' ELSE 'failed' END,
    completed_at = NOW()
  WHERE id = step_log_id;
  
  IF step_result THEN
    -- Avançar para próximo step
    UPDATE automation_executions
    SET current_step = current_step + 1
    WHERE id = p_execution_id;
    
    -- Agendar execução do próximo step
    PERFORM pg_notify('automation_step', p_execution_id::TEXT);
  ELSE
    -- Marcar execução como falha
    UPDATE automation_executions
    SET status = 'failed', error_message = 'Falha na execução do step'
    WHERE id = p_execution_id;
  END IF;
  
  RETURN step_result;
END;
$$ LANGUAGE plpgsql;

-- Função auxiliar para executar steps por tipo
CREATE OR REPLACE FUNCTION execute_step_by_type(
  step_type TEXT,
  step_config JSONB,
  contact_id UUID,
  execution_data JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
  CASE step_type
    WHEN 'send_message' THEN
      -- Agendar envio de mensagem
      RETURN schedule_automation_message(step_config, contact_id);
    
    WHEN 'change_funnel_stage' THEN
      -- Alterar estágio do funil
      RETURN change_contact_funnel_stage(step_config, contact_id);
    
    WHEN 'schedule_followup' THEN
      -- Agendar follow-up
      RETURN schedule_automation_followup(step_config, contact_id);
    
    WHEN 'add_tag' THEN
      -- Adicionar tag
      RETURN add_contact_tag(step_config, contact_id);
    
    WHEN 'delay' THEN
      -- Implementar delay (por enquanto retorna true)
      RETURN true;
    
    ELSE
      -- Tipo de step não reconhecido
      RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Função para agendar mensagem de automação
CREATE OR REPLACE FUNCTION schedule_automation_message(
  step_config JSONB,
  contact_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  message_content TEXT;
  template_record RECORD;
BEGIN
  -- Verificar se há template ou mensagem personalizada
  IF step_config ? 'message_template_id' THEN
    SELECT content INTO message_content
    FROM message_templates
    WHERE id = (step_config->>'message_template_id')::UUID;
  ELSIF step_config ? 'custom_message' THEN
    message_content := step_config->>'custom_message';
  ELSE
    RETURN false;
  END IF;
  
  -- Agendar mensagem (integração com sistema de mensagens)
  INSERT INTO scheduled_messages (
    contact_id,
    message_content,
    scheduled_for,
    message_type,
    status
  ) VALUES (
    contact_id,
    message_content,
    NOW(),
    'automation',
    'pending'
  );
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Função para alterar estágio do funil
CREATE OR REPLACE FUNCTION change_contact_funnel_stage(
  step_config JSONB,
  contact_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE contacts
  SET 
    current_stage_id = (step_config->>'stage_id')::UUID,
    updated_at = NOW()
  WHERE id = contact_id;
  
  RETURN FOUND;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Função para agendar follow-up de automação
CREATE OR REPLACE FUNCTION schedule_automation_followup(
  step_config JSONB,
  contact_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  delay_hours INTEGER;
  followup_type TEXT;
  message_text TEXT;
BEGIN
  delay_hours := COALESCE((step_config->>'delay_hours')::INTEGER, 24);
  followup_type := COALESCE(step_config->>'followup_type', 'whatsapp');
  message_text := step_config->>'message';
  
  INSERT INTO followups (
    contact_id,
    type,
    message,
    scheduled_for,
    status,
    created_by_automation
  ) VALUES (
    contact_id,
    followup_type,
    message_text,
    NOW() + (delay_hours || ' hours')::INTERVAL,
    'scheduled',
    true
  );
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Função para adicionar tag ao contato
CREATE OR REPLACE FUNCTION add_contact_tag(
  step_config JSONB,
  contact_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  tag_name TEXT;
  existing_tags TEXT[];
BEGIN
  tag_name := step_config->>'tag_name';
  
  IF tag_name IS NULL THEN
    RETURN false;
  END IF;
  
  -- Obter tags existentes
  SELECT tags INTO existing_tags
  FROM contacts
  WHERE id = contact_id;
  
  -- Adicionar nova tag se não existir
  IF NOT (tag_name = ANY(COALESCE(existing_tags, ARRAY[]::TEXT[]))) THEN
    UPDATE contacts
    SET 
      tags = array_append(COALESCE(tags, ARRAY[]::TEXT[]), tag_name),
      updated_at = NOW()
    WHERE id = contact_id;
  END IF;
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Habilitar RLS
ALTER TABLE automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_step_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para automation_flows
CREATE POLICY "Users can view their own automation flows" ON automation_flows
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own automation flows" ON automation_flows
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own automation flows" ON automation_flows
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own automation flows" ON automation_flows
  FOR DELETE USING (created_by = auth.uid());

-- Políticas RLS para automation_executions
CREATE POLICY "Users can view executions of their flows" ON automation_executions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM automation_flows af
      WHERE af.id = automation_executions.flow_id
        AND af.created_by = auth.uid()
    )
  );

-- Políticas RLS para automation_step_logs
CREATE POLICY "Users can view step logs of their executions" ON automation_step_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM automation_executions ae
      JOIN automation_flows af ON af.id = ae.flow_id
      WHERE ae.id = automation_step_logs.execution_id
        AND af.created_by = auth.uid()
    )
  );

-- Inserir dados de exemplo
INSERT INTO automation_flows (
  name,
  description,
  active,
  trigger_type,
  trigger_config,
  steps,
  created_by
) VALUES 
(
  'Boas-vindas Automáticas',
  'Enviar mensagem de boas-vindas para novos contatos',
  true,
  'contact_created',
  '{"source": "whatsapp"}',
  '[
    {
      "id": "step_1",
      "type": "action",
      "config": {
        "type": "send_message",
        "custom_message": "Olá! Seja bem-vindo(a) ao nosso atendimento. Como posso ajudá-lo(a) hoje?"
      },
      "position": {"x": 100, "y": 200},
      "connections": []
    }
  ]',
  (SELECT id FROM auth.users LIMIT 1)
),
(
  'Follow-up de Vendas',
  'Acompanhamento automático para leads em negociação',
  true,
  'funnel_stage_changed',
  '{"to_stage": "negotiation"}',
  '[
    {
      "id": "step_1",
      "type": "action",
      "config": {
        "type": "schedule_followup",
        "delay_hours": 24,
        "followup_type": "whatsapp",
        "message": "Olá! Gostaria de saber se tem alguma dúvida sobre nossa proposta. Estou aqui para ajudar!"
      },
      "position": {"x": 100, "y": 200},
      "connections": []
    }
  ]',
  (SELECT id FROM auth.users LIMIT 1)
),
(
  'Resposta Automática - Horário',
  'Resposta automática fora do horário comercial',
  false,
  'message_received',
  '{"keywords": ["horário", "funcionamento", "atendimento"]}',
  '[
    {
      "id": "step_1",
      "type": "action",
      "config": {
        "type": "send_message",
        "custom_message": "Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos seu contato no próximo dia útil!"
      },
      "position": {"x": 100, "y": 200},
      "connections": []
    }
  ]',
  (SELECT id FROM auth.users LIMIT 1)
);

-- Comentários nas tabelas
COMMENT ON TABLE automation_flows IS 'Fluxos de automação configurados pelos usuários';
COMMENT ON TABLE automation_executions IS 'Execuções de fluxos de automação';
COMMENT ON TABLE automation_step_logs IS 'Logs detalhados de execução de cada step';

COMMENT ON COLUMN automation_flows.trigger_type IS 'Tipo de gatilho que inicia o fluxo';
COMMENT ON COLUMN automation_flows.trigger_config IS 'Configuração específica do gatilho';
COMMENT ON COLUMN automation_flows.steps IS 'Array JSON com os steps do fluxo';

COMMENT ON COLUMN automation_executions.current_step IS 'Índice do step atual sendo executado';
COMMENT ON COLUMN automation_executions.execution_data IS 'Dados compartilhados durante a execução';

COMMENT ON COLUMN automation_step_logs.input_data IS 'Dados de entrada para o step';
COMMENT ON COLUMN automation_step_logs.output_data IS 'Dados de saída do step';

-- Migration: 20250103000002_add_tenant_id_to_automation_flows.sql
-- Size: 7928 bytes
-- Adicionar tenant_id às tabelas de automação
ALTER TABLE automation_flows ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE automation_executions ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE automation_step_logs ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Atualizar registros existentes com tenant_id baseado no created_by
UPDATE automation_flows 
SET tenant_id = (
  SELECT p.tenant_id 
  FROM profiles p 
  WHERE p.user_id = automation_flows.created_by
  LIMIT 1
)
WHERE tenant_id IS NULL;

-- Atualizar execuções com tenant_id baseado no fluxo
UPDATE automation_executions 
SET tenant_id = (
  SELECT af.tenant_id 
  FROM automation_flows af 
  WHERE af.id = automation_executions.flow_id
)
WHERE tenant_id IS NULL;

-- Atualizar logs com tenant_id baseado na execução
UPDATE automation_step_logs 
SET tenant_id = (
  SELECT ae.tenant_id 
  FROM automation_executions ae 
  WHERE ae.id = automation_step_logs.execution_id
)
WHERE tenant_id IS NULL;

-- Tornar tenant_id obrigatório
ALTER TABLE automation_flows ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE automation_executions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE automation_step_logs ALTER COLUMN tenant_id SET NOT NULL;

-- Criar índices para performance
CREATE INDEX idx_automation_flows_tenant_id ON automation_flows(tenant_id);
CREATE INDEX idx_automation_executions_tenant_id ON automation_executions(tenant_id);
CREATE INDEX idx_automation_step_logs_tenant_id ON automation_step_logs(tenant_id);

-- Remover políticas RLS antigas
DROP POLICY IF EXISTS "Users can view their own automation flows" ON automation_flows;
DROP POLICY IF EXISTS "Users can insert their own automation flows" ON automation_flows;
DROP POLICY IF EXISTS "Users can update their own automation flows" ON automation_flows;
DROP POLICY IF EXISTS "Users can delete their own automation flows" ON automation_flows;
DROP POLICY IF EXISTS "Users can view executions of their flows" ON automation_executions;
DROP POLICY IF EXISTS "Users can view step logs of their executions" ON automation_step_logs;

-- Criar novas políticas RLS baseadas em tenant_id
CREATE POLICY "Users can access own tenant automation flows" ON automation_flows
  FOR ALL USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "Super admins can access all automation flows" ON automation_flows
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can access own tenant automation executions" ON automation_executions
  FOR ALL USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "Super admins can access all automation executions" ON automation_executions
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can access own tenant automation step logs" ON automation_step_logs
  FOR ALL USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "Super admins can access all automation step logs" ON automation_step_logs
  FOR ALL USING (is_super_admin());

-- Atualizar função para processar gatilhos de automação
CREATE OR REPLACE FUNCTION process_automation_trigger(
  p_trigger_type VARCHAR,
  p_trigger_data JSONB,
  p_contact_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE(
  flow_id UUID,
  execution_id UUID
) AS $$
DECLARE
  flow_record RECORD;
  execution_uuid UUID;
  contact_tenant_id UUID;
BEGIN
  -- Se tenant_id não foi fornecido, buscar pelo contato
  IF p_tenant_id IS NULL AND p_contact_id IS NOT NULL THEN
    SELECT tenant_id INTO contact_tenant_id
    FROM contacts
    WHERE id = p_contact_id;
    
    p_tenant_id := contact_tenant_id;
  END IF;
  
  -- Buscar fluxos ativos com o tipo de gatilho correspondente
  FOR flow_record IN 
    SELECT af.id, af.name, af.trigger_config, af.steps, af.tenant_id
    FROM automation_flows af
    WHERE af.active = true 
      AND af.trigger_type = p_trigger_type
      AND (p_tenant_id IS NULL OR af.tenant_id = p_tenant_id)
  LOOP
    -- Verificar se o gatilho deve ser executado baseado na configuração
    IF should_execute_trigger(flow_record.trigger_config, p_trigger_data) THEN
      -- Criar nova execução
      INSERT INTO automation_executions (
        flow_id,
        contact_id,
        trigger_data,
        status,
        tenant_id
      ) VALUES (
        flow_record.id,
        p_contact_id,
        p_trigger_data,
        'pending',
        flow_record.tenant_id
      ) RETURNING id INTO execution_uuid;
      
      -- Retornar informações da execução criada
      flow_id := flow_record.id;
      execution_id := execution_uuid;
      RETURN NEXT;
      
      -- Agendar execução do primeiro step
      PERFORM pg_notify('automation_step', execution_uuid::TEXT);
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Atualizar função para executar próximo step
CREATE OR REPLACE FUNCTION execute_automation_step(
  p_execution_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  execution_record RECORD;
  flow_record RECORD;
  steps_array JSONB;
  current_step_data JSONB;
  step_log_id UUID;
  step_result BOOLEAN;
BEGIN
  -- Buscar dados da execução
  SELECT * INTO execution_record
  FROM automation_executions
  WHERE id = p_execution_id
    AND status IN ('pending', 'running');
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Buscar dados do fluxo
  SELECT * INTO flow_record
  FROM automation_flows
  WHERE id = execution_record.flow_id
    AND active = true;
  
  IF NOT FOUND THEN
    UPDATE automation_executions
    SET status = 'failed', error_message = 'Fluxo não encontrado ou inativo'
    WHERE id = p_execution_id;
    RETURN false;
  END IF;
  
  -- Parsear steps
  steps_array := CASE 
    WHEN jsonb_typeof(flow_record.steps) = 'string' THEN
      flow_record.steps::TEXT::JSONB
    ELSE
      flow_record.steps
  END;
  
  -- Verificar se há mais steps para executar
  IF execution_record.current_step >= jsonb_array_length(steps_array) THEN
    UPDATE automation_executions
    SET status = 'completed', completed_at = NOW()
    WHERE id = p_execution_id;
    RETURN true;
  END IF;
  
  -- Obter step atual
  current_step_data := steps_array->execution_record.current_step;
  
  -- Criar log do step
  INSERT INTO automation_step_logs (
    execution_id,
    step_id,
    step_type,
    step_config,
    status,
    input_data,
    tenant_id
  ) VALUES (
    p_execution_id,
    current_step_data->>'id',
    current_step_data->>'type',
    current_step_data->'config',
    'running',
    execution_record.execution_data,
    execution_record.tenant_id
  ) RETURNING id INTO step_log_id;
  
  -- Atualizar status da execução
  UPDATE automation_executions
  SET status = 'running'
  WHERE id = p_execution_id;
  
  -- Executar o step baseado no tipo
  step_result := execute_step_by_type(
    current_step_data->>'type',
    current_step_data->'config',
    execution_record.contact_id,
    execution_record.execution_data
  );
  
  -- Atualizar log do step
  UPDATE automation_step_logs
  SET 
    status = CASE WHEN step_result THEN 'completed' ELSE 'failed' END,
    completed_at = NOW()
  WHERE id = step_log_id;
  
  IF step_result THEN
    -- Avançar para próximo step
    UPDATE automation_executions
    SET current_step = current_step + 1
    WHERE id = p_execution_id;
    
    -- Agendar execução do próximo step
    PERFORM pg_notify('automation_step', p_execution_id::TEXT);
  ELSE
    -- Marcar execução como falha
    UPDATE automation_executions
    SET status = 'failed', error_message = 'Falha na execução do step'
    WHERE id = p_execution_id;
  END IF;
  
  RETURN step_result;
END;
$$ LANGUAGE plpgsql;

-- Comentários
COMMENT ON COLUMN automation_flows.tenant_id IS 'ID do tenant proprietário do fluxo de automação';
COMMENT ON COLUMN automation_executions.tenant_id IS 'ID do tenant da execução de automação';
COMMENT ON COLUMN automation_step_logs.tenant_id IS 'ID do tenant do log de step de automação';

-- Migration: 20250103000002_notifications.sql
-- Size: 9532 bytes
-- Criar tabela de notificações
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
    read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    action_label TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

-- Função para criar notificação
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_action_label TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        action_url,
        action_label,
        metadata
    ) VALUES (
        p_user_id,
        p_title,
        p_message,
        p_type,
        p_action_url,
        p_action_label,
        p_metadata
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Função para notificar sobre nova mensagem
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
    contact_name TEXT;
    instance_name TEXT;
BEGIN
    -- Buscar nome do contato
    SELECT name INTO contact_name
    FROM contacts
    WHERE id = NEW.contact_id;
    
    -- Buscar nome da instância
    SELECT name INTO instance_name
    FROM whatsapp_instances
    WHERE id = NEW.instance_id;
    
    -- Criar notificação apenas para mensagens recebidas
    IF NEW.direction = 'received' THEN
        PERFORM create_notification(
            auth.uid(),
            'Nova mensagem recebida',
            'Mensagem de ' || COALESCE(contact_name, 'Contato desconhecido') || ' via ' || COALESCE(instance_name, 'WhatsApp'),
            'info',
            '/dashboard/conversations?contact=' || NEW.contact_id,
            'Ver conversa',
            jsonb_build_object(
                'contact_id', NEW.contact_id,
                'message_id', NEW.id,
                'instance_id', NEW.instance_id
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre novas mensagens
CREATE TRIGGER trigger_notify_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_message();

-- Função para notificar sobre nova campanha
CREATE OR REPLACE FUNCTION notify_campaign_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Notificar quando campanha é iniciada
    IF OLD.status = 'draft' AND NEW.status = 'active' THEN
        PERFORM create_notification(
            auth.uid(),
            'Campanha iniciada',
            'A campanha "' || NEW.name || '" foi iniciada com sucesso',
            'success',
            '/dashboard/campaigns/' || NEW.id,
            'Ver campanha',
            jsonb_build_object('campaign_id', NEW.id)
        );
    END IF;
    
    -- Notificar quando campanha é finalizada
    IF OLD.status = 'active' AND NEW.status = 'completed' THEN
        PERFORM create_notification(
            auth.uid(),
            'Campanha finalizada',
            'A campanha "' || NEW.name || '" foi finalizada',
            'info',
            '/dashboard/campaigns/' || NEW.id,
            'Ver relatório',
            jsonb_build_object('campaign_id', NEW.id)
        );
    END IF;
    
    -- Notificar quando campanha falha
    IF NEW.status = 'failed' THEN
        PERFORM create_notification(
            auth.uid(),
            'Erro na campanha',
            'A campanha "' || NEW.name || '" encontrou um erro',
            'error',
            '/dashboard/campaigns/' || NEW.id,
            'Ver detalhes',
            jsonb_build_object('campaign_id', NEW.id)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre status de campanhas
CREATE TRIGGER trigger_notify_campaign_status
    AFTER UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION notify_campaign_status();

-- Função para notificar sobre automação
CREATE OR REPLACE FUNCTION notify_automation_execution()
RETURNS TRIGGER AS $$
DECLARE
    flow_name TEXT;
BEGIN
    -- Buscar nome do fluxo
    SELECT name INTO flow_name
    FROM automation_flows
    WHERE id = NEW.flow_id;
    
    -- Notificar quando automação falha
    IF NEW.status = 'failed' THEN
        PERFORM create_notification(
            auth.uid(),
            'Erro na automação',
            'O fluxo "' || COALESCE(flow_name, 'Desconhecido') || '" encontrou um erro',
            'error',
            '/dashboard/automation',
            'Ver automações',
            jsonb_build_object(
                'flow_id', NEW.flow_id,
                'execution_id', NEW.id
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre execuções de automação
CREATE TRIGGER trigger_notify_automation_execution
    AFTER UPDATE ON automation_executions
    FOR EACH ROW
    EXECUTE FUNCTION notify_automation_execution();

-- Função para notificar sobre follow-ups vencidos
CREATE OR REPLACE FUNCTION notify_overdue_followups()
RETURNS void AS $$
DECLARE
    overdue_count INTEGER;
BEGIN
    -- Contar follow-ups vencidos
    SELECT COUNT(*) INTO overdue_count
    FROM followups
    WHERE status = 'scheduled'
    AND scheduled_for < NOW() - INTERVAL '1 hour';
    
    -- Criar notificação se houver follow-ups vencidos
    IF overdue_count > 0 THEN
        PERFORM create_notification(
            auth.uid(),
            'Follow-ups em atraso',
            'Você tem ' || overdue_count || ' follow-up' || 
            CASE WHEN overdue_count > 1 THEN 's' ELSE '' END || ' em atraso',
            'warning',
            '/dashboard/followups',
            'Ver follow-ups',
            jsonb_build_object('overdue_count', overdue_count)
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Função para notificar sobre novos contatos
CREATE OR REPLACE FUNCTION notify_new_contact()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_notification(
        auth.uid(),
        'Novo contato adicionado',
        'O contato ' || COALESCE(NEW.name, NEW.phone) || ' foi adicionado',
        'info',
        '/dashboard/contacts/' || NEW.id,
        'Ver contato',
        jsonb_build_object('contact_id', NEW.id)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para notificar sobre novos contatos
CREATE TRIGGER trigger_notify_new_contact
    AFTER INSERT ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_contact();

-- Função para limpar notificações antigas (mais de 30 dias)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Agendar limpeza de notificações antigas (executar diariamente às 2h)
SELECT cron.schedule(
    'cleanup-notifications',
    '0 2 * * *',
    'SELECT cleanup_old_notifications();'
);

-- Agendar verificação de follow-ups vencidos (executar a cada hora)
SELECT cron.schedule(
    'check-overdue-followups',
    '0 * * * *',
    'SELECT notify_overdue_followups();'
);

-- Políticas RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Política para visualizar apenas suas próprias notificações
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Política para inserir notificações
CREATE POLICY "Users can insert own notifications" ON notifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política para atualizar suas próprias notificações
CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Política para deletar suas próprias notificações
CREATE POLICY "Users can delete own notifications" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Inserir algumas notificações de exemplo
INSERT INTO notifications (user_id, title, message, type, action_url, action_label) VALUES
(auth.uid(), 'Bem-vindo ao ConvoFlow!', 'Sua conta foi criada com sucesso. Comece criando sua primeira campanha.', 'success', '/dashboard/campaigns', 'Criar campanha'),
(auth.uid(), 'Configure sua instância do WhatsApp', 'Para começar a enviar mensagens, você precisa configurar uma instância do WhatsApp.', 'info', '/dashboard/settings/whatsapp', 'Configurar'),
(auth.uid(), 'Dica: Use templates de mensagem', 'Crie templates de mensagem para agilizar suas campanhas e follow-ups.', 'info', '/dashboard/templates', 'Ver templates');

COMMIT;

-- Migration: 20250103000002_refresh_materialized_views.sql
-- Size: 7678 bytes
-- Função para atualizar materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_view(view_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verificar se a view existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE matviewname = view_name 
    AND schemaname = 'public'
  ) THEN
    RAISE NOTICE 'Materialized view % does not exist', view_name;
    RETURN FALSE;
  END IF;

  -- Atualizar a materialized view
  EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_name);
  
  -- Log da atualização
  INSERT INTO system_metrics (
    metric_name,
    metric_value,
    service_name,
    recorded_at,
    metadata
  ) VALUES (
    'materialized_view_refresh',
    1,
    'database',
    NOW(),
    jsonb_build_object('view_name', view_name)
  );
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    -- Log do erro
    INSERT INTO system_metrics (
      metric_name,
      metric_value,
      service_name,
      recorded_at,
      metadata
    ) VALUES (
      'materialized_view_refresh_error',
      1,
      'database',
      NOW(),
      jsonb_build_object(
        'view_name', view_name,
        'error_message', SQLERRM
      )
    );
    
    RAISE NOTICE 'Error refreshing materialized view %: %', view_name, SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar todas as materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS TABLE(view_name TEXT, success BOOLEAN) AS $$
DECLARE
  view_record RECORD;
  refresh_success BOOLEAN;
BEGIN
  -- Iterar sobre todas as materialized views
  FOR view_record IN 
    SELECT matviewname 
    FROM pg_matviews 
    WHERE schemaname = 'public'
    ORDER BY matviewname
  LOOP
    -- Tentar atualizar cada view
    SELECT refresh_materialized_view(view_record.matviewname) INTO refresh_success;
    
    -- Retornar resultado
    view_name := view_record.matviewname;
    success := refresh_success;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Função para obter estatísticas das materialized views
CREATE OR REPLACE FUNCTION get_materialized_view_stats()
RETURNS TABLE(
  view_name TEXT,
  size_bytes BIGINT,
  row_count BIGINT,
  last_refresh TIMESTAMP WITH TIME ZONE,
  is_populated BOOLEAN
) AS $$
DECLARE
  view_record RECORD;
  table_size BIGINT;
  row_count_val BIGINT;
BEGIN
  FOR view_record IN 
    SELECT 
      matviewname,
      ispopulated
    FROM pg_matviews 
    WHERE schemaname = 'public'
    ORDER BY matviewname
  LOOP
    -- Obter tamanho da tabela
    EXECUTE format('SELECT pg_total_relation_size(%L)', 'public.' || view_record.matviewname) 
    INTO table_size;
    
    -- Obter contagem de linhas (apenas se a view estiver populada)
    IF view_record.ispopulated THEN
      EXECUTE format('SELECT COUNT(*) FROM %I', view_record.matviewname) 
      INTO row_count_val;
    ELSE
      row_count_val := 0;
    END IF;
    
    -- Retornar dados
    view_name := view_record.matviewname;
    size_bytes := table_size;
    row_count := row_count_val;
    last_refresh := (
      SELECT MAX(recorded_at) 
      FROM system_metrics 
      WHERE metric_name = 'materialized_view_refresh' 
      AND metadata->>'view_name' = view_record.matviewname
    );
    is_populated := view_record.ispopulated;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Função para agendar atualização automática das materialized views
CREATE OR REPLACE FUNCTION schedule_materialized_view_refresh()
RETURNS VOID AS $$
BEGIN
  -- Notificar o sistema para atualizar as views
  PERFORM pg_notify('refresh_materialized_views', '');
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar automaticamente as materialized views quando há novos dados
CREATE OR REPLACE FUNCTION trigger_materialized_view_refresh()
RETURNS TRIGGER AS $$
BEGIN
  -- Agendar atualização das views relacionadas ao tracking
  IF TG_TABLE_NAME IN ('lead_tracking', 'tracking_events') THEN
    PERFORM schedule_materialized_view_refresh();
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para atualização automática
DROP TRIGGER IF EXISTS trigger_refresh_tracking_views ON lead_tracking;
CREATE TRIGGER trigger_refresh_tracking_views
  AFTER INSERT OR UPDATE OR DELETE ON lead_tracking
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_materialized_view_refresh();

DROP TRIGGER IF EXISTS trigger_refresh_tracking_events_views ON tracking_events;
CREATE TRIGGER trigger_refresh_tracking_events_views
  AFTER INSERT OR UPDATE OR DELETE ON tracking_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_materialized_view_refresh();

-- Função para limpar dados antigos das métricas do sistema
CREATE OR REPLACE FUNCTION cleanup_old_system_metrics(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Deletar métricas antigas
  DELETE FROM system_metrics 
  WHERE recorded_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log da limpeza
  INSERT INTO system_metrics (
    metric_name,
    metric_value,
    service_name,
    recorded_at,
    metadata
  ) VALUES (
    'system_metrics_cleanup',
    deleted_count,
    'database',
    NOW(),
    jsonb_build_object('days_kept', days_to_keep)
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função para obter métricas de performance do banco
CREATE OR REPLACE FUNCTION get_database_performance_metrics()
RETURNS TABLE(
  metric_name TEXT,
  metric_value NUMERIC,
  unit TEXT,
  description TEXT
) AS $$
BEGIN
  -- Tamanho total do banco
  RETURN QUERY
  SELECT 
    'database_size'::TEXT,
    pg_database_size(current_database())::NUMERIC,
    'bytes'::TEXT,
    'Total database size in bytes'::TEXT;
  
  -- Número de conexões ativas
  RETURN QUERY
  SELECT 
    'active_connections'::TEXT,
    COUNT(*)::NUMERIC,
    'connections'::TEXT,
    'Number of active database connections'::TEXT
  FROM pg_stat_activity 
  WHERE state = 'active';
  
  -- Cache hit ratio
  RETURN QUERY
  SELECT 
    'cache_hit_ratio'::TEXT,
    ROUND(
      (SUM(blks_hit) * 100.0 / NULLIF(SUM(blks_hit + blks_read), 0))::NUMERIC, 
      2
    ),
    'percentage'::TEXT,
    'Database cache hit ratio'::TEXT
  FROM pg_stat_database 
  WHERE datname = current_database();
  
  -- Número de transações por segundo (aproximado)
  RETURN QUERY
  SELECT 
    'transactions_per_second'::TEXT,
    COALESCE(
      (SUM(xact_commit + xact_rollback) / EXTRACT(EPOCH FROM (NOW() - stats_reset)))::NUMERIC,
      0
    ),
    'tps'::TEXT,
    'Approximate transactions per second'::TEXT
  FROM pg_stat_database 
  WHERE datname = current_database() 
  AND stats_reset IS NOT NULL;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Comentários para documentação
COMMENT ON FUNCTION refresh_materialized_view(TEXT) IS 'Atualiza uma materialized view específica';
COMMENT ON FUNCTION refresh_all_materialized_views() IS 'Atualiza todas as materialized views do esquema public';
COMMENT ON FUNCTION get_materialized_view_stats() IS 'Retorna estatísticas das materialized views';
COMMENT ON FUNCTION schedule_materialized_view_refresh() IS 'Agenda atualização das materialized views via notificação';
COMMENT ON FUNCTION cleanup_old_system_metrics(INTEGER) IS 'Remove métricas antigas do sistema';
COMMENT ON FUNCTION get_database_performance_metrics() IS 'Retorna métricas de performance do banco de dados';

-- Migration: 20250103000003_create_message_templates.sql
-- Size: 5015 bytes
-- Criação da tabela message_templates
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category VARCHAR(100),
  type VARCHAR(50) DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'audio', 'document')),
  channel VARCHAR(50) DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'sms', 'all')),
  variables JSONB DEFAULT '[]'::jsonb,
  quick_replies JSONB DEFAULT '[]'::jsonb,
  buttons JSONB DEFAULT '[]'::jsonb,
  media JSONB,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_approval', 'rejected')),
  is_favorite BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  folder_id UUID,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_message_templates_tenant_id ON message_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);
CREATE INDEX IF NOT EXISTS idx_message_templates_status ON message_templates(status);
CREATE INDEX IF NOT EXISTS idx_message_templates_folder_id ON message_templates(folder_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_created_at ON message_templates(created_at);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_message_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_message_templates_updated_at();

-- RLS (Row Level Security)
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Política para permitir acesso apenas aos dados do tenant do usuário
CREATE POLICY message_templates_tenant_policy ON message_templates
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Inserir alguns templates padrão
INSERT INTO message_templates (tenant_id, name, description, content, category, type, channel, variables, quick_replies, status, is_favorite, created_by, tags) VALUES
-- Template de boas-vindas
((SELECT id FROM tenants LIMIT 1), 'Boas-vindas Padrão', 'Mensagem de boas-vindas para novos clientes', 'Olá {{nome}}! 👋\n\nSeja bem-vindo(a) à {{empresa}}! Estamos muito felizes em tê-lo(a) conosco.\n\nComo posso ajudá-lo(a) hoje?', 'boas-vindas', 'text', 'whatsapp', '[{"name": "nome", "type": "text", "required": true, "description": "Nome do cliente"}, {"name": "empresa", "type": "text", "required": true, "default_value": "Nossa Empresa", "description": "Nome da empresa"}]'::jsonb, '["Quero fazer um pedido", "Preciso de suporte", "Ver catálogo"]'::jsonb, 'active', true, 'Sistema', '["boas-vindas", "automático", "padrão"]'::jsonb),

-- Template de confirmação de pedido
((SELECT id FROM tenants LIMIT 1), 'Confirmação de Pedido', 'Confirma o pedido realizado pelo cliente', '✅ *Pedido Confirmado!*\n\n📦 Pedido: #{{numero_pedido}}\n💰 Valor: R$ {{valor}}\n📅 Data: {{data}}\n\n🚚 Seu pedido será entregue em até {{prazo_entrega}} dias úteis.\n\nObrigado pela preferência! 😊', 'vendas', 'text', 'whatsapp', '[{"name": "numero_pedido", "type": "text", "required": true, "description": "Número do pedido"}, {"name": "valor", "type": "number", "required": true, "description": "Valor total do pedido"}, {"name": "data", "type": "date", "required": true, "description": "Data do pedido"}, {"name": "prazo_entrega", "type": "number", "required": true, "default_value": "5", "description": "Prazo de entrega em dias"}]'::jsonb, '[]'::jsonb, 'active', false, 'Sistema', '["vendas", "confirmação", "pedido"]'::jsonb),

-- Template de suporte técnico
((SELECT id FROM tenants LIMIT 1), 'Suporte Técnico', 'Template para atendimento de suporte', '🔧 *Suporte Técnico*\n\nOlá {{nome}}!\n\nRecebemos sua solicitação de suporte sobre: {{assunto}}\n\n📋 Protocolo: {{protocolo}}\n⏰ Abertura: {{data_abertura}}\n\nNosso time está analisando e retornará em breve.\n\nTempo médio de resposta: {{tempo_resposta}} horas.', 'suporte', 'text', 'all', '[{"name": "nome", "type": "text", "required": true, "description": "Nome do cliente"}, {"name": "assunto", "type": "text", "required": true, "description": "Assunto da solicitação"}, {"name": "protocolo", "type": "text", "required": true, "description": "Número do protocolo"}, {"name": "data_abertura", "type": "date", "required": true, "description": "Data de abertura"}, {"name": "tempo_resposta", "type": "number", "required": true, "default_value": "24", "description": "Tempo de resposta em horas"}]'::jsonb, '["Urgente", "Posso aguardar", "Mais informações"]'::jsonb, 'active', false, 'Sistema', '["suporte", "protocolo", "atendimento"]'::jsonb);

-- Migration: 20250103000004_stripe_integration.sql
-- Size: 11391 bytes
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

-- Migration: 20250103000005_fix_admin_rls_policies.sql
-- Size: 1680 bytes
-- Fix RLS policies for admin dashboard
-- Allow super admins to view all profiles

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new policies for profiles table
-- Allow users to view their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow super admins to view all profiles
CREATE POLICY "Super admins can view all profiles" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'super_admin'
    )
  );

-- Allow super admins to manage all profiles
CREATE POLICY "Super admins can manage all profiles" ON profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'super_admin'
    )
  );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT SELECT ON tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliates TO authenticated;

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;

-- Migration: 20250103000006_fix_profiles_rls_recursion.sql
-- Size: 2487 bytes
-- Fix infinite recursion in profiles RLS policies
-- This migration removes problematic policies and creates simple, direct policies for super admins

-- Drop all existing policies on profiles table to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Tenant admins can view tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Tenant admins can manage tenant profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;

-- Create simple, non-recursive policies

-- 1. Super admins can do everything (using direct role column check)
CREATE POLICY "super_admin_full_access" ON profiles
  FOR ALL
  TO authenticated
  USING (role = 'super_admin')
  WITH CHECK (role = 'super_admin');

-- 2. Users can view and update their own profile (using auth.uid() directly)
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Allow service role full access (for admin operations)
CREATE POLICY "service_role_full_access" ON profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant necessary permissions to roles
GRANT ALL PRIVILEGES ON profiles TO authenticated;
GRANT ALL PRIVILEGES ON profiles TO anon;
GRANT ALL PRIVILEGES ON profiles TO service_role;

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create a function to check if current user is super admin (without recursion)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  );
$$;

-- Alternative policy using the function (commented out to avoid conflicts)
-- DROP POLICY IF EXISTS "super_admin_access_via_function" ON profiles;
-- CREATE POLICY "super_admin_access_via_function" ON profiles
--   FOR ALL
--   TO authenticated
--   USING (is_super_admin())
--   WITH CHECK (is_super_admin());

COMMIT;

-- Migration: 20250103000007_fix_auth_users_rls_policy.sql
-- Size: 2442 bytes
-- Migração para permitir acesso aos dados da tabela auth.users para super admins
-- Criando uma função que retorna os dados dos usuários de forma segura

-- Criar função para buscar dados de usuários (apenas para super admins)
CREATE OR REPLACE FUNCTION public.get_auth_users_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Verificar se o usuário atual é super admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super administradores podem acessar esta função';
  END IF;

  -- Retornar dados dos usuários
  RETURN QUERY
  SELECT 
    au.id,
    au.email::text,
    au.created_at,
    au.last_sign_in_at,
    au.email_confirmed_at
  FROM auth.users au
  WHERE au.deleted_at IS NULL
  ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Dar permissões para usuários autenticados chamarem a função
GRANT EXECUTE ON FUNCTION public.get_auth_users_for_admin() TO authenticated;

-- Comentário explicativo
COMMENT ON FUNCTION public.get_auth_users_for_admin() IS 
'Função segura para permitir que super admins acessem dados básicos da tabela auth.users';

-- Dropar a view existente se houver
DROP VIEW IF EXISTS public.admin_users_view;

-- Criar uma view que combina dados de auth.users com profiles
CREATE VIEW public.admin_users_view AS
SELECT 
  au.id,
  au.email,
  au.created_at,
  au.last_sign_in_at,
  au.email_confirmed_at,
  p.tenant_id,
  p.first_name,
  p.last_name,
  p.role,
  p.is_active,
  p.phone,
  p.updated_at as profile_updated_at
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.user_id
WHERE au.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles current_user_profile
    WHERE current_user_profile.user_id = auth.uid()
    AND current_user_profile.role = 'super_admin'
  )
ORDER BY au.created_at DESC;

-- Adicionar política RLS para a view
ALTER VIEW public.admin_users_view OWNER TO postgres;
GRANT SELECT ON public.admin_users_view TO authenticated;

-- Comentário na view
COMMENT ON VIEW public.admin_users_view IS 
'View que combina dados de auth.users com profiles, acessível apenas para super admins';

-- Migration: 20250106000001_create_individual_followups.sql
-- Size: 3732 bytes
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

-- Migration: 20250109000001_fix_chatbots_schema.sql
-- Size: 7810 bytes
-- Fix chatbots schema to match TypeScript types and add conversations table
-- This migration addresses critical issues identified in the analysis

-- First, create conversations table to organize messages by conversation
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    assigned_to UUID REFERENCES public.profiles(id),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, contact_id, whatsapp_instance_id)
);

-- Update chatbots table to match TypeScript interface
ALTER TABLE public.chatbots 
    DROP COLUMN IF EXISTS trigger_phrases,
    DROP COLUMN IF EXISTS response_message,
    DROP COLUMN IF EXISTS response_type,
    DROP COLUMN IF EXISTS media_url,
    DROP COLUMN IF EXISTS variables,
    DROP COLUMN IF EXISTS conditions;

-- Add new columns to match TypeScript interface
ALTER TABLE public.chatbots 
    ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'simple' CHECK (type IN ('simple', 'flow')),
    ADD COLUMN IF NOT EXISTS triggers JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS responses JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS flow JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS analytics JSONB DEFAULT '{
        "totalInteractions": 0,
        "successRate": 0,
        "averageResponseTime": 0,
        "topTriggers": [],
        "interactionsByDay": []
    }';

-- Rename columns to match TypeScript interface
ALTER TABLE public.chatbots 
    RENAME COLUMN is_active TO "isActive";

-- Add conversation_id to messages table
ALTER TABLE public.messages 
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id);

-- Create chatbot_interactions table for analytics
CREATE TABLE IF NOT EXISTS public.chatbot_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
    contact_phone TEXT NOT NULL,
    message TEXT NOT NULL,
    response TEXT NOT NULL,
    was_successful BOOLEAN DEFAULT true,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON public.conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations(assigned_to);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_tenant_id ON public.chatbot_interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_chatbot_id ON public.chatbot_interactions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_created_at ON public.chatbot_interactions(created_at DESC);

-- Add triggers for updated_at
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chatbots_updated_at
    BEFORE UPDATE ON public.chatbots
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically create/update conversations when messages are inserted
CREATE OR REPLACE FUNCTION public.handle_message_conversation()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Find or create conversation
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE tenant_id = NEW.tenant_id 
        AND contact_id = NEW.contact_id 
        AND whatsapp_instance_id = NEW.whatsapp_instance_id;
    
    IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (
            tenant_id, 
            contact_id, 
            whatsapp_instance_id, 
            last_message_at,
            unread_count
        ) VALUES (
            NEW.tenant_id, 
            NEW.contact_id, 
            NEW.whatsapp_instance_id, 
            NEW.created_at,
            CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END
        ) RETURNING id INTO v_conversation_id;
    ELSE
        -- Update existing conversation
        UPDATE public.conversations 
        SET 
            last_message_at = NEW.created_at,
            unread_count = CASE 
                WHEN NEW.direction = 'inbound' THEN unread_count + 1 
                ELSE unread_count 
            END,
            updated_at = now()
        WHERE id = v_conversation_id;
    END IF;
    
    -- Set conversation_id in the message
    NEW.conversation_id = v_conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic conversation handling
DROP TRIGGER IF EXISTS trigger_handle_message_conversation ON public.messages;
CREATE TRIGGER trigger_handle_message_conversation
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_message_conversation();

-- RLS Policies for new tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_interactions ENABLE ROW LEVEL SECURITY;

-- Conversations policies
CREATE POLICY "Users can view their tenant conversations" ON public.conversations
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant conversations" ON public.conversations
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Chatbot interactions policies
CREATE POLICY "Users can view their tenant chatbot interactions" ON public.chatbot_interactions
    FOR SELECT USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users can manage their tenant chatbot interactions" ON public.chatbot_interactions
    FOR ALL USING (tenant_id = public.get_current_user_tenant_id());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_interactions TO authenticated;
GRANT SELECT ON public.conversations TO anon;
GRANT SELECT ON public.chatbot_interactions TO anon;

-- Comments for documentation
COMMENT ON TABLE public.conversations IS 'Organizes messages into conversations by contact and WhatsApp instance';
COMMENT ON TABLE public.chatbot_interactions IS 'Tracks chatbot interactions for analytics and performance monitoring';
COMMENT ON COLUMN public.chatbots.triggers IS 'JSON array of trigger objects with id, phrase, and isActive properties';
COMMENT ON COLUMN public.chatbots.responses IS 'JSON array of response objects with id, message, variables, and order properties';
COMMENT ON COLUMN public.chatbots.flow IS 'JSON object representing the chatbot flow for complex bots';
COMMENT ON COLUMN public.chatbots.analytics IS 'JSON object with analytics data including interactions, success rate, etc.';

-- Migration: 20250109000002_add_conversation_id_to_messages.sql
-- Size: 2414 bytes
-- Add conversation_id to messages table to link messages to conversations
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

-- Function to automatically manage conversations when messages are inserted
CREATE OR REPLACE FUNCTION handle_message_conversation()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Find existing conversation for this contact and whatsapp instance
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE contact_id = NEW.contact_id 
      AND whatsapp_instance_id = NEW.whatsapp_instance_id
      AND tenant_id = NEW.tenant_id;
    
    -- If no conversation exists, create one
    IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (
            tenant_id,
            contact_id,
            whatsapp_instance_id,
            last_message_at,
            unread_count,
            is_archived
        ) VALUES (
            NEW.tenant_id,
            NEW.contact_id,
            NEW.whatsapp_instance_id,
            NEW.created_at,
            CASE WHEN NEW.direction = 'incoming' THEN 1 ELSE 0 END,
            false
        ) RETURNING id INTO v_conversation_id;
    ELSE
        -- Update existing conversation
        UPDATE public.conversations
        SET last_message_at = NEW.created_at,
            unread_count = CASE 
                WHEN NEW.direction = 'incoming' THEN unread_count + 1 
                ELSE unread_count 
            END,
            updated_at = NOW()
        WHERE id = v_conversation_id;
    END IF;
    
    -- Set conversation_id in the message
    NEW.conversation_id = v_conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically handle conversations
DROP TRIGGER IF EXISTS trigger_handle_message_conversation ON public.messages;
CREATE TRIGGER trigger_handle_message_conversation
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION handle_message_conversation();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT ON public.conversations TO anon;
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- Migration: 20250109000003_add_webhook_logging_tables.sql
-- Size: 3461 bytes
-- Criar tabela para logs de webhook
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB,
    destination TEXT,
    sender TEXT,
    server_url TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar tabela para erros de webhook
CREATE TABLE IF NOT EXISTS public.webhook_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_instance_name ON public.webhook_logs(instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON public.webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_errors_instance_name ON public.webhook_errors(instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_event_type ON public.webhook_errors(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_created_at ON public.webhook_errors(created_at);

-- Habilitar RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_errors ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para webhook_logs
CREATE POLICY "webhook_logs_select_policy" ON public.webhook_logs
    FOR SELECT USING (true);

CREATE POLICY "webhook_logs_insert_policy" ON public.webhook_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "webhook_logs_update_policy" ON public.webhook_logs
    FOR UPDATE USING (true);

CREATE POLICY "webhook_logs_delete_policy" ON public.webhook_logs
    FOR DELETE USING (true);

-- Políticas de RLS para webhook_errors
CREATE POLICY "webhook_errors_select_policy" ON public.webhook_errors
    FOR SELECT USING (true);

CREATE POLICY "webhook_errors_insert_policy" ON public.webhook_errors
    FOR INSERT WITH CHECK (true);

CREATE POLICY "webhook_errors_update_policy" ON public.webhook_errors
    FOR UPDATE USING (true);

CREATE POLICY "webhook_errors_delete_policy" ON public.webhook_errors
    FOR DELETE USING (true);

-- Conceder permissões
GRANT ALL PRIVILEGES ON public.webhook_logs TO anon;
GRANT ALL PRIVILEGES ON public.webhook_logs TO authenticated;
GRANT ALL PRIVILEGES ON public.webhook_errors TO anon;
GRANT ALL PRIVILEGES ON public.webhook_errors TO authenticated;

-- Comentários para documentação
COMMENT ON TABLE public.webhook_logs IS 'Logs de eventos de webhook da Evolution API';
COMMENT ON TABLE public.webhook_errors IS 'Erros ocorridos durante processamento de webhooks';

COMMENT ON COLUMN public.webhook_logs.instance_name IS 'Nome da instância do WhatsApp';
COMMENT ON COLUMN public.webhook_logs.event_type IS 'Tipo do evento (messages.upsert, connection.update, etc.)';
COMMENT ON COLUMN public.webhook_logs.event_data IS 'Dados completos do evento em formato JSON';
COMMENT ON COLUMN public.webhook_logs.processed_at IS 'Timestamp de quando o evento foi processado';

COMMENT ON COLUMN public.webhook_errors.error_message IS 'Mensagem de erro';
COMMENT ON COLUMN public.webhook_errors.error_stack IS 'Stack trace do erro para debugging';

-- Migration: 20250116000001_fix_tracking_views_rls.sql
-- Size: 1120 bytes
-- Fix access to tracking materialized views by creating filtered views
-- Since materialized views don't support RLS, we create regular views with tenant filtering

-- Create a filtered view for tracking_metrics_daily
CREATE OR REPLACE VIEW tracking_metrics_daily_filtered AS
SELECT *
FROM tracking_metrics_daily
WHERE tenant_id = public.get_current_user_tenant_id();

-- Create a filtered view for campaign_performance_daily
CREATE OR REPLACE VIEW campaign_performance_daily_filtered AS
SELECT *
FROM campaign_performance_daily
WHERE tenant_id = public.get_current_user_tenant_id();

-- Grant permissions on the new filtered views
GRANT SELECT ON tracking_metrics_daily_filtered TO anon, authenticated;
GRANT SELECT ON campaign_performance_daily_filtered TO anon, authenticated;

-- Add comments for documentation
COMMENT ON VIEW tracking_metrics_daily_filtered IS 'Filtered view of tracking_metrics_daily that automatically applies tenant filtering';
COMMENT ON VIEW campaign_performance_daily_filtered IS 'Filtered view of campaign_performance_daily that automatically applies tenant filtering';

-- Migration: 20250802124822_ffaf56b4-9a87-43da-9fe9-7cfb0d851f34.sql
-- Size: 17128 bytes
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

-- Migration: 20250802124911_5e2a2334-ed02-466b-80ac-595ded5a719e.sql
-- Size: 17113 bytes
-- Criar enum para roles de usuário
CREATE TYPE public.user_role AS ENUM ('super_admin', 'tenant_admin', 'user');

-- Criar enum para status de tenant
CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'trial', 'past_due', 'canceled');

-- Criar enum para status de instância WhatsApp
CREATE TYPE public.instance_status AS ENUM ('connected', 'disconnected', 'connecting', 'error');

-- Criar enum para status de campanha
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'canceled');

-- Criar enum para tipo de follow-up
CREATE TYPE public.followup_trigger_type AS ENUM ('time_based', 'stage_change', 'tag_added');

-- Criar enum para status de contato
CREATE TYPE public.contact_status AS ENUM ('new', 'qualified', 'nurturing', 'converted', 'lost');

-- =============================================
-- TABELAS CENTRAIS (Core & Multi-tenancy)
-- =============================================

-- Tabela de tenants (empresas clientes)
CREATE TABLE public.tenants (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    domain TEXT,
    status tenant_status NOT NULL DEFAULT 'trial',
    subscription_id TEXT, -- Stripe subscription ID
    plan_name TEXT DEFAULT 'basic',
    max_users INTEGER DEFAULT 1,
    max_instances INTEGER DEFAULT 1,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    affiliate_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'user',
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de instâncias WhatsApp
CREATE TABLE public.whatsapp_instances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instance_key TEXT NOT NULL UNIQUE,
    phone_number TEXT,
    profile_name TEXT,
    status instance_status NOT NULL DEFAULT 'disconnected',
    webhook_url TEXT,
    api_key TEXT,
    qr_code TEXT,
    last_seen TIMESTAMP WITH TIME ZONE,
    message_count INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABELAS DE CRM E CONTATOS
-- =============================================

-- Tabela de estágios do funil
CREATE TABLE public.funnel_stages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    position INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, position)
);

-- Tabela de fontes de leads
CREATE TABLE public.lead_sources (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    trigger_phrase TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de contatos/leads
CREATE TABLE public.contacts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    funnel_stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
    lead_source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
    name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    status contact_status NOT NULL DEFAULT 'new',
    first_message TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    opt_out_mass_message BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, phone)
);

-- Tabela de tags
CREATE TABLE public.tags (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- Tabela de relacionamento entre contatos e tags
CREATE TABLE public.contact_tags (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(contact_id, tag_id)
);

-- Tabela de mensagens
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    message_id TEXT, -- ID da Evolution API
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type TEXT DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    caption TEXT,
    is_from_bot BOOLEAN NOT NULL DEFAULT false,
    campaign_id UUID,
    read_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABELAS DE AUTOMAÇÃO
-- =============================================

-- Tabela de chatbots
CREATE TABLE public.chatbots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_phrase TEXT NOT NULL,
    response_message TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de campanhas de disparo em massa
CREATE TABLE public.mass_message_campaigns (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status campaign_status NOT NULL DEFAULT 'draft',
    target_tags JSONB DEFAULT '[]',
    delay_between_messages INTEGER DEFAULT 60, -- segundos
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de variações de mensagem (Spintax)
CREATE TABLE public.campaign_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url TEXT,
    caption TEXT,
    weight INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de fila de processamento para disparos
CREATE TABLE public.campaign_dispatch_queue (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    message_content TEXT NOT NULL,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de sequências de follow-up
CREATE TABLE public.follow_up_sequences (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    funnel_stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type followup_trigger_type NOT NULL DEFAULT 'time_based',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de etapas do follow-up
CREATE TABLE public.follow_up_steps (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    message_content TEXT NOT NULL,
    delay_hours INTEGER NOT NULL DEFAULT 24,
    conditions JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(sequence_id, step_number)
);

-- =============================================
-- TABELAS DO SUPER ADMINISTRADOR
-- =============================================

-- Tabela de afiliados
CREATE TABLE public.affiliates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    referral_code TEXT NOT NULL UNIQUE,
    commission_rate_first_month DECIMAL(5,4) DEFAULT 0.30,
    commission_rate_recurring DECIMAL(5,4) DEFAULT 0.10,
    stripe_account_id TEXT, -- Stripe Connect Account ID
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de referências de afiliados
CREATE TABLE public.affiliate_referrals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    commission_first_month DECIMAL(10,2),
    commission_recurring DECIMAL(10,2),
    total_paid DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de cupons
CREATE TABLE public.coupons (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    stripe_coupon_id TEXT NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    valid_until TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de relatórios agendados
CREATE TABLE public.scheduled_reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    report_type TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    recipients JSONB NOT NULL DEFAULT '[]',
    filters JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    next_send_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índices para queries frequentes
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_whatsapp_instances_tenant_id ON public.whatsapp_instances(tenant_id);
CREATE INDEX idx_contacts_tenant_id ON public.contacts(tenant_id);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_funnel_stage_id ON public.contacts(funnel_stage_id);
CREATE INDEX idx_messages_tenant_id ON public.messages(tenant_id);
CREATE INDEX idx_messages_contact_id ON public.messages(contact_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_campaign_dispatch_queue_scheduled_for ON public.campaign_dispatch_queue(scheduled_for);
CREATE INDEX idx_campaign_dispatch_queue_status ON public.campaign_dispatch_queue(status);

-- =============================================
-- TRIGGERS PARA UPDATED_AT
-- =============================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em todas as tabelas relevantes
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_funnel_stages_updated_at BEFORE UPDATE ON public.funnel_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lead_sources_updated_at BEFORE UPDATE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chatbots_updated_at BEFORE UPDATE ON public.chatbots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mass_message_campaigns_updated_at BEFORE UPDATE ON public.mass_message_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_follow_up_sequences_updated_at BEFORE UPDATE ON public.follow_up_sequences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_follow_up_steps_updated_at BEFORE UPDATE ON public.follow_up_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_affiliates_updated_at BEFORE UPDATE ON public.affiliates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_affiliate_referrals_updated_at BEFORE UPDATE ON public.affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduled_reports_updated_at BEFORE UPDATE ON public.scheduled_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20250802125654_702d50aa-d987-4416-8970-e5ee92a989c6.sql
-- Size: 8174 bytes
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

-- Migration: 20250802125731_a5db549f-8006-4089-b833-c35207947487.sql
-- Size: 1284 bytes
-- Fix security function search path issues
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT public.get_current_user_role() = 'super_admin';
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, role, tenant_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    'tenant_user'::user_role,
    (SELECT id FROM public.tenants LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Migration: 20250802131206_e4b42387-c6a3-44e5-b191-1030ff4975bb.sql
-- Size: 1878 bytes
-- Add Evolution API configuration columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS evolution_api_url text,
ADD COLUMN IF NOT EXISTS evolution_api_key text;

-- Create function to handle Evolution API webhooks
CREATE OR REPLACE FUNCTION public.handle_evolution_webhook(
  instance_name text,
  event_type text,
  event_data jsonb
) RETURNS void AS $$
BEGIN
  -- Update instance status based on webhook events
  IF event_type = 'connection.update' THEN
    UPDATE public.whatsapp_instances 
    SET 
      status = COALESCE(event_data->>'state', status),
      qr_code = CASE 
        WHEN event_data->>'qr' IS NOT NULL THEN event_data->>'qr'
        WHEN event_data->>'state' = 'open' THEN NULL
        ELSE qr_code
      END,
      last_connected_at = CASE 
        WHEN event_data->>'state' = 'open' THEN now()
        ELSE last_connected_at
      END,
      profile_name = COALESCE(event_data->>'profileName', profile_name),
      profile_picture_url = COALESCE(event_data->>'profilePicUrl', profile_picture_url)
    WHERE instance_key = instance_name;
  END IF;

  -- Handle QR code updates
  IF event_type = 'qrcode.updated' THEN
    UPDATE public.whatsapp_instances 
    SET 
      qr_code = event_data->>'qr',
      status = 'qrcode'
    WHERE instance_key = instance_name;
  END IF;

  -- Log the webhook event for debugging
  INSERT INTO public.messages (
    contact_id, 
    tenant_id, 
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) SELECT 
    NULL,
    wi.tenant_id,
    wi.id,
    'system',
    'webhook',
    format('Webhook %s: %s', event_type, event_data::text),
    concat('webhook_', extract(epoch from now())),
    'received'
  FROM public.whatsapp_instances wi 
  WHERE wi.instance_key = instance_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: 20250802131719_ec15486c-a8c1-4258-bd24-96c9e84ca663.sql
-- Size: 6136 bytes
-- Create job queue system for background processing
CREATE TABLE public.job_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  job_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  current_attempts integer NOT NULL DEFAULT 0,
  scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for efficient job processing
CREATE INDEX idx_job_queue_status_priority ON public.job_queue(status, priority DESC, scheduled_at ASC);
CREATE INDEX idx_job_queue_tenant_type ON public.job_queue(tenant_id, job_type);
CREATE INDEX idx_job_queue_scheduled_at ON public.job_queue(scheduled_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Super admins can access all jobs" ON public.job_queue
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can access own tenant jobs" ON public.job_queue
  FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Create function to enqueue jobs
CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_tenant_id uuid,
  p_job_type text,
  p_job_data jsonb DEFAULT '{}',
  p_priority integer DEFAULT 0,
  p_scheduled_at timestamp with time zone DEFAULT now()
) RETURNS uuid AS $$
DECLARE
  job_id uuid;
BEGIN
  INSERT INTO public.job_queue (
    tenant_id,
    job_type,
    job_data,
    priority,
    scheduled_at
  ) VALUES (
    p_tenant_id,
    p_job_type,
    p_job_data,
    p_priority,
    p_scheduled_at
  ) RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to dequeue next job
CREATE OR REPLACE FUNCTION public.dequeue_next_job(
  p_job_types text[] DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  job_type text,
  job_data jsonb,
  current_attempts integer
) AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Find and lock the next job to process
  SELECT jq.id, jq.tenant_id, jq.job_type, jq.job_data, jq.current_attempts
  INTO job_record
  FROM public.job_queue jq
  WHERE jq.status = 'pending'
    AND jq.scheduled_at <= now()
    AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
  ORDER BY jq.priority DESC, jq.scheduled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job_record.id IS NOT NULL THEN
    -- Mark job as processing
    UPDATE public.job_queue 
    SET 
      status = 'processing',
      started_at = now(),
      current_attempts = current_attempts + 1,
      updated_at = now()
    WHERE public.job_queue.id = job_record.id;
    
    -- Return job details
    RETURN QUERY SELECT 
      job_record.id,
      job_record.tenant_id,
      job_record.job_type,
      job_record.job_data,
      job_record.current_attempts;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to mark job as completed
CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id uuid,
  p_success boolean DEFAULT TRUE,
  p_error_message text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  IF p_success THEN
    UPDATE public.job_queue 
    SET 
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.job_queue 
    SET 
      status = CASE 
        WHEN current_attempts >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      failed_at = CASE 
        WHEN current_attempts >= max_attempts THEN now()
        ELSE NULL
      END,
      error_message = p_error_message,
      updated_at = now(),
      scheduled_at = CASE 
        WHEN current_attempts < max_attempts THEN now() + interval '5 minutes'
        ELSE scheduled_at
      END
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updated_at
CREATE TRIGGER update_job_queue_updated_at
  BEFORE UPDATE ON public.job_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create campaign execution tracking
CREATE TABLE public.campaign_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  failed_at timestamp with time zone,
  error_message text,
  job_id uuid REFERENCES public.job_queue(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_campaign_executions_campaign ON public.campaign_executions(campaign_id);
CREATE INDEX idx_campaign_executions_status ON public.campaign_executions(status);
CREATE INDEX idx_campaign_executions_scheduled ON public.campaign_executions(scheduled_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.campaign_executions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Super admins can access all campaign executions" ON public.campaign_executions
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can access own tenant campaign executions" ON public.campaign_executions
  FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Create trigger for updated_at
CREATE TRIGGER update_campaign_executions_updated_at
  BEFORE UPDATE ON public.campaign_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20250802131928_8bc06701-8108-4be0-9503-c45f087e6678.sql
-- Size: 4338 bytes
-- Fix search path for security compliance
CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_tenant_id uuid,
  p_job_type text,
  p_job_data jsonb DEFAULT '{}',
  p_priority integer DEFAULT 0,
  p_scheduled_at timestamp with time zone DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_id uuid;
BEGIN
  INSERT INTO public.job_queue (
    tenant_id,
    job_type,
    job_data,
    priority,
    scheduled_at
  ) VALUES (
    p_tenant_id,
    p_job_type,
    p_job_data,
    p_priority,
    p_scheduled_at
  ) RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dequeue_next_job(
  p_job_types text[] DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  job_type text,
  job_data jsonb,
  current_attempts integer
)
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Find and lock the next job to process
  SELECT jq.id, jq.tenant_id, jq.job_type, jq.job_data, jq.current_attempts
  INTO job_record
  FROM public.job_queue jq
  WHERE jq.status = 'pending'
    AND jq.scheduled_at <= now()
    AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
  ORDER BY jq.priority DESC, jq.scheduled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job_record.id IS NOT NULL THEN
    -- Mark job as processing
    UPDATE public.job_queue 
    SET 
      status = 'processing',
      started_at = now(),
      current_attempts = current_attempts + 1,
      updated_at = now()
    WHERE public.job_queue.id = job_record.id;
    
    -- Return job details
    RETURN QUERY SELECT 
      job_record.id,
      job_record.tenant_id,
      job_record.job_type,
      job_record.job_data,
      job_record.current_attempts;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id uuid,
  p_success boolean DEFAULT TRUE,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.job_queue 
    SET 
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.job_queue 
    SET 
      status = CASE 
        WHEN current_attempts >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      failed_at = CASE 
        WHEN current_attempts >= max_attempts THEN now()
        ELSE NULL
      END,
      error_message = p_error_message,
      updated_at = now(),
      scheduled_at = CASE 
        WHEN current_attempts < max_attempts THEN now() + interval '5 minutes'
        ELSE scheduled_at
      END
    WHERE id = p_job_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_evolution_webhook(
  instance_name text,
  event_type text,
  event_data jsonb
) RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Update instance status based on webhook events
  IF event_type = 'connection.update' THEN
    UPDATE public.whatsapp_instances 
    SET 
      status = COALESCE(event_data->>'state', status),
      qr_code = CASE 
        WHEN event_data->>'qr' IS NOT NULL THEN event_data->>'qr'
        WHEN event_data->>'state' = 'open' THEN NULL
        ELSE qr_code
      END,
      last_connected_at = CASE 
        WHEN event_data->>'state' = 'open' THEN now()
        ELSE last_connected_at
      END,
      profile_name = COALESCE(event_data->>'profileName', profile_name),
      profile_picture_url = COALESCE(event_data->>'profilePicUrl', profile_picture_url)
    WHERE instance_key = instance_name;
  END IF;

  -- Handle QR code updates
  IF event_type = 'qrcode.updated' THEN
    UPDATE public.whatsapp_instances 
    SET 
      qr_code = event_data->>'qr',
      status = 'qrcode'
    WHERE instance_key = instance_name;
  END IF;

  -- Log the webhook event for debugging
  INSERT INTO public.messages (
    contact_id, 
    tenant_id, 
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) SELECT 
    NULL,
    wi.tenant_id,
    wi.id,
    'system',
    'webhook',
    format('Webhook %s: %s', event_type, event_data::text),
    concat('webhook_', extract(epoch from now())),
    'received'
  FROM public.whatsapp_instances wi 
  WHERE wi.instance_key = instance_name;
END;
$$;

-- Migration: 20250802132106_8a4ae043-dbbe-4c7d-bb90-d660a8d6f8e2.sql
-- Size: 4939 bytes
-- Create function to increment campaign sent count
CREATE OR REPLACE FUNCTION public.increment_campaign_sent_count(
  p_campaign_id uuid
) RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.mass_message_campaigns 
  SET 
    sent_count = sent_count + 1,
    updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

-- Create function to schedule campaign messages
CREATE OR REPLACE FUNCTION public.schedule_campaign_messages(
  p_campaign_id uuid
) RETURNS integer
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  campaign_record RECORD;
  contact_record RECORD;
  message_text TEXT;
  delay_seconds INTEGER := 0;
  scheduled_count INTEGER := 0;
  execution_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get campaign details
  SELECT * INTO campaign_record
  FROM public.mass_message_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Get target contacts
  FOR contact_record IN
    SELECT c.id, c.phone, c.name
    FROM public.contacts c
    WHERE c.tenant_id = campaign_record.tenant_id
      AND c.is_blocked = FALSE
      AND c.opt_out_mass_message = FALSE
      AND (
        array_length(campaign_record.target_tags, 1) IS NULL OR
        EXISTS (
          SELECT 1 FROM public.contact_tags ct
          WHERE ct.contact_id = c.id
            AND ct.tag_id = ANY(campaign_record.target_tags)
        )
      )
      AND (
        array_length(campaign_record.target_stages, 1) IS NULL OR
        c.current_stage_id = ANY(campaign_record.target_stages)
      )
  LOOP
    -- Calculate execution time with delay
    execution_time := COALESCE(campaign_record.scheduled_at, now()) + (delay_seconds * interval '1 second');
    
    -- Create campaign execution record
    INSERT INTO public.campaign_executions (
      campaign_id,
      tenant_id,
      contact_id,
      message_text,
      scheduled_at
    ) VALUES (
      p_campaign_id,
      campaign_record.tenant_id,
      contact_record.id,
      campaign_record.message_template,
      execution_time
    );

    -- Enqueue job for this message
    PERFORM public.enqueue_job(
      campaign_record.tenant_id,
      'campaign_message',
      jsonb_build_object(
        'campaignId', p_campaign_id,
        'contactId', contact_record.id,
        'messageText', campaign_record.message_template,
        'instanceName', (
          SELECT instance_key 
          FROM public.whatsapp_instances 
          WHERE id = campaign_record.whatsapp_instance_id
        )
      ),
      1, -- High priority for campaigns
      execution_time
    );

    scheduled_count := scheduled_count + 1;
    delay_seconds := delay_seconds + COALESCE(campaign_record.delay_between_messages, 30);
  END LOOP;

  -- Update campaign status and counts
  UPDATE public.mass_message_campaigns
  SET 
    status = 'scheduled',
    total_recipients = scheduled_count,
    started_at = now(),
    updated_at = now()
  WHERE id = p_campaign_id;

  RETURN scheduled_count;
END;
$$;

-- Create function to schedule follow-up messages
CREATE OR REPLACE FUNCTION public.schedule_follow_up_message(
  p_contact_id uuid,
  p_sequence_id uuid,
  p_step_id uuid,
  p_delay_hours integer
) RETURNS uuid
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_id uuid;
  contact_record RECORD;
  sequence_record RECORD;
BEGIN
  -- Get contact and sequence info
  SELECT c.tenant_id, c.phone, c.name INTO contact_record
  FROM public.contacts c
  WHERE c.id = p_contact_id;

  SELECT s.whatsapp_instance_id INTO sequence_record
  FROM public.follow_up_sequences s
  WHERE s.id = p_sequence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact or sequence not found';
  END IF;

  -- Enqueue follow-up job
  SELECT public.enqueue_job(
    contact_record.tenant_id,
    'follow_up_message',
    jsonb_build_object(
      'sequenceId', p_sequence_id,
      'stepId', p_step_id,
      'contactId', p_contact_id,
      'instanceName', (
        SELECT instance_key 
        FROM public.whatsapp_instances 
        WHERE id = sequence_record.whatsapp_instance_id
      )
    ),
    0, -- Normal priority
    now() + (p_delay_hours * interval '1 hour')
  ) INTO job_id;

  RETURN job_id;
END;
$$;

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job worker to run every minute
SELECT cron.schedule(
  'job-worker-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/job-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) as request_id;
  $$
);

-- Migration: 20250802151159_ffd7d7c5-3daa-4fbb-838c-6369cc6e74a6.sql
-- Size: 4422 bytes
-- Create webhook handler for incoming WhatsApp messages and chatbot processing
CREATE OR REPLACE FUNCTION public.process_incoming_message(
  p_phone text,
  p_message_content text,
  p_whatsapp_instance_id uuid,
  p_evolution_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact_id uuid;
  v_tenant_id uuid;
  v_message_id uuid;
  v_chatbot chatbots%ROWTYPE;
  v_response_data jsonb;
  v_job_id uuid;
BEGIN
  -- Get tenant_id from whatsapp instance
  SELECT tenant_id INTO v_tenant_id
  FROM public.whatsapp_instances 
  WHERE id = p_whatsapp_instance_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp instance not found';
  END IF;

  -- Find or create contact
  SELECT id INTO v_contact_id
  FROM public.contacts 
  WHERE phone = p_phone AND tenant_id = v_tenant_id;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (tenant_id, phone, whatsapp_instance_id, first_message, last_interaction_at)
    VALUES (v_tenant_id, p_phone, p_whatsapp_instance_id, p_message_content, now())
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts 
    SET last_interaction_at = now()
    WHERE id = v_contact_id;
  END IF;

  -- Save incoming message
  INSERT INTO public.messages (
    contact_id,
    tenant_id,
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) VALUES (
    v_contact_id,
    v_tenant_id,
    p_whatsapp_instance_id,
    'inbound',
    'text',
    p_message_content,
    p_evolution_message_id,
    'received'
  ) RETURNING id INTO v_message_id;

  -- Find matching chatbot
  SELECT * INTO v_chatbot
  FROM public.chatbots
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND (whatsapp_instance_id IS NULL OR whatsapp_instance_id = p_whatsapp_instance_id)
    AND (
      trigger_type = 'all' OR
      (trigger_type = 'keyword' AND p_message_content ILIKE ANY(trigger_phrases))
    )
  ORDER BY 
    CASE WHEN whatsapp_instance_id = p_whatsapp_instance_id THEN 1 ELSE 2 END,
    priority DESC
  LIMIT 1;

  -- If chatbot found, enqueue response
  IF v_chatbot.id IS NOT NULL THEN
    SELECT public.enqueue_job(
      v_tenant_id,
      'chatbot_response',
      jsonb_build_object(
        'chatbotId', v_chatbot.id,
        'contactId', v_contact_id,
        'incomingMessage', p_message_content,
        'instanceName', (
          SELECT instance_key 
          FROM public.whatsapp_instances 
          WHERE id = p_whatsapp_instance_id
        )
      ),
      2 -- High priority for chatbot responses
    ) INTO v_job_id;

    v_response_data := jsonb_build_object(
      'matched', true,
      'chatbot_id', v_chatbot.id,
      'chatbot_name', v_chatbot.name,
      'job_id', v_job_id
    );
  ELSE
    v_response_data := jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'message_id', v_message_id,
    'chatbot_response', v_response_data
  );
END;
$function$;

-- Create function to process variables in chatbot messages
CREATE OR REPLACE FUNCTION public.process_chatbot_variables(
  p_message_template text,
  p_contact_id uuid,
  p_incoming_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact contacts%ROWTYPE;
  v_processed_message text;
BEGIN
  -- Get contact data
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;

  v_processed_message := p_message_template;

  -- Replace contact variables
  v_processed_message := REPLACE(v_processed_message, '{name}', COALESCE(v_contact.name, 'there'));
  v_processed_message := REPLACE(v_processed_message, '{phone}', v_contact.phone);
  v_processed_message := REPLACE(v_processed_message, '{first_name}', SPLIT_PART(COALESCE(v_contact.name, ''), ' ', 1));
  
  -- Replace message variables
  v_processed_message := REPLACE(v_processed_message, '{incoming_message}', COALESCE(p_incoming_message, ''));
  
  -- Replace time variables
  v_processed_message := REPLACE(v_processed_message, '{time}', TO_CHAR(now(), 'HH24:MI'));
  v_processed_message := REPLACE(v_processed_message, '{date}', TO_CHAR(now(), 'DD/MM/YYYY'));
  v_processed_message := REPLACE(v_processed_message, '{datetime}', TO_CHAR(now(), 'DD/MM/YYYY HH24:MI'));

  RETURN v_processed_message;
END;
$function$;

-- Migration: 20250802151308_7fb09959-c899-45bd-8898-2cf56f6ff058.sql
-- Size: 5677 bytes
-- First create the chatbots table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.chatbots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'keyword'::text,
  trigger_phrases text[] DEFAULT '{}'::text[],
  response_type text DEFAULT 'text'::text,
  response_message text NOT NULL,
  media_url text,
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  whatsapp_instance_id uuid,
  conditions jsonb DEFAULT '{}'::jsonb,
  variables jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbots ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Super admins can access all chatbots" 
ON public.chatbots 
FOR ALL 
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Users can access own tenant chatbots" 
ON public.chatbots 
FOR ALL 
TO authenticated
USING (tenant_id = public.get_current_user_tenant_id());

-- Create updated_at trigger
CREATE TRIGGER update_chatbots_updated_at
BEFORE UPDATE ON public.chatbots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Now create the webhook handler functions
CREATE OR REPLACE FUNCTION public.process_incoming_message(
  p_phone text,
  p_message_content text,
  p_whatsapp_instance_id uuid,
  p_evolution_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact_id uuid;
  v_tenant_id uuid;
  v_message_id uuid;
  v_chatbot public.chatbots%ROWTYPE;
  v_response_data jsonb;
  v_job_id uuid;
BEGIN
  -- Get tenant_id from whatsapp instance
  SELECT tenant_id INTO v_tenant_id
  FROM public.whatsapp_instances 
  WHERE id = p_whatsapp_instance_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp instance not found';
  END IF;

  -- Find or create contact
  SELECT id INTO v_contact_id
  FROM public.contacts 
  WHERE phone = p_phone AND tenant_id = v_tenant_id;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (tenant_id, phone, whatsapp_instance_id, first_message, last_interaction_at)
    VALUES (v_tenant_id, p_phone, p_whatsapp_instance_id, p_message_content, now())
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts 
    SET last_interaction_at = now()
    WHERE id = v_contact_id;
  END IF;

  -- Save incoming message
  INSERT INTO public.messages (
    contact_id,
    tenant_id,
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) VALUES (
    v_contact_id,
    v_tenant_id,
    p_whatsapp_instance_id,
    'inbound',
    'text',
    p_message_content,
    p_evolution_message_id,
    'received'
  ) RETURNING id INTO v_message_id;

  -- Find matching chatbot
  SELECT * INTO v_chatbot
  FROM public.chatbots
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND (whatsapp_instance_id IS NULL OR whatsapp_instance_id = p_whatsapp_instance_id)
    AND (
      trigger_type = 'all' OR
      (trigger_type = 'keyword' AND p_message_content ILIKE ANY(trigger_phrases))
    )
  ORDER BY 
    CASE WHEN whatsapp_instance_id = p_whatsapp_instance_id THEN 1 ELSE 2 END,
    priority DESC
  LIMIT 1;

  -- If chatbot found, enqueue response
  IF v_chatbot.id IS NOT NULL THEN
    SELECT public.enqueue_job(
      v_tenant_id,
      'chatbot_response',
      jsonb_build_object(
        'chatbotId', v_chatbot.id,
        'contactId', v_contact_id,
        'incomingMessage', p_message_content,
        'instanceName', (
          SELECT instance_key 
          FROM public.whatsapp_instances 
          WHERE id = p_whatsapp_instance_id
        )
      ),
      2 -- High priority for chatbot responses
    ) INTO v_job_id;

    v_response_data := jsonb_build_object(
      'matched', true,
      'chatbot_id', v_chatbot.id,
      'chatbot_name', v_chatbot.name,
      'job_id', v_job_id
    );
  ELSE
    v_response_data := jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'message_id', v_message_id,
    'chatbot_response', v_response_data
  );
END;
$function$;

-- Create function to process variables in chatbot messages
CREATE OR REPLACE FUNCTION public.process_chatbot_variables(
  p_message_template text,
  p_contact_id uuid,
  p_incoming_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_processed_message text;
BEGIN
  -- Get contact data
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;

  v_processed_message := p_message_template;

  -- Replace contact variables
  v_processed_message := REPLACE(v_processed_message, '{name}', COALESCE(v_contact.name, 'there'));
  v_processed_message := REPLACE(v_processed_message, '{phone}', v_contact.phone);
  v_processed_message := REPLACE(v_processed_message, '{first_name}', SPLIT_PART(COALESCE(v_contact.name, ''), ' ', 1));
  
  -- Replace message variables
  v_processed_message := REPLACE(v_processed_message, '{incoming_message}', COALESCE(p_incoming_message, ''));
  
  -- Replace time variables
  v_processed_message := REPLACE(v_processed_message, '{time}', TO_CHAR(now(), 'HH24:MI'));
  v_processed_message := REPLACE(v_processed_message, '{date}', TO_CHAR(now(), 'DD/MM/YYYY'));
  v_processed_message := REPLACE(v_processed_message, '{datetime}', TO_CHAR(now(), 'DD/MM/YYYY HH24:MI'));

  RETURN v_processed_message;
END;
$function$;

-- Migration: 20250802151358_650e1241-c6f7-4f95-9644-7363efc6aeea.sql
-- Size: 4429 bytes
-- Create webhook handler functions only (chatbots table already exists)
CREATE OR REPLACE FUNCTION public.process_incoming_message(
  p_phone text,
  p_message_content text,
  p_whatsapp_instance_id uuid,
  p_evolution_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact_id uuid;
  v_tenant_id uuid;
  v_message_id uuid;
  v_chatbot public.chatbots%ROWTYPE;
  v_response_data jsonb;
  v_job_id uuid;
BEGIN
  -- Get tenant_id from whatsapp instance
  SELECT tenant_id INTO v_tenant_id
  FROM public.whatsapp_instances 
  WHERE id = p_whatsapp_instance_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp instance not found';
  END IF;

  -- Find or create contact
  SELECT id INTO v_contact_id
  FROM public.contacts 
  WHERE phone = p_phone AND tenant_id = v_tenant_id;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (tenant_id, phone, whatsapp_instance_id, first_message, last_interaction_at)
    VALUES (v_tenant_id, p_phone, p_whatsapp_instance_id, p_message_content, now())
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts 
    SET last_interaction_at = now()
    WHERE id = v_contact_id;
  END IF;

  -- Save incoming message
  INSERT INTO public.messages (
    contact_id,
    tenant_id,
    whatsapp_instance_id,
    direction,
    message_type,
    content,
    evolution_message_id,
    status
  ) VALUES (
    v_contact_id,
    v_tenant_id,
    p_whatsapp_instance_id,
    'inbound',
    'text',
    p_message_content,
    p_evolution_message_id,
    'received'
  ) RETURNING id INTO v_message_id;

  -- Find matching chatbot
  SELECT * INTO v_chatbot
  FROM public.chatbots
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND (whatsapp_instance_id IS NULL OR whatsapp_instance_id = p_whatsapp_instance_id)
    AND (
      trigger_type = 'all' OR
      (trigger_type = 'keyword' AND p_message_content ILIKE ANY(trigger_phrases))
    )
  ORDER BY 
    CASE WHEN whatsapp_instance_id = p_whatsapp_instance_id THEN 1 ELSE 2 END,
    priority DESC
  LIMIT 1;

  -- If chatbot found, enqueue response
  IF v_chatbot.id IS NOT NULL THEN
    SELECT public.enqueue_job(
      v_tenant_id,
      'chatbot_response',
      jsonb_build_object(
        'chatbotId', v_chatbot.id,
        'contactId', v_contact_id,
        'incomingMessage', p_message_content,
        'instanceName', (
          SELECT instance_key 
          FROM public.whatsapp_instances 
          WHERE id = p_whatsapp_instance_id
        )
      ),
      2 -- High priority for chatbot responses
    ) INTO v_job_id;

    v_response_data := jsonb_build_object(
      'matched', true,
      'chatbot_id', v_chatbot.id,
      'chatbot_name', v_chatbot.name,
      'job_id', v_job_id
    );
  ELSE
    v_response_data := jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'message_id', v_message_id,
    'chatbot_response', v_response_data
  );
END;
$function$;

-- Create function to process variables in chatbot messages
CREATE OR REPLACE FUNCTION public.process_chatbot_variables(
  p_message_template text,
  p_contact_id uuid,
  p_incoming_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_processed_message text;
BEGIN
  -- Get contact data
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;

  v_processed_message := p_message_template;

  -- Replace contact variables
  v_processed_message := REPLACE(v_processed_message, '{name}', COALESCE(v_contact.name, 'there'));
  v_processed_message := REPLACE(v_processed_message, '{phone}', v_contact.phone);
  v_processed_message := REPLACE(v_processed_message, '{first_name}', SPLIT_PART(COALESCE(v_contact.name, ''), ' ', 1));
  
  -- Replace message variables
  v_processed_message := REPLACE(v_processed_message, '{incoming_message}', COALESCE(p_incoming_message, ''));
  
  -- Replace time variables
  v_processed_message := REPLACE(v_processed_message, '{time}', TO_CHAR(now(), 'HH24:MI'));
  v_processed_message := REPLACE(v_processed_message, '{date}', TO_CHAR(now(), 'DD/MM/YYYY'));
  v_processed_message := REPLACE(v_processed_message, '{datetime}', TO_CHAR(now(), 'DD/MM/YYYY HH24:MI'));

  RETURN v_processed_message;
END;
$function$;

-- Migration: 20250802152533_59693243-5684-4190-aaf3-c87cc188fd82.sql
-- Size: 9558 bytes
-- Insert default tenant
INSERT INTO public.tenants (id, name, slug, status, plan_type, max_whatsapp_instances, max_users) 
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Demo Company',
  'demo-company',
  'active',
  'premium',
  5,
  10
) ON CONFLICT (id) DO NOTHING;

-- Insert funnel stages
INSERT INTO public.funnel_stages (id, tenant_id, name, description, "order", color, is_final) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Lead', 'Primeiro contato', 1, '#3B82F6', false),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'Interesse', 'Demonstrou interesse', 2, '#F59E0B', false),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'Proposta', 'Proposta enviada', 3, '#8B5CF6', false),
('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', 'Cliente', 'Conversão realizada', 4, '#10B981', true)
ON CONFLICT (id) DO NOTHING;

-- Insert tags
INSERT INTO public.tags (id, tenant_id, name, color, description) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440000', 'VIP', '#DC2626', 'Cliente VIP'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440000', 'WhatsApp', '#10B981', 'Contato pelo WhatsApp'),
('550e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440000', 'Urgente', '#F59E0B', 'Necessita atenção urgente'),
('550e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440000', 'Follow-up', '#3B82F6', 'Necessita acompanhamento')
ON CONFLICT (id) DO NOTHING;

-- Insert WhatsApp instance
INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, status, evolution_api_url, evolution_api_key) VALUES
('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440000', 'Principal', 'demo_instance', 'open', 'https://evolution-api.demo.com', 'demo_api_key')
ON CONFLICT (id) DO NOTHING;

-- Insert lead sources
INSERT INTO public.lead_sources (id, tenant_id, name, type, is_active, parameters) VALUES
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440000', 'Website', 'website', true, '{"url": "https://demo.com"}'),
('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440000', 'Facebook Ads', 'facebook', true, '{"campaign_id": "demo123"}'),
('550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440000', 'Google Ads', 'google', true, '{"campaign_id": "google123"}'),
('550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440000', 'Indicação', 'referral', true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Insert contacts
INSERT INTO public.contacts (id, tenant_id, phone, name, email, current_stage_id, lead_source_id, whatsapp_instance_id, first_message, last_interaction_at, notes) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440000', '+5511999999001', 'João Silva', 'joao@email.com', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440020', 'Olá, gostaria de saber mais sobre os produtos', now() - interval '2 days', 'Cliente interessado em soluções completas'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440000', '+5511999999002', 'Maria Santos', 'maria@email.com', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440020', 'Vi o anúncio no Facebook', now() - interval '1 day', 'Muito interessada, pediu orçamento'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440000', '+5511999999003', 'Pedro Costa', 'pedro@email.com', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440020', 'Preciso de uma solução urgente', now() - interval '4 hours', 'Cliente corporativo, grande potencial'),
('550e8400-e29b-41d4-a716-446655440043', '550e8400-e29b-41d4-a716-446655440000', '+5511999999004', 'Ana Oliveira', 'ana@email.com', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440020', 'Fui indicada por um amigo', now() - interval '1 hour', 'Cliente convertido, muito satisfeita'),
('550e8400-e29b-41d4-a716-446655440044', '550e8400-e29b-41d4-a716-446655440000', '+5511999999005', 'Carlos Mendes', 'carlos@email.com', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440020', 'Olá', now() - interval '30 minutes', 'Primeiro contato')
ON CONFLICT (id) DO NOTHING;

-- Insert contact tags
INSERT INTO public.contact_tags (contact_id, tag_id) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440011'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440011'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440013'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440010'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440012'),
('550e8400-e29b-41d4-a716-446655440043', '550e8400-e29b-41d4-a716-446655440010'),
('550e8400-e29b-41d4-a716-446655440044', '550e8400-e29b-41d4-a716-446655440011')
ON CONFLICT DO NOTHING;

-- Insert messages
INSERT INTO public.messages (id, tenant_id, contact_id, whatsapp_instance_id, direction, message_type, content, status, is_from_bot) VALUES
('550e8400-e29b-41d4-a716-446655440050', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Olá, gostaria de saber mais sobre os produtos', 'received', false),
('550e8400-e29b-41d4-a716-446655440051', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Olá João! Obrigado pelo interesse. Temos várias soluções que podem te ajudar.', 'sent', true),
('550e8400-e29b-41d4-a716-446655440052', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Vi o anúncio no Facebook', 'received', false),
('550e8400-e29b-41d4-a716-446655440053', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Oi Maria! Que bom que você nos encontrou. Posso te ajudar com mais informações?', 'sent', true),
('550e8400-e29b-41d4-a716-446655440054', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Preciso de uma solução urgente', 'received', false),
('550e8400-e29b-41d4-a716-446655440055', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Olá Pedro! Entendo a urgência. Vamos resolver isso rapidamente.', 'sent', true)
ON CONFLICT (id) DO NOTHING;

-- Insert chatbots
INSERT INTO public.chatbots (id, tenant_id, name, description, trigger_type, trigger_phrases, response_message, whatsapp_instance_id, is_active, priority) VALUES
('550e8400-e29b-41d4-a716-446655440060', '550e8400-e29b-41d4-a716-446655440000', 'Saudação Inicial', 'Bot de boas-vindas para novos contatos', 'keyword', ARRAY['olá', 'oi', 'hello', 'hey'], 'Olá {name}! 👋 Seja bem-vindo! Sou o assistente virtual e estou aqui para te ajudar. Como posso te auxiliar hoje?', '550e8400-e29b-41d4-a716-446655440020', true, 10),
('550e8400-e29b-41d4-a716-446655440061', '550e8400-e29b-41d4-a716-446655440000', 'Informações Comerciais', 'Respostas sobre produtos e serviços', 'keyword', ARRAY['preço', 'valor', 'quanto custa', 'produto', 'serviço'], 'Obrigado pelo interesse em nossos produtos! 💼 Temos várias opções que podem atender suas necessidades. Gostaria de falar com um consultor especializado?', '550e8400-e29b-41d4-a716-446655440020', true, 8),
('550e8400-e29b-41d4-a716-446655440062', '550e8400-e29b-41d4-a716-446655440000', 'Horário de Funcionamento', 'Informações sobre horários', 'keyword', ARRAY['horário', 'funcionamento', 'aberto', 'fechado'], 'Nosso horário de atendimento é:\n🕐 Segunda a Sexta: 8h às 18h\n🕐 Sábado: 8h às 12h\n❌ Domingo: Fechado\n\nFora desse horário, deixe sua mensagem que retornaremos assim que possível!', '550e8400-e29b-41d4-a716-446655440020', true, 5)
ON CONFLICT (id) DO NOTHING;

-- Insert campaigns
INSERT INTO public.mass_message_campaigns (id, tenant_id, name, description, message_template, whatsapp_instance_id, status, target_tags, target_stages, delay_between_messages, total_recipients, sent_count) VALUES
('550e8400-e29b-41d4-a716-446655440070', '550e8400-e29b-41d4-a716-446655440000', 'Campanha de Boas Vindas', 'Mensagem de boas-vindas para novos leads', 'Olá {name}! 🎉 Seja bem-vindo à nossa empresa. Estamos muito felizes em ter você conosco!', '550e8400-e29b-41d4-a716-446655440020', 'completed', ARRAY['550e8400-e29b-41d4-a716-446655440011'], ARRAY['550e8400-e29b-41d4-a716-446655440001'], 30, 5, 5),
('550e8400-e29b-41d4-a716-446655440071', '550e8400-e29b-41d4-a716-446655440000', 'Follow-up Interesse', 'Acompanhamento para leads interessados', 'Oi {name}! Vi que você demonstrou interesse em nossos produtos. Que tal agendarmos uma conversa rápida para te mostrar como podemos te ajudar? 📞', '550e8400-e29b-41d4-a716-446655440020', 'draft', ARRAY['550e8400-e29b-41d4-a716-446655440013'], ARRAY['550e8400-e29b-41d4-a716-446655440002'], 60, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Migration: 20250802152841_6b9a0926-234f-4b3b-b180-374a47206c1f.sql
-- Size: 9614 bytes
-- Insert default tenant
INSERT INTO public.tenants (id, name, slug, status, plan_type, max_whatsapp_instances, max_users) 
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Demo Company',
  'demo-company',
  'active',
  'premium',
  5,
  10
) ON CONFLICT (id) DO NOTHING;

-- Insert funnel stages
INSERT INTO public.funnel_stages (id, tenant_id, name, description, "order", color, is_final) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Lead', 'Primeiro contato', 1, '#3B82F6', false),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'Interesse', 'Demonstrou interesse', 2, '#F59E0B', false),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'Proposta', 'Proposta enviada', 3, '#8B5CF6', false),
('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', 'Cliente', 'Conversão realizada', 4, '#10B981', true)
ON CONFLICT (id) DO NOTHING;

-- Insert tags
INSERT INTO public.tags (id, tenant_id, name, color, description) VALUES
('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440000', 'VIP', '#DC2626', 'Cliente VIP'),
('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440000', 'WhatsApp', '#10B981', 'Contato pelo WhatsApp'),
('550e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440000', 'Urgente', '#F59E0B', 'Necessita atenção urgente'),
('550e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440000', 'Follow-up', '#3B82F6', 'Necessita acompanhamento')
ON CONFLICT (id) DO NOTHING;

-- Insert WhatsApp instance
INSERT INTO public.whatsapp_instances (id, tenant_id, name, instance_key, status, evolution_api_url, evolution_api_key) VALUES
('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440000', 'Principal', 'demo_instance', 'open', 'https://evolution-api.demo.com', 'demo_api_key')
ON CONFLICT (id) DO NOTHING;

-- Insert lead sources
INSERT INTO public.lead_sources (id, tenant_id, name, type, is_active, parameters) VALUES
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440000', 'Website', 'website', true, '{"url": "https://demo.com"}'),
('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440000', 'Facebook Ads', 'facebook', true, '{"campaign_id": "demo123"}'),
('550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440000', 'Google Ads', 'google', true, '{"campaign_id": "google123"}'),
('550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440000', 'Indicação', 'referral', true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Insert contacts
INSERT INTO public.contacts (id, tenant_id, phone, name, email, current_stage_id, lead_source_id, whatsapp_instance_id, first_message, last_interaction_at, notes) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440000', '+5511999999001', 'João Silva', 'joao@email.com', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440020', 'Olá, gostaria de saber mais sobre os produtos', now() - interval '2 days', 'Cliente interessado em soluções completas'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440000', '+5511999999002', 'Maria Santos', 'maria@email.com', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440020', 'Vi o anúncio no Facebook', now() - interval '1 day', 'Muito interessada, pediu orçamento'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440000', '+5511999999003', 'Pedro Costa', 'pedro@email.com', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440020', 'Preciso de uma solução urgente', now() - interval '4 hours', 'Cliente corporativo, grande potencial'),
('550e8400-e29b-41d4-a716-446655440043', '550e8400-e29b-41d4-a716-446655440000', '+5511999999004', 'Ana Oliveira', 'ana@email.com', '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440020', 'Fui indicada por um amigo', now() - interval '1 hour', 'Cliente convertido, muito satisfeita'),
('550e8400-e29b-41d4-a716-446655440044', '550e8400-e29b-41d4-a716-446655440000', '+5511999999005', 'Carlos Mendes', 'carlos@email.com', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440020', 'Olá', now() - interval '30 minutes', 'Primeiro contato')
ON CONFLICT (id) DO NOTHING;

-- Insert contact tags
INSERT INTO public.contact_tags (contact_id, tag_id) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440011'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440011'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440013'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440010'),
('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440012'),
('550e8400-e29b-41d4-a716-446655440043', '550e8400-e29b-41d4-a716-446655440010'),
('550e8400-e29b-41d4-a716-446655440044', '550e8400-e29b-41d4-a716-446655440011')
ON CONFLICT DO NOTHING;

-- Insert messages
INSERT INTO public.messages (id, tenant_id, contact_id, whatsapp_instance_id, direction, message_type, content, status, is_from_bot) VALUES
('550e8400-e29b-41d4-a716-446655440050', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Olá, gostaria de saber mais sobre os produtos', 'received', false),
('550e8400-e29b-41d4-a716-446655440051', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Olá João! Obrigado pelo interesse. Temos várias soluções que podem te ajudar.', 'sent', true),
('550e8400-e29b-41d4-a716-446655440052', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Vi o anúncio no Facebook', 'received', false),
('550e8400-e29b-41d4-a716-446655440053', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Oi Maria! Que bom que você nos encontrou. Posso te ajudar com mais informações?', 'sent', true),
('550e8400-e29b-41d4-a716-446655440054', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440020', 'inbound', 'text', 'Preciso de uma solução urgente', 'received', false),
('550e8400-e29b-41d4-a716-446655440055', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440020', 'outbound', 'text', 'Olá Pedro! Entendo a urgência. Vamos resolver isso rapidamente.', 'sent', true)
ON CONFLICT (id) DO NOTHING;

-- Insert chatbots
INSERT INTO public.chatbots (id, tenant_id, name, description, trigger_type, trigger_phrases, response_message, whatsapp_instance_id, is_active, priority) VALUES
('550e8400-e29b-41d4-a716-446655440060', '550e8400-e29b-41d4-a716-446655440000', 'Saudação Inicial', 'Bot de boas-vindas para novos contatos', 'keyword', ARRAY['olá', 'oi', 'hello', 'hey'], 'Olá {name}! 👋 Seja bem-vindo! Sou o assistente virtual e estou aqui para te ajudar. Como posso te auxiliar hoje?', '550e8400-e29b-41d4-a716-446655440020', true, 10),
('550e8400-e29b-41d4-a716-446655440061', '550e8400-e29b-41d4-a716-446655440000', 'Informações Comerciais', 'Respostas sobre produtos e serviços', 'keyword', ARRAY['preço', 'valor', 'quanto custa', 'produto', 'serviço'], 'Obrigado pelo interesse em nossos produtos! 💼 Temos várias opções que podem atender suas necessidades. Gostaria de falar com um consultor especializado?', '550e8400-e29b-41d4-a716-446655440020', true, 8),
('550e8400-e29b-41d4-a716-446655440062', '550e8400-e29b-41d4-a716-446655440000', 'Horário de Funcionamento', 'Informações sobre horários', 'keyword', ARRAY['horário', 'funcionamento', 'aberto', 'fechado'], 'Nosso horário de atendimento é:\n🕐 Segunda a Sexta: 8h às 18h\n🕐 Sábado: 8h às 12h\n❌ Domingo: Fechado\n\nFora desse horário, deixe sua mensagem que retornaremos assim que possível!', '550e8400-e29b-41d4-a716-446655440020', true, 5)
ON CONFLICT (id) DO NOTHING;

-- Insert campaigns with correct UUID array casting
INSERT INTO public.mass_message_campaigns (id, tenant_id, name, description, message_template, whatsapp_instance_id, status, target_tags, target_stages, delay_between_messages, total_recipients, sent_count) VALUES
('550e8400-e29b-41d4-a716-446655440070', '550e8400-e29b-41d4-a716-446655440000', 'Campanha de Boas Vindas', 'Mensagem de boas-vindas para novos leads', 'Olá {name}! 🎉 Seja bem-vindo à nossa empresa. Estamos muito felizes em ter você conosco!', '550e8400-e29b-41d4-a716-446655440020', 'completed', ARRAY['550e8400-e29b-41d4-a716-446655440011'::uuid], ARRAY['550e8400-e29b-41d4-a716-446655440001'::uuid], 30, 5, 5),
('550e8400-e29b-41d4-a716-446655440071', '550e8400-e29b-41d4-a716-446655440000', 'Follow-up Interesse', 'Acompanhamento para leads interessados', 'Oi {name}! Vi que você demonstrou interesse em nossos produtos. Que tal agendarmos uma conversa rápida para te mostrar como podemos te ajudar? 📞', '550e8400-e29b-41d4-a716-446655440020', 'draft', ARRAY['550e8400-e29b-41d4-a716-446655440013'::uuid], ARRAY['550e8400-e29b-41d4-a716-446655440002'::uuid], 60, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Migration: add_webhook_performance_metrics.sql
-- Size: 2019 bytes
-- Adicionar colunas de métricas de performance às tabelas de webhook

-- Atualizar tabela webhook_logs
ALTER TABLE webhook_logs 
ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS memory_usage JSONB;

-- Atualizar tabela webhook_errors
ALTER TABLE webhook_errors 
ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS memory_usage JSONB,
ADD COLUMN IF NOT EXISTS error_context JSONB,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Adicionar comentários para documentação
COMMENT ON COLUMN webhook_logs.processing_time_ms IS 'Tempo de processamento do evento em milissegundos';
COMMENT ON COLUMN webhook_logs.memory_usage IS 'Informações de uso de memória durante o processamento';
COMMENT ON COLUMN webhook_errors.processing_time_ms IS 'Tempo de processamento antes do erro em milissegundos';
COMMENT ON COLUMN webhook_errors.memory_usage IS 'Informações de uso de memória durante o processamento';
COMMENT ON COLUMN webhook_errors.error_context IS 'Contexto adicional do erro (circuit breaker state, etc.)';
COMMENT ON COLUMN webhook_errors.retry_count IS 'Número de tentativas de retry antes do erro final';

-- Criar índices para melhor performance de consultas
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processing_time ON webhook_logs(processing_time_ms);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type_instance ON webhook_logs(event_type, instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_event_type_instance ON webhook_errors(event_type, instance_name);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_retry_count ON webhook_errors(retry_count);

-- Adicionar política RLS para permitir acesso aos usuários autenticados
GRANT SELECT, INSERT, UPDATE ON webhook_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON webhook_errors TO authenticated;

-- Permitir acesso anônimo apenas para inserção (webhooks externos)
GRANT INSERT ON webhook_logs TO anon;
GRANT INSERT ON webhook_errors TO anon;

