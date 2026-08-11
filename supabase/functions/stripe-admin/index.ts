import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// Cupons de desconto (superadmin)
// -----------------------------------------------------------------------------
// Modelo: cada cupom nosso vira DOIS objetos no Stripe —
//   1. Coupon         → carrega o desconto (percent_off / amount_off + duration)
//   2. Promotion Code → é o texto que o cliente digita no Checkout. O
//                       create-checkout-session já manda allow_promotion_codes,
//                       então o cupom funciona ponta-a-ponta sem tocar nele.
//
// Convenção de valores: discount_value é gravado em REAIS no nosso banco e só
// é convertido para centavos (× 100) na chamada ao Stripe.
// =============================================================================

const COUPON_CURRENCY = 'brl';
const COUPON_DURATIONS = ['once', 'repeating', 'forever'];

/** Código de erro do Postgres para "coluna não existe" (migração pendente). */
const PG_UNDEFINED_COLUMN = '42703';

/**
 * Valida e normaliza o payload de create_coupon. Lança Error com mensagem em
 * pt-BR — o catch do handler devolve { error } com status 400.
 */
function parseCouponPayload(payload: any) {
  // Stripe só aceita letras e dígitos no code do Promotion Code.
  const code = String(payload?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) throw new Error('Informe o código do cupom (apenas letras e números).');
  if (code.length > 40) throw new Error('O código do cupom deve ter no máximo 40 caracteres.');

  const discountType = payload?.discount_type;
  if (discountType !== 'percent' && discountType !== 'amount') {
    throw new Error("Tipo de desconto inválido. Use 'percent' ou 'amount'.");
  }

  const discountValue = Number(payload?.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error('O valor do desconto deve ser maior que zero.');
  }
  if (discountType === 'percent' && discountValue > 100) {
    throw new Error('O desconto percentual não pode passar de 100%.');
  }

  const duration = payload?.duration ?? 'once';
  if (!COUPON_DURATIONS.includes(duration)) {
    throw new Error("Duração inválida. Use 'once', 'repeating' ou 'forever'.");
  }

  let durationInMonths: number | null = null;
  if (duration === 'repeating') {
    durationInMonths = Math.floor(Number(payload?.duration_in_months));
    if (!Number.isFinite(durationInMonths) || durationInMonths < 1) {
      throw new Error('Informe a quantidade de meses (mínimo 1) para cupons recorrentes.');
    }
  }

  let maxUses: number | null = null;
  const rawMaxUses = payload?.max_uses;
  if (rawMaxUses !== null && rawMaxUses !== undefined && rawMaxUses !== '') {
    maxUses = Math.floor(Number(rawMaxUses));
    if (!Number.isFinite(maxUses) || maxUses < 1) {
      throw new Error('O limite de usos deve ser um número inteiro maior que zero.');
    }
  }

  let validUntil: Date | null = null;
  if (payload?.valid_until) {
    validUntil = new Date(payload.valid_until);
    if (Number.isNaN(validUntil.getTime())) throw new Error('Data de validade inválida.');
    // O Stripe rejeita expires_at no passado.
    if (validUntil.getTime() <= Date.now()) {
      throw new Error('A data de validade precisa ser no futuro.');
    }
  }

  return { code, discountType, discountValue, duration, durationInMonths, maxUses, validUntil };
}

