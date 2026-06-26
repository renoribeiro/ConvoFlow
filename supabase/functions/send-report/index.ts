// =============================================================================
// send-report — Gera um relatório com dados reais do tenant e entrega por
// e-mail (Resend) e/ou WhatsApp (instância de envio do sistema, configurada
// pelo super admin). Registra a execução em report_executions.
// =============================================================================
// Secrets necessários (e-mail):
//   RESEND_API_KEY     — API key do Resend (re_...)
//   REPORT_FROM_EMAIL  — remetente verificado, ex.: "ConvoFlow <relatorios@...>"
//
// WhatsApp: o super admin define em system_settings (key='report_whatsapp_instance_id',
// value={instanceId}) qual whatsapp_instances é o número de envio do sistema.
// O envio é agnóstico de provider (evolution | waha | official/Meta).
//
// ⚠️ Meta Cloud API (provider 'official') só envia texto livre dentro da janela
// de 24h; fora disso exige template aprovado (erro 131047).
//
// Regras WhatsApp: ver .agent/skills/{evolution-v2,waha,meta-cloud-api}/SKILL.md
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://convoflow.com.br',
  'https://www.convoflow.com.br',
  'https://convoflow.vercel.app',
  'https://www.convoflow.vercel.app',
];
const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function buildCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('DENO_ENV') || 'production';
  let origin = ALLOWED_ORIGINS[0];
  if (env === 'development' || env === 'local') {
    origin = requestOrigin || '*';
  } else if (requestOrigin && (ALLOWED_ORIGINS.includes(requestOrigin) || LOCALHOST_PATTERN.test(requestOrigin))) {
    origin = requestOrigin;
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

class SecureError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  constructor(message: string, code = 'VALIDATION_ERROR', statusCode = 400) {
    super(message);
    this.name = 'SecureError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface ReportRequest {
  name?: string;
  description?: string;
  type?: string;
  frequency?: string;
  format?: string;
  metrics?: string[];
  filters?: { dateRange?: string; campaigns?: string[]; contacts?: string[]; status?: string[] };
  delivery?: { email?: boolean; whatsapp?: boolean; recipients?: string[] | string };
}

interface CallerProfile {
  id: string;
  user_id: string;
  role: string;
  tenant_id: string | null;
  status: string;
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getCaller(admin: SupabaseClient, token: string): Promise<CallerProfile> {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError || !profile) throw new SecureError('Profile do caller não encontrado', 'NO_PROFILE', 403);
  if (profile.status && profile.status !== 'active') throw new SecureError('Conta suspensa ou inativa', 'INACTIVE', 403);
  if (!profile.tenant_id) throw new SecureError('Usuário sem tenant associado', 'NO_TENANT', 403);
  return profile as CallerProfile;
}

function rangeToSince(dateRange?: string): { since: Date; label: string } {
  const now = new Date();
  const map: Record<string, { days: number; label: string }> = {
    today: { days: 1, label: 'Hoje' },
    '1day': { days: 1, label: 'Último dia' },
    '7days': { days: 7, label: 'Últimos 7 dias' },
    '14days': { days: 14, label: 'Últimos 14 dias' },
    '30days': { days: 30, label: 'Últimos 30 dias' },
    '90days': { days: 90, label: 'Últimos 90 dias' },
    '6months': { days: 180, label: 'Últimos 6 meses' },
    '1year': { days: 365, label: 'Último ano' },
    year: { days: 365, label: 'Último ano' },
  };
  const entry = map[dateRange ?? '30days'] ?? map['30days'];
  const since = new Date(now.getTime() - entry.days * 24 * 60 * 60 * 1000);
  return { since, label: entry.label };
}

async function countIn(admin: SupabaseClient, table: string, apply: (q: any) => any): Promise<number> {
  try {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    q = apply(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function collectMetrics(admin: SupabaseClient, tenantId: string, sinceIso: string) {
  const [
    contactsTotal, contactsNew, conversationsTotal, conversationsNew,
    conversationsArchived, messagesTotal, messagesSent, messagesReceived,
  ] = await Promise.all([
    countIn(admin, 'contacts', (q) => q.eq('tenant_id', tenantId)),
    countIn(admin, 'contacts', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(admin, 'conversations', (q) => q.eq('tenant_id', tenantId)),
    countIn(admin, 'conversations', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(admin, 'conversations', (q) => q.eq('tenant_id', tenantId).eq('is_archived', true)),
    countIn(admin, 'messages', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(admin, 'messages', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso).in('direction', ['outbound', 'sent', 'out'])),
    countIn(admin, 'messages', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso).in('direction', ['inbound', 'received', 'in'])),
  ]);

  let funnelStages: Array<{ name: string; count: number }> = [];
  try {
    const { data: stages } = await admin
      .from('funnel_stages')
      .select('id, name, order')
      .eq('tenant_id', tenantId)
      .order('order', { ascending: true });
    if (stages && stages.length) {
      funnelStages = await Promise.all(
        stages.map(async (s: any) => ({
          name: s.name as string,
          count: await countIn(admin, 'contacts', (q) => q.eq('tenant_id', tenantId).eq('current_stage_id', s.id)),
        })),
      );
    }
  } catch { /* funil opcional */ }

  return {
    contactsTotal, contactsNew, conversationsTotal, conversationsNew,
    conversationsArchived, messagesTotal, messagesSent, messagesReceived, funnelStages,
  };
}

type Metrics = Awaited<ReturnType<typeof collectMetrics>>;

// Ícone branco da marca (PNG inline base64) para o cabeçalho escuro do e-mail.
const BRAND_ICON = "data:image/png;base64,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";

// Paleta de marca ConvoFlow (e-mail transacional)
const EMAIL = {
  bg: "#F9F9ED", // creme (fundo)
  ink: "#211E0B", // carvão (texto/fundo escuro)
  lime: "#DAE27C", // lima (destaque)
  olive: "#49511D", // oliva (apoio)
  muted: "#6E7156", // oliva-acinzentado (texto secundário)
  border: "#E6E6D2", // borda creme
  card: "#FFFFFF",
  font: '"NewBlack Typeface", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

function metricCard(label: string, value: number | string): string {
  return `
    <td style="padding:8px;">
      <div style="background:${EMAIL.bg};border:1px solid ${EMAIL.border};border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:${EMAIL.ink};">${value}</div>
        <div style="font-size:12px;color:${EMAIL.muted};margin-top:4px;">${label}</div>
      </div>
    </td>`;
}

function renderHtml(opts: { name: string; typeLabel: string; periodLabel: string; generatedAt: string; m: Metrics }): string {
  const { name, typeLabel, periodLabel, generatedAt, m } = opts;
  const funnelRows = m.funnelStages.length
    ? m.funnelStages.map((s) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};color:${EMAIL.olive};">${s.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right;font-weight:600;color:${EMAIL.ink};">${s.count}</td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="padding:12px;color:${EMAIL.muted};">Sem estágios de funil configurados.</td></tr>`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${EMAIL.bg};font-family:${EMAIL.font};">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:${EMAIL.ink};border-radius:12px 12px 0 0;padding:24px;display:flex;align-items:center;gap:12px;">
      <img src="${BRAND_ICON}" alt="ConvoFlow" width="36" height="36" style="display:inline-block;vertical-align:middle;" />
      <div>
        <div style="color:${EMAIL.bg};font-size:20px;font-weight:700;">ConvoFlow · Relatório</div>
        <div style="color:${EMAIL.lime};font-size:13px;margin-top:4px;">${typeLabel} — ${periodLabel}</div>
      </div>
    </div>
    <div style="background:${EMAIL.card};border:1px solid ${EMAIL.border};border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <h1 style="font-size:18px;color:${EMAIL.ink};margin:0 0 4px;">${name}</h1>
      <p style="font-size:13px;color:${EMAIL.muted};margin:0 0 20px;">Gerado em ${generatedAt}</p>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>${metricCard('Contatos (total)', m.contactsTotal)}${metricCard('Novos contatos', m.contactsNew)}</tr>
        <tr>${metricCard('Conversas (total)', m.conversationsTotal)}${metricCard('Novas conversas', m.conversationsNew)}</tr>
        <tr>${metricCard('Msgs enviadas', m.messagesSent)}${metricCard('Msgs recebidas', m.messagesReceived)}</tr>
      </table>
      <h2 style="font-size:15px;color:${EMAIL.ink};margin:24px 0 8px;">Resumo de mensagens</h2>
      <p style="font-size:13px;color:${EMAIL.olive};margin:0;">Total de mensagens no período: <strong>${m.messagesTotal}</strong> &middot; Conversas arquivadas: <strong>${m.conversationsArchived}</strong></p>
      <h2 style="font-size:15px;color:${EMAIL.ink};margin:24px 0 8px;">Leads por estágio do funil</h2>
      <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid ${EMAIL.border};border-radius:8px;overflow:hidden;">${funnelRows}</table>
      <p style="font-size:12px;color:${EMAIL.muted};margin:24px 0 0;border-top:1px solid ${EMAIL.border};padding-top:16px;">Este relatório foi gerado automaticamente pelo ConvoFlow com base nos dados reais da sua conta.</p>
    </div>
  </div>
</body></html>`;
}

function renderCsv(m: Metrics): string {
  const rows: Array<[string, string | number]> = [
    ['Métrica', 'Valor'],
    ['Contatos (total)', m.contactsTotal],
    ['Novos contatos', m.contactsNew],
    ['Conversas (total)', m.conversationsTotal],
    ['Novas conversas', m.conversationsNew],
    ['Conversas arquivadas', m.conversationsArchived],
    ['Mensagens no período', m.messagesTotal],
    ['Mensagens enviadas', m.messagesSent],
    ['Mensagens recebidas', m.messagesReceived],
    ...m.funnelStages.map((s) => [`Funil — ${s.name}`, s.count] as [string, number]),
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

// Resumo do relatório em texto puro (WhatsApp).
function renderWhatsAppText(name: string, typeLabel: string, periodLabel: string, m: Metrics): string {
  const lines = [
    `📊 *${name}*`,
    `${typeLabel} · ${periodLabel}`,
    '',
    `👥 Contatos: ${m.contactsTotal} (novos: ${m.contactsNew})`,
    `💬 Conversas: ${m.conversationsTotal} (novas: ${m.conversationsNew})`,
    `✉️ Mensagens no período: ${m.messagesTotal}`,
    `   • Enviadas: ${m.messagesSent}  • Recebidas: ${m.messagesReceived}`,
  ];
  if (m.funnelStages.length) {
    lines.push('', '*Funil:*');
    for (const s of m.funnelStages) lines.push(`   • ${s.name}: ${s.count}`);
  }
  lines.push('', '— ConvoFlow');
  return lines.join('\n');
}

async function sendViaResend(opts: {
  apiKey: string; from: string; to: string[]; subject: string; html: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: opts.from, to: opts.to, subject: opts.subject, html: opts.html, attachments: opts.attachments }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new SecureError(`Falha no envio pelo Resend (HTTP ${res.status}): ${detail.slice(0, 300)}`, 'EMAIL_PROVIDER_ERROR', 502);
  }
}

// Instância de WhatsApp de envio do sistema (definida pelo super admin).
async function loadSystemWhatsAppInstance(admin: SupabaseClient): Promise<any> {
  const { data: setting } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'report_whatsapp_instance_id')
    .maybeSingle();
  const raw = setting?.value as any;
  const instanceId = raw?.instanceId || (typeof raw === 'string' ? raw : null);
  if (!instanceId) {
    throw new SecureError(
      'Número de envio do sistema não configurado. Peça ao super admin para configurar em Configurações.',
      'NO_SYSTEM_WHATSAPP',
      400,
    );
  }
  const { data: instance } = await admin
    .from('whatsapp_instances')
    .select('id, provider, instance_key, connection_config, evolution_api_url, evolution_api_key, status')
    .eq('id', instanceId)
    .maybeSingle();
  if (!instance) throw new SecureError('Instância de envio do sistema não encontrada.', 'SYSTEM_WHATSAPP_NOT_FOUND', 400);
  return instance;
}

// Envio de texto WhatsApp agnóstico de provider. Regras por provider:
//  - evolution: POST {baseUrl}/message/sendText/{instanceKey}  (.agent/skills/evolution-v2)
//  - waha:      POST {baseUrl}/api/sendText                      (.agent/skills/waha)
//  - official:  Graph API + token do Vault                       (.agent/skills/meta-cloud-api)
async function sendWhatsApp(admin: SupabaseClient, instance: any, to: string, text: string): Promise<void> {
  const provider = instance.provider || 'evolution';
  const cfg = (instance.connection_config as Record<string, any>) || {};
  const number = String(to).replace(/\D/g, '');

  if (provider === 'official') {
    const phoneNumberId = cfg.phoneNumberId || instance.instance_key;
    const graphVersion = cfg.graphApiVersion || 'v20.0';
    if (!phoneNumberId) throw new Error('connection_config.phoneNumberId ausente na instância do sistema.');
    const { data: token, error: tErr } = await admin.rpc('get_instance_meta_token', { p_instance_id: instance.id });
    if (tErr || !token) throw new Error('Token Meta não encontrado no Vault para a instância do sistema.');
    const resp = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: `+${number}`,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => null);
      const code = j?.error?.code;
      let msg = j?.error?.message || `HTTP ${resp.status}`;
      if (code === 131047) {
        msg = 'Fora da janela de 24h do WhatsApp: o destinatário precisa ter enviado mensagem nas últimas 24h, ou é necessário um template aprovado.';
      } else if (code === 131026) {
        msg = 'Número não existe no WhatsApp.';
      }
      throw new Error(msg);
    }
    return;
  }

  if (provider === 'evolution') {
    const baseUrl = cfg.baseUrl || instance.evolution_api_url;
    const apiKey = cfg.apiKey || instance.evolution_api_key;
    if (!baseUrl || !apiKey) throw new Error('Configuração Evolution ausente na instância do sistema.');
    const resp = await fetch(`${baseUrl}/message/sendText/${instance.instance_key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) throw new Error(`Evolution API (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    return;
  }

  if (provider === 'waha') {
    const baseUrl = cfg.baseUrl;
    const apiKey = cfg.apiKey;
    if (!baseUrl) throw new Error('Configuração WAHA ausente na instância do sistema.');
    const resp = await fetch(`${baseUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
      body: JSON.stringify({ session: cfg.sessionName || instance.instance_key, chatId: `${number}@c.us`, text, linkPreview: false }),
    });
    if (!resp.ok) throw new Error(`WAHA (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    return;
  }

  throw new Error(`Provider de WhatsApp não suportado: ${provider}`);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: { message: 'Método não permitido', code: 'METHOD_NOT_ALLOWED' } }, 405, cors);

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  let caller: CallerProfile | null = null;
  let body: ReportRequest = {};

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new SecureError('Authorization ausente', 'UNAUTHORIZED', 401);

    caller = await getCaller(admin, token);
    body = (await req.json().catch(() => ({}))) as ReportRequest;

    // Destinatários: separa e-mails de telefones a partir do mesmo campo.
    const rawRecipients = body.delivery?.recipients;
    const rawList = (Array.isArray(rawRecipients) ? rawRecipients : String(rawRecipients ?? '').split(/[,;\n]/))
      .map((r) => r.trim())
      .filter(Boolean);
    const emails = rawList.filter((r) => EMAIL_RE.test(r));
    const phones = rawList
      .filter((r) => !EMAIL_RE.test(r))
      .map((r) => r.replace(/\D/g, ''))
      .filter((d) => d.length >= 10);

    const wantsEmail = body.delivery?.email === true;
    const wantsWhatsapp = body.delivery?.whatsapp === true;
    if (!wantsEmail && !wantsWhatsapp) {
      throw new SecureError('Selecione ao menos um canal de entrega (e-mail ou WhatsApp).', 'NO_CHANNEL', 400);
    }
    if (wantsEmail && emails.length === 0) {
      throw new SecureError('Informe ao menos um e-mail de destinatário válido.', 'NO_EMAIL_RECIPIENTS', 400);
    }
    if (wantsWhatsapp && phones.length === 0) {
      throw new SecureError('Informe ao menos um número de WhatsApp válido (com DDD).', 'NO_PHONE_RECIPIENTS', 400);
    }

    // Métricas (uma vez, reaproveitadas em ambos os canais).
    const { since, label: periodLabel } = rangeToSince(body.filters?.dateRange);
    const m = await collectMetrics(admin, caller.tenant_id!, since.toISOString());

    const typeLabels: Record<string, string> = { campaigns: 'Campanhas', conversations: 'Conversas', funnel: 'Funil de Vendas', general: 'Geral' };
    const typeLabel = typeLabels[body.type ?? 'general'] ?? 'Geral';
    const name = (body.name && body.name.trim()) || `Relatório ${typeLabel}`;
    const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const delivered: Array<{ channel: string; to: string[] }> = [];
    const warnings: string[] = [];

    // --- Canal e-mail ---
    if (wantsEmail) {
      try {
        const apiKey = Deno.env.get('RESEND_API_KEY');
        const from = Deno.env.get('REPORT_FROM_EMAIL');
        if (!apiKey) throw new Error('RESEND_API_KEY não configurada no servidor.');
        if (!from) throw new Error('REPORT_FROM_EMAIL não configurada no servidor.');

        const html = renderHtml({ name, typeLabel, periodLabel, generatedAt, m });
        const attachments = body.format === 'csv' || body.format === 'excel'
          ? [{ filename: `${name.replace(/[^\w.-]+/g, '_')}.csv`, content: btoa(unescape(encodeURIComponent(renderCsv(m)))) }]
          : undefined;

        await sendViaResend({ apiKey, from, to: emails, subject: `📊 ${name} — ${periodLabel}`, html, attachments });
        delivered.push({ channel: 'email', to: emails });
      } catch (e) {
        warnings.push(`E-mail: ${(e as Error).message}`);
      }
    }

    // --- Canal WhatsApp (instância de envio do sistema) ---
    if (wantsWhatsapp) {
      try {
        const instance = await loadSystemWhatsAppInstance(admin);
        const text = renderWhatsAppText(name, typeLabel, periodLabel, m);
        const okPhones: string[] = [];
        for (const phone of phones) {
          try {
            await sendWhatsApp(admin, instance, phone, text);
            okPhones.push(phone);
          } catch (e) {
            warnings.push(`WhatsApp ${phone}: ${(e as Error).message}`);
          }
        }
        if (okPhones.length) delivered.push({ channel: 'whatsapp', to: okPhones });
      } catch (e) {
        warnings.push(`WhatsApp: ${(e as Error).message}`);
      }
    }

    // Nenhum canal entregou → falha (registra como failed via catch).
    if (delivered.length === 0) {
      throw new SecureError(warnings.join(' | ') || 'Nenhum canal foi entregue.', 'DELIVERY_FAILED', 502);
    }

    const allRecipients = [...emails, ...phones];
    const executionTime = Date.now() - startedAt;
    let executionId: string | null = null;
    try {
      const { data: execution } = await admin.from('report_executions').insert({
        tenant_id: caller.tenant_id, template_id: null, executed_by: caller.user_id,
        status: 'success', execution_time: executionTime,
        // parameters guarda a config + destinatários + resultado gerado + avisos.
        parameters: { ...body, recipients: allRecipients, delivered, warnings, result: m },
        executed_at: new Date().toISOString(),
      }).select('id').single();
      executionId = execution?.id ?? null;
    } catch (logErr) {
      console.error('Falha ao registrar report_execution (entrega já realizada):', logErr);
    }

    return json({ success: true, executionId, delivered, warnings, executionTime, metrics: m }, 200, cors);
  } catch (err) {
    const secure = err instanceof SecureError ? err : null;
    if (caller?.tenant_id) {
      await admin.from('report_executions').insert({
        tenant_id: caller.tenant_id, template_id: null, executed_by: caller.user_id,
        status: 'failed', execution_time: Date.now() - startedAt,
        error_message: (err as Error)?.message?.slice(0, 500) ?? 'Erro desconhecido',
        parameters: body, executed_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }
    return json({ success: false, error: { message: (err as Error)?.message ?? 'Erro interno', code: secure?.code ?? 'INTERNAL_ERROR' } }, secure?.statusCode ?? 500, cors);
  }
});
