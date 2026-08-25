-- #############################################################################
-- ##  ARQUIVADA — SUPERSEDIDA. NÃO RODE.                                   ##
-- #############################################################################
--
-- Auditoria do ledger em 2026-08-24. O efeito deste arquivo já foi substituído
-- por uma migração posterior. Rodar hoje DESFAZ o estado atual:
--
--   Acrescenta uma 4a policy permissiva em stripe_config. A versao viva da tabela veio do ledger 20250805032512 (add_tenant_id_to_stripe_config_fixed) e ja tem tenant_id.
--
-- Carimbada como aplicada no ledger (docs/reconciliar_ledger_migracoes.sql,
-- LOTE 3) para que nenhuma ferramenta tente rodá-la. Mantida só como história.
-- #############################################################################

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