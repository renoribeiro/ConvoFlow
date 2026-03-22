import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getStripeClient(supabaseClient: any) {
  const { data: config, error } = await supabaseClient
    .from('stripe_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error || !config || !config.secret_key) {
    throw new Error('Stripe configuration not found or inactive');
  }

  const stripe = new Stripe(config.secret_key, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });

  return { stripe, config };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Used to bypass RLS for stripe_config
    );

    // Verify user is authenticated and is super_admin
    const authHeader = req.headers.get('Authorization')!;
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    ).auth.getUser(token);

    if (userError || !user) throw new Error('Unauthorized');

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      throw new Error('Forbidden: Only super_admin can perform Stripe admin actions');
    }

    const { action, payload } = await req.json();

    switch (action) {
      case 'get_config': {
        const { data: config } = await supabaseClient
          .from('stripe_config')
          .select('publishable_key, environment')
          .limit(1)
          .maybeSingle();

        return new Response(
          JSON.stringify({
            configured: !!config,
            publishableKey: config?.publishable_key || null,
            environment: config?.environment || 'test',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'save_config': {
        const { secretKey, publishableKey, webhookSecret, environment } = payload;
        
        // Remove existing configs
        await supabaseClient.from('stripe_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        const { error } = await supabaseClient
          .from('stripe_config')
          .insert({
            secret_key: secretKey,
            publishable_key: publishableKey,
            webhook_secret: webhookSecret,
            environment: environment || 'test'
          });

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'test_connection': {
        const { stripe } = await getStripeClient(supabaseClient);
        const account = await stripe.accounts.retrieve();
        return new Response(
          JSON.stringify({ success: true, accountInfo: account }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_account_info': {
        const { stripe } = await getStripeClient(supabaseClient);
        const account = await stripe.accounts.retrieve();
        return new Response(
          JSON.stringify(account),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_balance': {
        const { stripe } = await getStripeClient(supabaseClient);
        const balance = await stripe.balance.retrieve();
        return new Response(
          JSON.stringify(balance),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_transaction_stats': {
        const { stripe } = await getStripeClient(supabaseClient);
        // Stripe doesn't have an endpoint purely for aggregate stats, we must fetch charges/balance_transactions
        // For brevity and simplicity per current frontend logic
        const charges = await stripe.charges.list({ limit: 100 });
        
        const stats = {
          total_transactions: charges.data.length,
          total_amount: charges.data.reduce((sum, charge) => sum + charge.amount, 0),
          successful_transactions: charges.data.filter(c => c.status === 'succeeded').length,
          failed_transactions: charges.data.filter(c => c.status === 'failed').length,
          pending_transactions: charges.data.filter(c => c.status === 'pending').length,
          net_amount: charges.data.reduce((sum, charge) => sum + charge.amount, 0), // Simplifying net
          total_fees: 0,
          commission_amount: 0,
          average_transaction_value: charges.data.length ? charges.data.reduce((sum, charge) => sum + charge.amount, 0) / charges.data.length : 0,
        };

        return new Response(
          JSON.stringify(stats),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'process_batch_commissions': {
        const { stripe } = await getStripeClient(supabaseClient);
        const { payments } = payload;
        
        const results = [];
        for (const payment of payments) {
          try {
            // Assume we are doing a transfer for affiliate payment
            const transfer = await stripe.transfers.create({
              amount: payment.amount,
              currency: payment.currency,
              destination: payment.affiliateId,
              description: payment.description || 'Commission Payment',
            });
            
            await supabaseClient
               .from('commission_payments')
               .update({ status: 'completed', stripe_transfer_id: transfer.id, updated_at: new Date().toISOString() })
               .eq('id', payment.id);

            results.push({ id: payment.id, status: 'success', transferId: transfer.id });
          } catch (e: any) {
             await supabaseClient
               .from('commission_payments')
               .update({ status: 'failed', metadata: { error: e.message }, updated_at: new Date().toISOString() })
               .eq('id', payment.id);
            results.push({ id: payment.id, status: 'error', error: e.message });
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
