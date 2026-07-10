import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

// =============================================================================
// create-checkout-session
// -----------------------------------------------------------------------------
// Cria uma sessão de Stripe Checkout (assinatura recorrente) para a Conta do
// usuário autenticado. Padronizado em ENV secrets (igual ao stripe-webhook):
//   - STRIPE_SECRET_KEY  → chave secreta (sk_test_... em teste, sk_live_... em prod)
//   - STRIPE_PRICE_ID    → Price recorrente de R$ 29,90/mês (price_...)
//   - APP_URL (opcional) → fallback de origem para os redirects de sucesso/cancelo
//
// Segurança:
//   - O tenant_id NÃO vem do browser: é resolvido no servidor a partir do
//     profiles do usuário logado. Assim ninguém paga por outra Conta.
//   - O Price também é fixado no servidor (env), então o cliente não troca o preço.
//   - client_reference_id = tenant.id — o stripe-webhook depende disso para
//     ativar a Conta certa no checkout.session.completed.
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_PRICE_ID");

    if (!stripeSecret || !priceId) {
      console.error("Missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID");
      return new Response(
        JSON.stringify({ error: "Cobrança ainda não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Autenticação: resolve o usuário a partir do JWT ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    ).auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Resolve o tenant do usuário no servidor (service role) ----
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.tenant_id) {
      console.error("Could not resolve tenant for user", user.id, profileError);
      return new Response(
        JSON.stringify({ error: "Conta não encontrada para este usuário." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const tenantId = profile.tenant_id as string;

    // Já assinante? Evita checkout duplicado.
    const { data: tenant } = await admin
      .from("tenants")
      .select("subscription_status")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenant?.subscription_status === "active") {
      return new Response(
        JSON.stringify({ error: "Esta Conta já possui uma assinatura ativa." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Monta URLs de retorno a partir da origem da requisição ----
    const origin =
      req.headers.get("origin") || Deno.env.get("APP_URL") || "";
    const successUrl = `${origin}/dashboard/settings?checkout=success`;
    const cancelUrl = `${origin}/dashboard/settings?checkout=cancel`;

    // ---- Cria a sessão de Checkout ----
    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: tenantId,
      customer_email: user.email ?? undefined,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { tenant_id: tenantId },
      },
      metadata: { tenant_id: tenantId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout-session error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Erro ao iniciar checkout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
