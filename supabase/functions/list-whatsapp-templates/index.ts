import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { ProviderFactory } from '../_shared/provider-factory.ts';
import { MetaProvider } from '../_shared/whatsapp-providers/meta.ts';

/**
 * list-whatsapp-templates
 *
 * Lista os message templates de uma instância Meta (Cloud API) direto da Graph
 * API (SKILL.md §7.1), para o frontend oferecer um seletor de templates
 * aprovados em vez de exigir o nome digitado.
 *
 * O token Meta vive no Vault e é resolvido pelo ProviderFactory via
 * get_instance_meta_token (SECURITY DEFINER). Consumida pelo MetaAdapter.
 */

interface ListRequest {
  instance_id: string;
}

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

  const jsonResponse = (body: Record<string, any>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: extrair JWT e identificar caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) return jsonResponse({ ok: false, error: 'Invalid token' }, 401);

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role')
    .eq('user_id', callerUser.id)
    .single();
  if (!callerProfile?.tenant_id) return jsonResponse({ ok: false, error: 'Profile not found' }, 403);

  // Parse body
  let body: ListRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  if (!body?.instance_id) {
    return jsonResponse({ ok: false, error: 'instance_id is required' }, 400);
  }

  // Resolve instância e checa tenant + provider=official
  const { data: instance, error: instanceError } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, tenant_id, provider, instance_key, connection_config, status')
    .eq('id', body.instance_id)
    .single();
  if (instanceError || !instance) return jsonResponse({ ok: false, error: 'Instance not found' }, 404);

  const isSuperAdmin = callerProfile.role === 'super_admin';
  if (!isSuperAdmin && instance.tenant_id !== callerProfile.tenant_id) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
  }
  if (instance.provider !== 'official') {
    return jsonResponse(
      { ok: false, error: 'Esta função só atende instâncias Meta (provider=official).' },
      400,
    );
  }

  const cfg = (instance.connection_config as Record<string, any>) || {};
  if (!cfg.wabaId) {
    return jsonResponse(
      { ok: false, error: 'connection_config.wabaId ausente — não é possível listar templates.' },
      400,
    );
  }

  try {
    const provider = await ProviderFactory.getProvider(instance as any, supabaseAdmin) as MetaProvider;
    const raw = await provider.listTemplates();

    // Normaliza o shape para o frontend: nome, idioma, status, categoria e a
    // contagem de parâmetros {{n}} do corpo (para montar os campos no diálogo).
    const templates = raw.map((t: any) => {
      const bodyComp = Array.isArray(t.components)
        ? t.components.find((c: any) => String(c.type).toUpperCase() === 'BODY')
        : null;
      const bodyText: string = bodyComp?.text || '';
      const matches = bodyText.match(/\{\{\s*\d+\s*\}\}/g);
      const paramCount = matches ? new Set(matches.map((m: string) => m.replace(/\D/g, ''))).size : 0;
      return {
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
        bodyText,
        paramCount,
      };
    });

    logger.info('Templates Meta listados', { instance_id: instance.id, count: templates.length });
    return jsonResponse({ ok: true, templates }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('Falha ao listar templates Meta', { instance_id: instance.id, error: msg });
    return jsonResponse({ ok: false, error: msg }, 502);
  }
});
