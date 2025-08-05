import { supabase } from '@/integrations/supabase/client';

/**
 * Serviço para integração com Stripe MCP (Model Context Protocol)
 * Baseado na documentação: https://docs.stripe.com/mcp#tools
 * 
 * Este serviço gerencia a integração com o Stripe MCP para:
 * - Gerenciamento de pagamentos de comissões
 * - Criação e gestão de contas de afiliados
 * - Processamento de pagamentos automáticos
 * - Webhooks do Stripe
 * - Configuração das chaves de API
 */

interface StripeCustomer {
  id: string;
  name: string;
  email: string;
  created: number;
  metadata?: Record<string, string>;
}

interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customer?: string;
  metadata?: Record<string, string>;
}

interface StripeAccount {
  id: string;
  type: string;
  country: string;
  email?: string;
  business_profile?: {
    name?: string;
    url?: string;
  };
  capabilities?: Record<string, string>;
}

interface CommissionPayment {
  id: string;
  affiliateId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stripePaymentIntentId?: string;
  metadata?: Record<string, any>;
}

class StripeMcpService {
  private apiKey: string | null = null;
  private publishableKey: string | null = null;
  private webhookSecret: string | null = null;
  private mcpEndpoint = 'https://mcp.stripe.com';
  private tenantId: string | null = null;

  constructor() {
    this.loadStripeConfig();
  }

  /**
   * Verifica se o Stripe está configurado
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.publishableKey);
  }

  /**
   * Salva a configuração do Stripe
   */
  async saveStripeConfig(config: {
    secretKey: string;
    publishableKey: string;
    webhookSecret?: string;
    environment?: 'sandbox' | 'live';
    tenantId: string;
  }): Promise<void> {
    const { data, error } = await supabase
      .from('stripe_config')
      .upsert({
        tenant_id: config.tenantId,
        secret_key: config.secretKey,
        publishable_key: config.publishableKey,
        webhook_secret: config.webhookSecret,
        environment: config.environment || 'sandbox',
        is_active: true
      }, {
        onConflict: 'tenant_id,environment'
      });

    if (error) {
      throw new Error(`Erro ao salvar configuração: ${error.message}`);
    }

    // Atualiza as chaves em memória
    this.apiKey = config.secretKey;
    this.publishableKey = config.publishableKey;
    this.webhookSecret = config.webhookSecret || null;
    this.tenantId = config.tenantId;
  }

  /**
   * Obtém a configuração atual do Stripe
   */
  async getStripeConfig(tenantId: string): Promise<{
    publishableKey: string | null;
    webhookSecret: string | null;
    environment: string;
    isActive: boolean;
  } | null> {
    const { data, error } = await supabase
      .from('stripe_config')
      .select('publishable_key, webhook_secret, environment, is_active')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      return null;
    }

