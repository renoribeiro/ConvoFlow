import { supabase } from '@/integrations/supabase/client';

// Stripe configuration interface
export interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  webhookSecret?: string;
  environment?: 'test' | 'live';
  isActive?: boolean;
}

// Commission payment interface
export interface CommissionPayment {
  id: string;
  affiliate_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'paid' | 'completed' | 'failed' | 'cancelled';
  stripe_transfer_id?: string;
  stripe_payout_id?: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  paid_at?: string;
  affiliateId?: string; // Compatibility with stripeMcpService
}

// Affiliate Stripe account interface
export interface AffiliateStripeAccount {
  id: string;
  affiliate_id: string;
  stripe_account_id: string;
  account_status: 'pending' | 'restricted' | 'enabled' | 'disabled';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TransactionStats {
  total_transactions: number;
  total_amount: number;
  total_fees: number;
  net_amount: number;
  commission_amount: number;
  successful_transactions: number;
  failed_transactions: number;
  pending_transactions: number;
  average_transaction_value: number;
}

class StripeService {
  /**
   * Admin: Get Stripe configuration securely via Edge Function
   */
  async getStripeConfig(): Promise<{ publishableKey: string | null; environment: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'get_config' }
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching Stripe config:', error);
      return { publishableKey: null, environment: 'test' };
    }
  }

  async isConfigured(): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'get_config' }
      });
      if (error) throw error;
      return !!data.configured;
    } catch (error) {
      return false;
    }
  }

  /**
   * Admin: Save Stripe configuration securely via Edge Function
   */
  async saveStripeConfig(config: Partial<StripeConfig>): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { 
          action: 'save_config',
          payload: config
        }
      });
      if (error) throw error;
      return data.success;
    } catch (error) {
      console.error('Error saving Stripe config:', error);
      throw error;
    }
  }

  /**
   * Admin: Test Connection
   */
  async testConnection(): Promise<{ success: boolean; accountInfo?: any; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'test_connection' }
      });
      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error testing connection:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Admin: Get Account Info
   */
  async getAccountInfo(): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'get_account_info' }
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting account info:', error);
      throw error;
    }
  }

  /**
   * Admin: Get Balance
   */
  async getBalance(): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'get_balance' }
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Admin: Get Transaction Stats
   */
  async getTransactionStats(tenantId?: string, startDate?: string, endDate?: string): Promise<TransactionStats> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'get_transaction_stats', payload: { tenantId, startDate, endDate } }
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching transaction stats:', error);
      throw error;
    }
  }

  /**
   * Process Batch Commission Payments
   */
  async processBatchCommissionPayments(payments: CommissionPayment[]): Promise<{ id: string; status: string; error?: string }[]> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'process_batch_commissions', payload: { payments } }
      });
      if (error) throw error;
      return data.results;
    } catch (error) {
      console.error('Error processing batch commissions:', error);
      throw error;
    }
  }

  // Database operations
  async getCommissionPayments(affiliateId?: string): Promise<CommissionPayment[]> {
    try {
      let query = supabase
        .from('commission_payments')
        .select(`*, affiliates:affiliate_id(name, email)`)
        .order('created_at', { ascending: false });

      if (affiliateId) query = query.eq('affiliate_id', affiliateId);

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) as CommissionPayment[] || [];
    } catch (error) {
      console.error('Error fetching commission payments:', error);
      return [];
    }
  }

  async createCommissionPayment(affiliateId: string, amount: number, description?: string, metadata?: Record<string, any>): Promise<CommissionPayment | null> {
    try {
      const { data, error } = await supabase
        .from('commission_payments')
        .insert({ affiliate_id: affiliateId, amount, description, metadata, status: 'pending' })
        .select().single();
      if (error) throw error;
      return (data as any) as CommissionPayment;
    } catch (error) {
      console.error('Error creating commission payment:', error);
      return null;
    }
  }

  async updateCommissionPaymentStatus(paymentId: string, status: CommissionPayment['status'], stripeTransferId?: string, stripePayoutId?: string): Promise<boolean> {
    try {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (stripeTransferId) updateData.stripe_transfer_id = stripeTransferId;
      if (stripePayoutId) updateData.stripe_payout_id = stripePayoutId;
      if (status === 'paid' || status === 'completed') updateData.paid_at = new Date().toISOString();

      const { error } = await supabase.from('commission_payments').update(updateData).eq('id', paymentId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating commission payment:', error);
      return false;
    }
  }

  async getAffiliateStripeAccounts(affiliateId?: string): Promise<AffiliateStripeAccount[]> {
    try {
      let query = supabase
        .from('affiliate_stripe_accounts')
        .select(`*, affiliates:affiliate_id(name, email)`)
        .order('created_at', { ascending: false });
      if (affiliateId) query = query.eq('affiliate_id', affiliateId);

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) as AffiliateStripeAccount[] || [];
    } catch (error) {
      console.error('Error fetching affiliate Stripe accounts:', error);
      return [];
    }
  }

  async createAffiliateStripeAccount(affiliateId: string, stripeAccountId: string): Promise<AffiliateStripeAccount | null> {
    try {
      const { data, error } = await supabase
        .from('affiliate_stripe_accounts')
        .insert({ affiliate_id: affiliateId, stripe_account_id: stripeAccountId, account_status: 'pending' })
        .select().single();
      if (error) throw error;
      return (data as any) as AffiliateStripeAccount;
    } catch (error) {
      console.error('Error creating affiliate Stripe account:', error);
      return null;
    }
  }

  async updateAffiliateStripeAccount(accountId: string, updates: Partial<Pick<AffiliateStripeAccount, 'account_status' | 'charges_enabled' | 'payouts_enabled' | 'details_submitted' | 'requirements'>>): Promise<boolean> {
    try {
      const { error } = await supabase.from('affiliate_stripe_accounts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', accountId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating affiliate Stripe account:', error);
      return false;
    }
  }
}

// Export singleton instance
export const stripeService = new StripeService();
export default stripeService;