async function getStripeClient(supabaseClient: any) {
  const { data: config } = await supabaseClient
    .from('stripe_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  // Prioridade é a chave salva em stripe_config (fluxo da aba Configurações).
  // Se a tabela estiver vazia — que é o caso em produção hoje —, cai na mesma
  // secret usada por create-checkout-session e stripe-webhook. Isso garante que
  // o admin fale com a MESMA conta Stripe que recebe o dinheiro: sem esse
  // fallback, uma chave de teste digitada aqui criaria cupons numa conta
  // diferente da cobrança, e o cliente tomaria recusa no Checkout.
  const secretKey = config?.secret_key || Deno.env.get('STRIPE_SECRET_KEY');

  if (!secretKey) {
    throw new Error(
      'Stripe não configurado: salve as chaves em Faturamento → Configurações ' +
      'ou defina a secret STRIPE_SECRET_KEY no projeto.',
    );
  }

  const stripe = new Stripe(secretKey, {
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
      .eq('user_id', user.id)
      .single();

    if (profile?.role !== 'superadmin') {
      throw new Error('Forbidden: Only superadmin can perform Stripe admin actions');
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

      case 'create_coupon': {
        const { stripe } = await getStripeClient(supabaseClient);
        const input = parseCouponPayload(payload);

        // --- 1) Coupon no Stripe (o desconto em si) ---
        const couponParams: Record<string, any> = {
          name: input.code,
          duration: input.duration,
        };
        if (input.discountType === 'percent') {
          couponParams.percent_off = input.discountValue;
        } else {
          // Reais → centavos. Única conversão do fluxo.
          couponParams.amount_off = Math.round(input.discountValue * 100);
          couponParams.currency = COUPON_CURRENCY;
        }
        if (input.duration === 'repeating') {
          couponParams.duration_in_months = input.durationInMonths;
        }

        const stripeCoupon = await stripe.coupons.create(couponParams);

        // --- 2) Promotion Code (o texto digitado no Checkout) ---
        let promotionCode: any;
        try {
          const promoParams: Record<string, any> = {
            coupon: stripeCoupon.id,
            code: input.code,
          };
          if (input.maxUses !== null) promoParams.max_redemptions = input.maxUses;
          if (input.validUntil) {
            promoParams.expires_at = Math.floor(input.validUntil.getTime() / 1000);
          }
          promotionCode = await stripe.promotionCodes.create(promoParams);
        } catch (promoError) {
          // Não deixa Coupon órfão no Stripe se o code já existir, por exemplo.
          await stripe.coupons.del(stripeCoupon.id).catch(() => {});
          throw promoError;
        }

        // --- 3) Persiste no nosso banco ---
        const { data: row, error: insertError } = await supabaseClient
          .from('coupons')
          .insert({
            code: input.code,
            stripe_coupon_id: stripeCoupon.id,
            stripe_promotion_code_id: promotionCode.id,
            discount_type: input.discountType,
            discount_value: input.discountValue,
            duration: input.duration,
            duration_in_months: input.durationInMonths,
            max_uses: input.maxUses,
            valid_until: input.validUntil ? input.validUntil.toISOString() : null,
            is_active: true,
          })
          .select()
          .single();

        if (insertError) {
          // Rollback: o cupom não pode existir no Stripe sem existir aqui.
          await stripe.promotionCodes.update(promotionCode.id, { active: false }).catch(() => {});
          await stripe.coupons.del(stripeCoupon.id).catch(() => {});

          if (insertError.code === PG_UNDEFINED_COLUMN) {
            throw new Error(
              'A tabela coupons está desatualizada. Rode a migração ' +
              '20260811000001_coupons_duration_and_promo_code.sql antes de criar cupons.',
            );
          }
          throw new Error(`Falha ao salvar o cupom: ${insertError.message}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            coupon_id: stripeCoupon.id,
            promotion_code_id: promotionCode.id,
            coupon: row,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list_coupons': {
        const { data, error } = await supabaseClient
          .from('coupons')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        return new Response(
          JSON.stringify(data ?? []),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'archive_coupon': {
        const { stripe } = await getStripeClient(supabaseClient);

        const couponId = payload?.coupon_id;
        if (!couponId) throw new Error('Informe o cupom a ser arquivado.');

        // O banco é a fonte da verdade; o payload é só um atalho do frontend.
        const { data: existing } = await supabaseClient
          .from('coupons')
          .select('*')
          .eq('id', couponId)
          .maybeSingle();

        const stripeCouponId = existing?.stripe_coupon_id ?? payload?.stripe_coupon_id ?? null;
        const storedPromoId = existing?.stripe_promotion_code_id ?? null;

        // O que impede o resgate é desativar o Promotion Code — o Coupon do
        // Stripe não tem flag `active`, só pode ser deletado (o que NÃO afeta
        // assinaturas que já o aplicaram, apenas bloqueia novos resgates).
        const warnings: string[] = [];

        try {
          if (storedPromoId) {
            await stripe.promotionCodes.update(storedPromoId, { active: false });
          } else if (stripeCouponId) {
            // Linhas antigas não têm o id salvo: varre os codes do cupom.
            const promos = await stripe.promotionCodes.list({
              coupon: stripeCouponId,
              active: true,
              limit: 100,
            });
            for (const promo of promos.data) {
              await stripe.promotionCodes.update(promo.id, { active: false });
            }
          }
        } catch (e: any) {
          warnings.push(`Promotion Code: ${e.message}`);
        }

        if (stripeCouponId) {
          try {
            await stripe.coupons.del(stripeCouponId);
          } catch (e: any) {
            // Já deletado no dashboard, por exemplo — não bloqueia o arquivamento.
            warnings.push(`Coupon: ${e.message}`);
          }
        }

        const { error: updateError } = await supabaseClient
          .from('coupons')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', couponId);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, warnings }),
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