    return {
      publishableKey: data.publishable_key,
      webhookSecret: data.webhook_secret,
      environment: data.environment,
      isActive: data.is_active
    };
  }

  /**
   * Testa a conexão com o Stripe
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.apiKey) {
        return { success: false, message: 'Chave secreta não configurada' };
      }

      // Tenta fazer uma chamada simples para verificar a conexão
      await this.callStripeMcp('retrieve_balance', {});
      return { success: true, message: 'Conexão com Stripe estabelecida com sucesso' };
    } catch (error) {
      return { 
        success: false, 
        message: `Erro na conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
      };
    }
  }

  /**
   * Carrega a configuração do Stripe do banco de dados
   */
  private async loadStripeConfig(tenantId?: string): Promise<void> {
    try {
      let query = supabase
        .from('stripe_config')
        .select('secret_key, publishable_key, webhook_secret, tenant_id, environment, is_active')
        .eq('is_active', true);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.single();

      if (error) {
        console.warn('Configuração do Stripe não encontrada:', error.message);
        return;
      }

      this.apiKey = data.secret_key;
      this.publishableKey = data.publishable_key;
      this.webhookSecret = data.webhook_secret;
      this.tenantId = data.tenant_id;
    } catch (error) {
      console.error('Erro ao carregar configuração do Stripe:', error);
    }
  }

  /**
   * Recarrega a configuração para um tenant específico
   */
  async reloadConfig(tenantId: string): Promise<void> {
    await this.loadStripeConfig(tenantId);
  }

  /**
   * Faz uma chamada para o Stripe MCP
   */
  private async callStripeMcp(method: string, params: any): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Chave da API do Stripe não configurada');
    }

    const response = await fetch(this.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: method,
          arguments: params
        },
        id: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Erro na chamada MCP: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Erro do Stripe MCP: ${result.error.message}`);
    }

    return result.result;
  }

  /**
   * Cria um cliente Stripe para um afiliado
   */
  async createAffiliateCustomer(affiliateData: {
    name: string;
    email: string;
    affiliateId: string;
  }): Promise<StripeCustomer> {
    const customer = await this.callStripeMcp('create_customer', {
      name: affiliateData.name,
      email: affiliateData.email,
      metadata: {
        affiliate_id: affiliateData.affiliateId,
        type: 'affiliate'
      }
    });

    // Salva a associação no banco de dados
    await supabase
      .from('affiliate_stripe_accounts')
      .upsert({
        affiliate_id: affiliateData.affiliateId,
        stripe_customer_id: customer.id,
        email: affiliateData.email,
        status: 'active'
      });

    return customer;
  }

  /**
   * Lista todos os clientes Stripe
   */
  async listCustomers(): Promise<StripeCustomer[]> {
    return await this.callStripeMcp('list_customers', {});
  }

  /**
   * Cria um pagamento de comissão
   */
  async createCommissionPayment(paymentData: {
    affiliateId: string;
    amount: number;
    currency: string;
    description?: string;
  }): Promise<StripePaymentIntent> {
    // Busca a conta Stripe do afiliado
    const { data: affiliateAccount } = await supabase
      .from('affiliate_stripe_accounts')
      .select('stripe_customer_id')
      .eq('affiliate_id', paymentData.affiliateId)
      .single();

    if (!affiliateAccount) {
      throw new Error('Conta Stripe do afiliado não encontrada');
    }

    const paymentIntent = await this.callStripeMcp('create_payment_intent', {
      amount: Math.round(paymentData.amount * 100), // Converter para centavos
      currency: paymentData.currency,
      customer: affiliateAccount.stripe_customer_id,
      description: paymentData.description || 'Pagamento de comissão',
      metadata: {
        affiliate_id: paymentData.affiliateId,
        type: 'commission_payment'
      }
    });

    // Registra o pagamento no banco de dados
    await supabase
      .from('commission_payments')
      .insert({
        affiliate_id: paymentData.affiliateId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        stripe_payment_intent_id: paymentIntent.id,
        status: 'pending',
        metadata: {
          description: paymentData.description
        }
      });

    return paymentIntent;
  }

  /**
   * Lista pagamentos de intenção
   */
  async listPaymentIntents(): Promise<StripePaymentIntent[]> {
    return await this.callStripeMcp('list_payment_intents', {});
  }

  /**
   * Processa pagamentos de comissão em lote
   */
  async processBatchCommissionPayments(payments: Array<{
    affiliateId: string;
    amount: number;
    currency: string;
    description?: string;
  }>): Promise<StripePaymentIntent[]> {
    const results: StripePaymentIntent[] = [];
    
    for (const payment of payments) {
      try {
        const paymentIntent = await this.createCommissionPayment(payment);
        results.push(paymentIntent);
        
        // Log do sucesso
        await this.logWebhookEvent({
          type: 'commission_payment.created',
          data: {
            affiliate_id: payment.affiliateId,
            payment_intent_id: paymentIntent.id,
            amount: payment.amount
          }
        });
      } catch (error) {
        console.error(`Erro ao processar pagamento para afiliado ${payment.affiliateId}:`, error);
        
        // Log do erro
        await this.logWebhookEvent({
          type: 'commission_payment.failed',
          data: {
            affiliate_id: payment.affiliateId,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
          }
        });
      }
    }
    
    return results;
  }

  /**
   * Busca informações da conta Stripe
   */
  async getAccountInfo(): Promise<any> {
    return await this.callStripeMcp('get_stripe_account_info', {});
  }

  /**
   * Registra uma transação do Stripe no banco de dados
   */
  async recordStripeTransaction(transactionData: {
    tenantId: string;
    stripePaymentIntentId: string;
    stripeChargeId?: string;
    stripeCustomerId?: string;
    affiliateId?: string;
    amount: number;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
    paymentMethod?: string;
    description?: string;
    metadata?: Record<string, any>;
    stripeFee?: number;
    netAmount?: number;
    commissionAmount?: number;
  }): Promise<void> {
    const { error } = await supabase
      .from('stripe_transactions')
      .insert({
        tenant_id: transactionData.tenantId,
        stripe_payment_intent_id: transactionData.stripePaymentIntentId,
        stripe_charge_id: transactionData.stripeChargeId,
        stripe_customer_id: transactionData.stripeCustomerId,
        affiliate_id: transactionData.affiliateId,
        amount: transactionData.amount,
        currency: transactionData.currency,
        status: transactionData.status,
        payment_method: transactionData.paymentMethod,
        description: transactionData.description,
        metadata: transactionData.metadata || {},
        stripe_fee: transactionData.stripeFee,
        net_amount: transactionData.netAmount,
        commission_amount: transactionData.commissionAmount,
        processed_at: new Date().toISOString()
      });

    if (error) {
      throw new Error(`Erro ao registrar transação: ${error.message}`);
    }
  }

  /**
   * Atualiza o status de uma transação
   */
  async updateTransactionStatus(
    paymentIntentId: string, 
    status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded',
    metadata?: Record<string, any>
  ): Promise<void> {
    const updateData: any = {
      status,
      processed_at: new Date().toISOString()
    };

    if (metadata) {
      updateData.metadata = metadata;
    }

    const { error } = await supabase
      .from('stripe_transactions')
      .update(updateData)
      .eq('stripe_payment_intent_id', paymentIntentId);

    if (error) {
      throw new Error(`Erro ao atualizar status da transação: ${error.message}`);
    }
  }

  /**
   * Obtém estatísticas de transações
   */
  async getTransactionStats(tenantId: string, startDate?: string, endDate?: string): Promise<any> {
    const { data, error } = await supabase
      .rpc('get_stripe_transaction_stats', {
        p_tenant_id: tenantId,
        p_start_date: startDate || null,
        p_end_date: endDate || null
      });

    if (error) {
      throw new Error(`Erro ao obter estatísticas: ${error.message}`);
    }

    return data[0] || {};
  }

  /**
   * Busca o saldo da conta
   */
  async getBalance(): Promise<any> {
    return await this.callStripeMcp('retrieve_balance', {});
  }

  /**
   * Cria um cupom de desconto
   */
  async createCoupon(couponData: {
    id?: string;
    percent_off?: number;
    amount_off?: number;
    currency?: string;
    duration: 'forever' | 'once' | 'repeating';
    duration_in_months?: number;
  }): Promise<any> {
    return await this.callStripeMcp('create_coupon', couponData);
  }

  /**
   * Lista cupons
   */
  async listCoupons(): Promise<any[]> {
    return await this.callStripeMcp('list_coupons', {});
  }

  /**
   * Busca documentação do Stripe
   */
  async searchDocumentation(query: string): Promise<any> {
    return await this.callStripeMcp('search_documentation', { query });
  }

  /**
   * Registra eventos de webhook
   */
  private async logWebhookEvent(event: {
    type: string;
    data: any;
  }): Promise<void> {
    try {
      await supabase
        .from('stripe_webhook_logs')
        .insert({
          event_type: event.type,
          event_data: event.data,
          processed_at: new Date().toISOString(),
          status: 'processed'
        });
    } catch (error) {
      console.error('Erro ao registrar evento de webhook:', error);
    }
  }

  /**
   * Atualiza o status de um pagamento de comissão
   */
  async updateCommissionPaymentStatus(
    paymentIntentId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    await supabase
      .from('commission_payments')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_payment_intent_id', paymentIntentId);
  }

  /**
   * Calcula comissões pendentes para um afiliado
   */
  async calculatePendingCommissions(affiliateId: string): Promise<{
    totalAmount: number;
    currency: string;
    commissionCount: number;
  }> {
    const { data, error } = await supabase
      .rpc('calculate_affiliate_commissions', {
        p_affiliate_id: affiliateId
      });

    if (error) {
      throw new Error(`Erro ao calcular comissões: ${error.message}`);
    }

    return {
      totalAmount: data?.total_amount || 0,
      currency: 'BRL',
      commissionCount: data?.commission_count || 0
    };
  }

  /**
   * Verifica se a integração com Stripe está configurada
   */
  async isConfigured(): Promise<boolean> {
    await this.loadStripeConfig();
    return this.apiKey !== null;
  }
}

// Instância singleton do serviço
export const stripeMcpService = new StripeMcpService();
export default stripeMcpService;