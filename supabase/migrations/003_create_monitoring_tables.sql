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