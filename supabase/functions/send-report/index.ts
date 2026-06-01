// =============================================================================
// send-report — Gera um relatório com dados reais do tenant e envia por e-mail
// via Resend (https://resend.com). Registra a execução em report_executions.
// =============================================================================
// Fluxo:
//   1. Autentica o caller pelo JWT (Authorization: Bearer) e resolve o tenant_id
//      a partir de profiles — TODA consulta de dados é escopada por esse tenant_id
//      (nunca confia em tenant vindo do body).
//   2. Coleta métricas reais (contatos, conversas, mensagens, funil, campanhas)
//      no período selecionado.
//   3. Renderiza um e-mail HTML (e anexa CSV quando o formato pedido é csv/excel).
//   4. Envia via Resend para os destinatários informados.
//   5. Grava uma linha em report_executions (status completed/failed + tempo).
//
// Secrets necessários (configurar em Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY     — API key do Resend (re_...)
//   REPORT_FROM_EMAIL  — remetente verificado no Resend, ex.: "ConvoFlow
//                        Relatórios <relatorios@convoflow.com.br>"
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Helpers inline (espelham supabase/functions/_shared/validation.ts) — mantidos
// locais para que esta função seja um artefato autocontido no deploy.
// ---------------------------------------------------------------------------
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
  type?: 'campaigns' | 'conversations' | 'funnel' | 'general' | string;
  frequency?: string;
  format?: 'pdf' | 'excel' | 'csv' | 'html' | string;
  metrics?: string[];
  filters?: {
    dateRange?: string;
    campaigns?: string[];
    contacts?: string[];
    status?: string[];
  };
  delivery?: {
    email?: boolean;
    whatsapp?: boolean;
    recipients?: string[] | string;
  };
}

interface CallerProfile {
  id: string;
  user_id: string;
  role: string;
  tenant_id: string | null;
  status: string;
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function getCaller(admin: SupabaseClient, token: string): Promise<CallerProfile> {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
  }
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new SecureError('Profile do caller não encontrado', 'NO_PROFILE', 403);
  }
  if (profile.status && profile.status !== 'active') {
    throw new SecureError('Conta suspensa ou inativa', 'INACTIVE', 403);
  }
  if (!profile.tenant_id) {
    throw new SecureError('Usuário sem tenant associado', 'NO_TENANT', 403);
  }
  return profile as CallerProfile;
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------
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

async function countIn(
  admin: SupabaseClient,
  table: string,
  apply: (q: any) => any,
): Promise<number> {
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

// ---------------------------------------------------------------------------
// Coleta de métricas (sempre escopada por tenant_id)
// ---------------------------------------------------------------------------
async function collectMetrics(admin: SupabaseClient, tenantId: string, sinceIso: string) {
  const [
    contactsTotal,
    contactsNew,
    conversationsTotal,
    conversationsNew,
    conversationsArchived,
    messagesTotal,
    messagesSent,
    messagesReceived,
  ] = await Promise.all([
    countIn(admin, 'contacts', (q) => q.eq('tenant_id', tenantId)),
    countIn(admin, 'contacts', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(admin, 'conversations', (q) => q.eq('tenant_id', tenantId)),
    countIn(admin, 'conversations', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(admin, 'conversations', (q) => q.eq('tenant_id', tenantId).eq('is_archived', true)),
    countIn(admin, 'messages', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(admin, 'messages', (q) =>
      q.eq('tenant_id', tenantId).gte('created_at', sinceIso).in('direction', ['outbound', 'sent', 'out'])),
    countIn(admin, 'messages', (q) =>
      q.eq('tenant_id', tenantId).gte('created_at', sinceIso).in('direction', ['inbound', 'received', 'in'])),
  ]);

  // Leads por estágio do funil
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
          count: await countIn(admin, 'contacts', (q) =>
            q.eq('tenant_id', tenantId).eq('current_stage_id', s.id)),
        })),
      );
    }
  } catch { /* funil opcional */ }

  return {
    contactsTotal,
    contactsNew,
    conversationsTotal,
    conversationsNew,
    conversationsArchived,
    messagesTotal,
    messagesSent,
    messagesReceived,
    funnelStages,
  };
}

type Metrics = Awaited<ReturnType<typeof collectMetrics>>;

// ---------------------------------------------------------------------------
// Render HTML
// ---------------------------------------------------------------------------
function metricCard(label: string, value: number | string): string {
  return `
    <td style="padding:8px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:#0f172a;">${value}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">${label}</div>
      </div>
    </td>`;
}

