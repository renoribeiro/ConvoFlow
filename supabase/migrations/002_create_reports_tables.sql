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