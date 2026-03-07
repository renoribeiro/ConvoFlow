import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const signature = req.headers.get('Stripe-Signature')

  if (!signature) {
    return new Response('Webhook Error: Missing Stripe-Signature', { status: 400 })
  }

  const body = await req.text()
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!webhookSecret) {
      console.error("Missing STRIPE_WEBHOOK_SECRET configuration");
      return new Response("Configuration Error", { status: 500 });
  }

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log(`Processing event: ${event.type} [${event.id}]`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.client_reference_id;
        const subscriptionId = session.subscription;

        if (tenantId) {
          console.log(`Updating tenant ${tenantId} subscription to active.`)
          const { error } = await supabase
            .from('tenants')
            .update({
              subscription_id: subscriptionId,
              subscription_status: 'active',
              plan_type: 'pro',
              updated_at: new Date().toISOString()
            })
            .eq('id', tenantId);
            
          if (error) {
              console.error("Error updating tenant:", error);
              throw error;
          }
        } else {
            console.warn("Missing client_reference_id in session", session.id)
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
             console.log(`Renewing subscription ${subscriptionId}`)
             await supabase.from('tenants')
                .update({ subscription_status: 'active' })
                .eq('subscription_id', subscriptionId)
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        console.log(`Subscription deleted/canceled: ${subscriptionId}`)
        await supabase.from('tenants')
            .update({ subscription_status: 'canceled' })
            .eq('subscription_id', subscriptionId)
        break;
      }
    }

    // Log event to DB
    const { error: logError } = await supabase.from('stripe_webhook_logs').insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event.data.object,
        processed: true
    });
    
    if (logError) console.error("Error logging webhook:", logError);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`)
    return new Response(`Error processing webhook: ${err.message}`, { status: 500 })
  }
})
