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