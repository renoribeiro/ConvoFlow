import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const SLOT_PRICE = Deno.env.get('STRIPE_PRICE_STORE_SLOT') ?? '';

/**
 * Quantas Lojas extras a assinatura declara AGORA.
 *
 * Substitui o antigo `store_slots_extra: metadata.extra_slots`, que era
 * ATRIBUICAO a partir do metadata da sessao: um segundo checkout de "+1"
 * gravava 1 por cima de um 3 e a Conta PERDIA capacidade em silencio (o
 * trigger enforce_store_slot_capacity so olha INSERT/UPDATE de tenants, entao
 * nao desfazia nada).
 *
 * Derivando da assinatura o resultado independe de qual evento chegou, em que
 * ordem e quantas vezes -- o handler vira idempotente. Isso tambem cobre a
 * corrida real de 2026-07-27, quando invoice.payment_succeeded chegou ANTES de
 * checkout.session.completed.
 */
async function extrasDaAssinatura(subscriptionId: string): Promise<number | null> {
  if (!SLOT_PRICE) return null;   // sem Price de vaga configurado, nao mexe
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return slotQuantityFromSubscription(sub as never, SLOT_PRICE);
  } catch (e) {
    console.error('Falha ao reler assinatura para derivar vagas:', e?.message ?? e);
    return null;
  }
}

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

  // Idempotencia. O Stripe reenvia o mesmo evento quando a resposta demora ou
  // falha, e o handler nao tinha guarda nenhuma -- gravava de novo e ainda
  // registrava o log duplicado como `processed: true`. Como cada handler agora
  // DERIVA da assinatura, reprocessar seria inofensivo; a guarda evita o
  // trabalho e mantem o log honesto.
  const { data: jaProcessado } = await supabase
    .from('stripe_webhook_logs')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (jaProcessado) {
    console.log(`Evento ${event.id} ja processado; ignorando reenvio.`)
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // tenant_id agora vem do metadata (o client_reference_id foi liberado para
        // o referral do Rewardful). Fallback ao client_reference_id p/ sessões antigas.
        const tenantId = session.metadata?.tenant_id ?? session.client_reference_id;
        const subscriptionId = session.subscription;

        // As vagas vem da ASSINATURA, nao do metadata. Ver extrasDaAssinatura().
        const extraSlots = subscriptionId ? await extrasDaAssinatura(subscriptionId) : null;

        if (tenantId) {
          console.log(`Updating tenant ${tenantId} subscription to active (extra slots: ${extraSlots ?? 'inalterado'}).`)
          const patch: Record<string, unknown> = {
            subscription_id: subscriptionId,
            subscription_status: 'active',
            plan_type: 'gerente',
            updated_at: new Date().toISOString()
          };
          // null = nao foi possivel derivar (Price nao configurado ou Stripe
          // fora do ar). Preferimos NAO tocar na coluna a grava-la errada:
          // gravar 0 aqui zeraria as vagas de uma Conta que ja pagou por elas.
          if (extraSlots !== null) patch.store_slots_extra = extraSlots;

          const { error } = await supabase
            .from('tenants')
            .update(patch)
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
      case 'customer.subscription.updated': {
        // O evento que NINGUEM tratava -- e o unico que avisa mudanca de
        // quantidade. Sem ele, alterar as vagas no Stripe (pelo
        // update-store-slots, pelo portal ou pelo painel) nunca chegava ao
        // nosso banco.
        const subscription = event.data.object;
        const extras = await extrasDaAssinatura(subscription.id);
        const status = subscription.status === 'active' ? 'active' : subscription.status;

        const patch: Record<string, unknown> = {
          subscription_status: status,
          updated_at: new Date().toISOString(),
        };
        if (extras !== null) patch.store_slots_extra = extras;

        console.log(`Subscription updated ${subscription.id} (status: ${status}, extra slots: ${extras ?? 'inalterado'})`)
        await supabase.from('tenants')
          .update(patch)
          .eq('subscription_id', subscription.id)
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
