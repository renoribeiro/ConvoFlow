import { supabase } from '@/integrations/supabase/client';

// Stripe configuration interface
interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  webhookSecret?: string;
  connectClientId?: string;
  isActive: boolean;
}

// Commission payment interface
interface CommissionPayment {
  id: string;
  affiliate_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  stripe_transfer_id?: string;
  stripe_payout_id?: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  paid_at?: string;
}

// Affiliate Stripe account interface
interface AffiliateStripeAccount {
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

class StripeService {
  private stripeConfig: StripeConfig | null = null;

  // Initialize Stripe configuration
  async initializeStripe(): Promise<StripeConfig | null> {
    try {
      const { data, error } = await supabase
        .from('stripe_config')
        .select('*')
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching Stripe config:', error);
        return null;
      }

      this.stripeConfig = data;
      return data;
    } catch (error) {
      console.error('Error initializing Stripe:', error);
      return null;
    }
  }

  // Save Stripe configuration
  async saveStripeConfig(config: Omit<StripeConfig, 'isActive'>): Promise<boolean> {
    try {
      // Deactivate existing configs
      await supabase
        .from('stripe_config')
        .update({ is_active: false })
        .eq('is_active', true);

      // Insert new config
      const { error } = await supabase
        .from('stripe_config')
        .insert({
          ...config,
          is_active: true
        });

      if (error) {
        console.error('Error saving Stripe config:', error);
        return false;
      }

      this.stripeConfig = { ...config, isActive: true };
      return true;
    } catch (error) {
      console.error('Error saving Stripe config:', error);
      return false;
    }
  }

