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