function renderHtml(opts: {
  name: string;
  typeLabel: string;
  periodLabel: string;
  generatedAt: string;
  m: Metrics;
}): string {
  const { name, typeLabel, periodLabel, generatedAt, m } = opts;

  const funnelRows = m.funnelStages.length
    ? m.funnelStages
        .map(
          (s) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#334155;">${s.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a;">${s.count}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="2" style="padding:12px;color:#94a3b8;">Sem estágios de funil configurados.</td></tr>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#16a34a;border-radius:12px 12px 0 0;padding:24px;">
      <div style="color:#ffffff;font-size:20px;font-weight:700;">ConvoFlow · Relatório</div>
      <div style="color:#dcfce7;font-size:13px;margin-top:4px;">${typeLabel} — ${periodLabel}</div>
    </div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <h1 style="font-size:18px;color:#0f172a;margin:0 0 4px;">${name}</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 20px;">Gerado em ${generatedAt}</p>

      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>${metricCard('Contatos (total)', m.contactsTotal)}${metricCard('Novos contatos', m.contactsNew)}</tr>
        <tr>${metricCard('Conversas (total)', m.conversationsTotal)}${metricCard('Novas conversas', m.conversationsNew)}</tr>
        <tr>${metricCard('Msgs enviadas', m.messagesSent)}${metricCard('Msgs recebidas', m.messagesReceived)}</tr>
      </table>

      <h2 style="font-size:15px;color:#0f172a;margin:24px 0 8px;">Resumo de mensagens</h2>
      <p style="font-size:13px;color:#475569;margin:0;">
        Total de mensagens no período: <strong>${m.messagesTotal}</strong>
        &middot; Conversas arquivadas: <strong>${m.conversationsArchived}</strong>
      </p>

      <h2 style="font-size:15px;color:#0f172a;margin:24px 0 8px;">Leads por estágio do funil</h2>
      <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #f1f5f9;border-radius:8px;overflow:hidden;">
        ${funnelRows}
      </table>

      <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;border-top:1px solid #f1f5f9;padding-top:16px;">
        Este relatório foi gerado automaticamente pelo ConvoFlow com base nos dados reais da sua conta.
      </p>
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

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------
async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new SecureError(
      `Falha no envio pelo Resend (HTTP ${res.status}): ${detail.slice(0, 300)}`,
      'EMAIL_PROVIDER_ERROR',
      502,
    );
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return json({ error: { message: 'Método não permitido', code: 'METHOD_NOT_ALLOWED' } }, 405, cors);
  }

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

    // Validação de entrega
    const wantsEmail = body.delivery?.email !== false; // default: enviar por e-mail
    const rawRecipients = body.delivery?.recipients;
    const recipients = (Array.isArray(rawRecipients) ? rawRecipients : String(rawRecipients ?? '')
      .split(/[,;\n]/))
      .map((r) => r.trim())
      .filter(Boolean)
      .filter((r) => EMAIL_RE.test(r));

    if (!wantsEmail) {
      throw new SecureError('Selecione "Enviar por Email" para esta ação', 'NO_EMAIL_DELIVERY', 400);
    }
    if (recipients.length === 0) {
      throw new SecureError('Informe ao menos um e-mail de destinatário válido', 'NO_RECIPIENTS', 400);
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('REPORT_FROM_EMAIL');
    if (!apiKey) throw new SecureError('RESEND_API_KEY não configurada no servidor', 'MISSING_CONFIG', 500);
    if (!from) throw new SecureError('REPORT_FROM_EMAIL não configurada no servidor', 'MISSING_CONFIG', 500);

    const { since, label: periodLabel } = rangeToSince(body.filters?.dateRange);
    const m = await collectMetrics(admin, caller.tenant_id!, since.toISOString());

    const typeLabels: Record<string, string> = {
      campaigns: 'Campanhas',
      conversations: 'Conversas',
      funnel: 'Funil de Vendas',
      general: 'Geral',
    };
    const typeLabel = typeLabels[body.type ?? 'general'] ?? 'Geral';
    const name = (body.name && body.name.trim()) || `Relatório ${typeLabel}`;
    const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const html = renderHtml({ name, typeLabel, periodLabel, generatedAt, m });

    const attachments =
      body.format === 'csv' || body.format === 'excel'
        ? [{ filename: `${name.replace(/[^\w.-]+/g, '_')}.csv`, content: btoa(unescape(encodeURIComponent(renderCsv(m)))) }]
        : undefined;

    await sendViaResend({
      apiKey,
      from,
      to: recipients,
      subject: `📊 ${name} — ${periodLabel}`,
      html,
      attachments,
    });

    const executionTime = Date.now() - startedAt;
    // E-mail já foi enviado — o registro da execução é best-effort e NÃO pode
    // mascarar o sucesso do envio caso a gravação falhe.
    let executionId: string | null = null;
    try {
      const { data: execution } = await admin
        .from('report_executions')
        .insert({
          tenant_id: caller.tenant_id,
          template_id: null,
          executed_by: caller.user_id,
          status: 'success', // valores permitidos pela CHECK: success | failed | timeout
          execution_time: executionTime,
          parameters: { ...body, recipients, resolvedFrom: from },
          executed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      executionId = execution?.id ?? null;
    } catch (logErr) {
      console.error('Falha ao registrar report_execution (e-mail já enviado):', logErr);
    }

    return json(
      {
        success: true,
        executionId,
        recipients,
        executionTime,
        metrics: m,
      },
      200,
      cors,
    );
  } catch (err) {
    const secure = err instanceof SecureError ? err : null;
    // Registra a falha (best-effort) se já temos o tenant do caller
    if (caller?.tenant_id) {
      await admin
        .from('report_executions')
        .insert({
          tenant_id: caller.tenant_id,
          template_id: null,
          executed_by: caller.user_id,
          status: 'failed',
          execution_time: Date.now() - startedAt,
          error_message: (err as Error)?.message?.slice(0, 500) ?? 'Erro desconhecido',
          parameters: body,
          executed_at: new Date().toISOString(),
        })
        .then(() => {}, () => {});
    }
    return json(
      {
        success: false,
        error: {
          message: (err as Error)?.message ?? 'Erro interno',
          code: secure?.code ?? 'INTERNAL_ERROR',
        },
      },
      secure?.statusCode ?? 500,
      cors,
    );
  }
});