  // Get commission payments
  async getCommissionPayments(affiliateId?: string): Promise<CommissionPayment[]> {
    try {
      let query = supabase
        .from('commission_payments')
        .select(`
          *,
          affiliates:affiliate_id (
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (affiliateId) {
        query = query.eq('affiliate_id', affiliateId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching commission payments:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching commission payments:', error);
      return [];
    }
  }

  // Create commission payment
  async createCommissionPayment(
    affiliateId: string,
    amount: number,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<CommissionPayment | null> {
    try {
      const { data, error } = await supabase
        .from('commission_payments')
        .insert({
          affiliate_id: affiliateId,
          amount,
          description,
          metadata,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating commission payment:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating commission payment:', error);
      return null;
    }
  }

  // Update commission payment status
  async updateCommissionPaymentStatus(
    paymentId: string,
    status: CommissionPayment['status'],
    stripeTransferId?: string,
    stripePayoutId?: string
  ): Promise<boolean> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (stripeTransferId) {
        updateData.stripe_transfer_id = stripeTransferId;
      }

      if (stripePayoutId) {
        updateData.stripe_payout_id = stripePayoutId;
      }

      if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('commission_payments')
        .update(updateData)
        .eq('id', paymentId);

      if (error) {
        console.error('Error updating commission payment:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating commission payment:', error);
      return false;
    }
  }

  // Calculate commission for affiliate
  async calculateCommission(
    affiliateId: string,
    baseAmount: number,
    calculationType: 'first_month' | 'recurring',
    billingPeriodStart?: string,
    billingPeriodEnd?: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('calculate_affiliate_commission', {
        p_affiliate_id: affiliateId,
        p_base_amount: baseAmount,
        p_calculation_type: calculationType,
        p_billing_period_start: billingPeriodStart,
        p_billing_period_end: billingPeriodEnd
      });

      if (error) {
        console.error('Error calculating commission:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error calculating commission:', error);
      return null;
    }
  }

  // Get affiliate Stripe accounts
  async getAffiliateStripeAccounts(affiliateId?: string): Promise<AffiliateStripeAccount[]> {
    try {
      let query = supabase
        .from('affiliate_stripe_accounts')
        .select(`
          *,
          affiliates:affiliate_id (
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (affiliateId) {
        query = query.eq('affiliate_id', affiliateId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching affiliate Stripe accounts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching affiliate Stripe accounts:', error);
      return [];
    }
  }

  // Create affiliate Stripe account
  async createAffiliateStripeAccount(
    affiliateId: string,
    stripeAccountId: string
  ): Promise<AffiliateStripeAccount | null> {
    try {
      const { data, error } = await supabase
        .from('affiliate_stripe_accounts')
        .insert({
          affiliate_id: affiliateId,
          stripe_account_id: stripeAccountId,
          account_status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating affiliate Stripe account:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating affiliate Stripe account:', error);
      return null;
    }
  }

  // Update affiliate Stripe account
  async updateAffiliateStripeAccount(
    accountId: string,
    updates: Partial<Pick<AffiliateStripeAccount, 'account_status' | 'charges_enabled' | 'payouts_enabled' | 'details_submitted' | 'requirements'>>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('affiliate_stripe_accounts')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        console.error('Error updating affiliate Stripe account:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating affiliate Stripe account:', error);
      return false;
    }
  }

  // Log Stripe webhook
  async logStripeWebhook(
    stripeEventId: string,
    eventType: string,
    payload: Record<string, any>,
    processed: boolean = false,
    errorMessage?: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('stripe_webhook_logs')
        .insert({
          stripe_event_id: stripeEventId,
          event_type: eventType,
          payload,
          processed,
          error_message: errorMessage,
          processed_at: processed ? new Date().toISOString() : null
        });

      if (error) {
        console.error('Error logging Stripe webhook:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error logging Stripe webhook:', error);
      return false;
    }
  }

  // Mark webhook as processed
  async markWebhookAsProcessed(stripeEventId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('stripe_webhook_logs')
        .update({
          processed: true,
          processed_at: new Date().toISOString()
        })
        .eq('stripe_event_id', stripeEventId);

      if (error) {
        console.error('Error marking webhook as processed:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking webhook as processed:', error);
      return false;
    }
  }

  // Get payment statistics
  async getPaymentStatistics(affiliateId?: string): Promise<{
    totalPaid: number;
    totalPending: number;
    totalFailed: number;
    totalPayments: number;
    averagePayment: number;
  }> {
    try {
      let query = supabase
        .from('commission_payments')
        .select('amount, status');

      if (affiliateId) {
        query = query.eq('affiliate_id', affiliateId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching payment statistics:', error);
        return {
          totalPaid: 0,
          totalPending: 0,
          totalFailed: 0,
          totalPayments: 0,
          averagePayment: 0
        };
      }

      const payments = data || [];
      const totalPayments = payments.length;
      const totalPaid = payments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0);
      const totalPending = payments
        .filter(p => p.status === 'pending' || p.status === 'processing')
        .reduce((sum, p) => sum + p.amount, 0);
      const totalFailed = payments
        .filter(p => p.status === 'failed' || p.status === 'cancelled')
        .reduce((sum, p) => sum + p.amount, 0);
      const averagePayment = totalPayments > 0 ? 
        payments.reduce((sum, p) => sum + p.amount, 0) / totalPayments : 0;

      return {
        totalPaid,
        totalPending,
        totalFailed,
        totalPayments,
        averagePayment
      };
    } catch (error) {
      console.error('Error calculating payment statistics:', error);
      return {
        totalPaid: 0,
        totalPending: 0,
        totalFailed: 0,
        totalPayments: 0,
        averagePayment: 0
      };
    }
  }

  // Simulate Stripe payment processing (for demo purposes)
  async simulateStripePayment(paymentId: string): Promise<boolean> {
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate 90% success rate
      const success = Math.random() > 0.1;
      const status = success ? 'paid' : 'failed';
      const stripeTransferId = success ? `tr_${Math.random().toString(36).substr(2, 9)}` : undefined;

      return await this.updateCommissionPaymentStatus(
        paymentId,
        status,
        stripeTransferId
      );
    } catch (error) {
      console.error('Error simulating Stripe payment:', error);
      return false;
    }
  }

  // Process bulk payments
  async processBulkPayments(paymentIds: string[]): Promise<{
    successful: string[];
    failed: string[];
  }> {
    const successful: string[] = [];
    const failed: string[] = [];

    for (const paymentId of paymentIds) {
      try {
        // Update status to processing
        await this.updateCommissionPaymentStatus(paymentId, 'processing');

        // Simulate payment processing
        const success = await this.simulateStripePayment(paymentId);

        if (success) {
          successful.push(paymentId);
        } else {
          failed.push(paymentId);
        }
      } catch (error) {
        console.error(`Error processing payment ${paymentId}:`, error);
        failed.push(paymentId);
      }
    }

    return { successful, failed };
  }
}

// Export singleton instance
export const stripeService = new StripeService();
export default stripeService;

// Export types
export type {
  StripeConfig,
  CommissionPayment,
  AffiliateStripeAccount
};