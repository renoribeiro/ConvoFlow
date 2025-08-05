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