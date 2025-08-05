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