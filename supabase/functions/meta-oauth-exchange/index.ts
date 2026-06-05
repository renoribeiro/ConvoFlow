import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';

// Graph API version — matches the default used in whatsapp-meta-setup and
// the MetaProvider class (meta.ts). Update only when Meta confirms v20.0 is
// deprecated; SKILL.md lists v19.0 as the safe minimum, but the codebase
// standardised on v20.0.
const DEFAULT_GRAPH_VERSION = 'v20.0';

interface ExchangeRequest {
  /** Authorization code received from the Embedded Signup dialog (LaunchParams). */
  code: string;
  /** WhatsApp Business Account ID selected during Embedded Signup. */
  wabaId: string;
  /** Phone Number ID selected during Embedded Signup. */
  phoneNumberId: string;
  /** Optional human-readable name for the new instance. */
  name?: string;
}

interface GraphTokenResponse {
  access_token?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}

interface PhoneDetailsResponse {
  display_phone_number?: string;
  verified_name?: string;
  error?: {
    message: string;
    code: number;
  };
}

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

  const jsonResponse = (body: Record<string, any>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método não permitido' }, 405);
  }

  // --- Environment validation ---
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // META_APP_ID is NEW — Yuri must set this secret in the Supabase project.
  const metaAppId = Deno.env.get('META_APP_ID');
  // META_APP_SECRET already exists (also used by meta-webhook for signature validation).
  const metaAppSecret = Deno.env.get('META_APP_SECRET');

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ success: false, error: 'Servidor mal configurado' }, 500);
  }
  if (!metaAppId) {
    logger.error('META_APP_ID env var is not set');
    return jsonResponse({ success: false, error: 'META_APP_ID não configurado no servidor' }, 500);
  }
  if (!metaAppSecret) {
    logger.error('META_APP_SECRET env var is not set');
    return jsonResponse({ success: false, error: 'META_APP_SECRET não configurado no servidor' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // --- Auth check (JWT verified by Supabase gateway; this is a belt-and-suspenders check) ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ success: false, error: 'Cabeçalho de autorização ausente' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) {
    return jsonResponse({ success: false, error: 'Token inválido' }, 401);
  }

  // --- Resolve caller's tenant (same pattern as whatsapp-meta-setup) ---
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role')
    .eq('user_id', callerUser.id)
    .single();

  if (!callerProfile?.tenant_id) {
    return jsonResponse({ success: false, error: 'Conta do usuário não encontrada' }, 403);
  }

  // --- Parse and validate request body ---
  let body: ExchangeRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
  }

  const { code, wabaId, phoneNumberId, name } = body ?? {};

  if (!code || typeof code !== 'string') {
    return jsonResponse({ success: false, error: 'O campo "code" é obrigatório' }, 400);
  }
  if (!wabaId || typeof wabaId !== 'string') {
    return jsonResponse({ success: false, error: 'O campo "wabaId" é obrigatório' }, 400);
  }
  if (!phoneNumberId || typeof phoneNumberId !== 'string') {
    return jsonResponse({ success: false, error: 'O campo "phoneNumberId" é obrigatório' }, 400);
  }

  const graphVersion = DEFAULT_GRAPH_VERSION;

  // Track whether we inserted an instance row so we can roll it back on failure.
  let insertedInstanceId: string | undefined;

  try {
    // -------------------------------------------------------------------------
    // Step 1: Exchange authorization code for an access token.
    //
    // SKILL.md §10 rule 1: token exchange must happen server-side only.
    // Endpoint documented in SKILL.md §1 (Graph API base).
    // -------------------------------------------------------------------------
    logger.info('Exchanging Meta authorization code for access token', {
      wabaId,
      phoneNumberId,
    });

    const tokenUrl =
      `https://graph.facebook.com/${graphVersion}/oauth/access_token` +
      `?client_id=${encodeURIComponent(metaAppId)}` +
      `&client_secret=${encodeURIComponent(metaAppSecret)}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl, { method: 'GET' });
    const tokenData: GraphTokenResponse = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      const errMsg = tokenData.error?.message ?? `HTTP ${tokenRes.status}`;
      const errCode = tokenData.error?.code;
      // Never log the code or the full tokenData — it may contain partial tokens.
      logger.error('Meta token exchange failed', { errCode, httpStatus: tokenRes.status });
      return jsonResponse(
        {
          success: false,
          error: `Falha na troca do código Meta: ${errMsg}`,
          meta_error_code: errCode,
        },
        tokenRes.ok ? 400 : tokenRes.status >= 500 ? 502 : 400,
      );
    }

    if (!tokenData.access_token) {
      logger.error('Meta token exchange returned no access_token');
      return jsonResponse(
        { success: false, error: 'Resposta da Meta não contém access_token' },
        502,
      );
    }

    const accessToken = tokenData.access_token;
    // Never log accessToken — store reference only in Vault.

    // -------------------------------------------------------------------------
    // Step 2: Subscribe the app to this WABA so webhooks start flowing.
    //
    // SKILL.md §3.2: POST /{WABA_ID}/subscribed_apps (bearer token required).
    // Treat an already-subscribed 200/true response as idempotent success.
    // -------------------------------------------------------------------------
    logger.info('Subscribing app to WABA', { wabaId });

    const subscribeUrl =
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`;

    const subscribeRes = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!subscribeRes.ok) {
      const subscribeText = await subscribeRes.text();
      logger.error('Meta subscribed_apps failed', {
        httpStatus: subscribeRes.status,
        body: truncate(subscribeText, 300),
      });
      return jsonResponse(
        {
          success: false,
          error: `Falha ao inscrever app no WABA: ${truncate(subscribeText, 200)}`,
        },
        subscribeRes.status >= 500 ? 502 : 400,
      );
    }

    logger.info('App subscribed to WABA successfully', { wabaId });

    // -------------------------------------------------------------------------
    // Step 3: Fetch phone number display details for the instance record.
    //
    // SKILL.md §1.1: GET /{PHONE_NUMBER_ID}?fields=display_phone_number,verified_name
    // Non-fatal: if this call fails we log and continue with nulls.
    // -------------------------------------------------------------------------
    let phoneNumberDisplay: string | null = null;
    let verifiedName: string | null = null;

    try {
      const phoneUrl =
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}` +
        `?fields=display_phone_number,verified_name`;

      const phoneRes = await fetch(phoneUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (phoneRes.ok) {
        const phoneData: PhoneDetailsResponse = await phoneRes.json();
        phoneNumberDisplay = phoneData.display_phone_number ?? null;
        verifiedName = phoneData.verified_name ?? null;
        logger.info('Fetched phone number details', {
          display: phoneNumberDisplay,
          verified: verifiedName,
        });
      } else {
        const phoneText = await phoneRes.text();
        logger.warn('Could not fetch phone number details (non-fatal)', {
          httpStatus: phoneRes.status,
          body: truncate(phoneText, 200),
        });
      }
    } catch (phoneErr: any) {
      logger.warn('Phone number details fetch threw (non-fatal)', {
        error: phoneErr?.message,
      });
    }

    // -------------------------------------------------------------------------
    // Step 4: Phone number registration (/register) is NOT performed here.
    //
    // The /register endpoint (SKILL.md §6.3) requires a 6-digit 2FA PIN that
    // the business owner must provide explicitly. Calling it without the correct
    // PIN would lock the number. A separate "register phone" flow (with PIN
    // input) must be implemented as a follow-up step — see SKILL.md §6.1–6.3.
    // Until /register is called, outbound messages from this number will return
    // error 133010 ("Telefone não registrado").
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Step 5: Create the whatsapp_instances row.
    //
    // connection_config keys mirror what the rest of the codebase expects:
    //   phoneNumberId, wabaId, graphApiVersion (useMetaApi.tsx, meta-webhook,
    //   whatsapp-meta-setup).
    // onboarding: 'embedded_signup' distinguishes this path from manual setup.
    // Status 'open' matches what whatsapp-meta-setup sets on a successful create.
    // instance_key uses phoneNumberId following the convention in useMetaApi.tsx.
    // -------------------------------------------------------------------------
    const instanceName =
      name?.trim() ||
      (verifiedName ? verifiedName : `Meta ${phoneNumberId}`);

    const connectionConfig = {
      phoneNumberId,
      wabaId,
      graphApiVersion: graphVersion,
      onboarding: 'embedded_signup',
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('whatsapp_instances')
      .insert({
        tenant_id: callerProfile.tenant_id,
        name: instanceName,
        instance_key: phoneNumberId,
        provider: 'official',
        status: 'open',
        phone_number: phoneNumberDisplay,
        profile_name: verifiedName,
        last_connected_at: new Date().toISOString(),
        // @ts-ignore connection_config may not yet be in generated types
        connection_config: connectionConfig,
      })
      .select('id, tenant_id, name, status, phone_number, profile_name, provider, connection_config')
      .single();

    if (insertError || !inserted) {
      logger.error('Failed to insert whatsapp_instance', { error: insertError?.message });
      return jsonResponse(
        { success: false, error: 'Falha ao salvar instância: ' + (insertError?.message ?? 'erro desconhecido') },
        500,
      );
    }

    insertedInstanceId = inserted.id;
    logger.info('whatsapp_instance row created', { instance_id: insertedInstanceId });

    // -------------------------------------------------------------------------
    // Step 6: Store access token in Vault via SECURITY DEFINER RPC.
    //
    // This is the same call whatsapp-meta-setup uses.
    // The token never appears in logs — we only log success/failure.
    // -------------------------------------------------------------------------
    const { error: rpcError } = await supabaseAdmin.rpc('set_instance_meta_token', {
      p_instance_id: insertedInstanceId,
      p_token: accessToken,
    });

    if (rpcError) {
      logger.error('Failed to store Meta token in Vault', { error: rpcError.message });
      // Roll back the instance row (step 7).
      throw new Error('Falha ao armazenar token de acesso: ' + rpcError.message);
    }

    logger.info('Meta access token stored in Vault', { instance_id: insertedInstanceId });

    // Success — return the instance data to the caller.
    return jsonResponse(
      {
        success: true,
        instance: inserted,
      },
      200,
    );
  } catch (err: any) {
    // -------------------------------------------------------------------------
    // Step 7: Rollback — if the instance row was already inserted, delete it
    // so the user can retry without accumulating orphaned rows.
    //
    // Mirrors the rollback pattern in useMetaApi.tsx (client-side) and the
    // spirit of whatsapp-meta-setup's error handling.
    // -------------------------------------------------------------------------
    if (insertedInstanceId) {
      logger.warn('Rolling back whatsapp_instance due to error', {
        instance_id: insertedInstanceId,
      });
      const { error: deleteError } = await supabaseAdmin
        .from('whatsapp_instances')
        .delete()
        .eq('id', insertedInstanceId);
      if (deleteError) {
        logger.error('Rollback delete failed', {
          instance_id: insertedInstanceId,
          error: deleteError.message,
        });
      }
    }

    logger.error('meta-oauth-exchange failed', { error: err?.message });
    return jsonResponse(
      { success: false, error: err?.message ?? 'Erro interno desconhecido' },
      500,
    );
  }
});

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}
