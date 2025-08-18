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