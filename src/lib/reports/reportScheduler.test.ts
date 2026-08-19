import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeRecipients,
  resolveDateRange,
  runDueSchedules,
} from '../../../supabase/functions/_shared/report-scheduler.ts';
import type { SendEmailArgs } from '../../../supabase/functions/_shared/report-core.ts';

// =============================================================================
// Banco falso com filtros DE VERDADE.
// =============================================================================
// As contagens saem de linhas semeadas e são filtradas de fato por eq/gte/in.
// Isso é o que dá valor ao teste de isolamento: se alguma consulta de métrica
// perder o `.eq('tenant_id', ...)`, a contagem passa a incluir a outra Conta e
// a asserção quebra. Um espião que só verificasse "chamou .eq" não pegaria isso.
// =============================================================================

type Row = Record<string, any>;
interface Filter { op: 'eq' | 'is' | 'gte' | 'in'; col: string; val: any }

function rowMatches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const actual = row[f.col];
    switch (f.op) {
      case 'eq': return actual === f.val;
      case 'is': return actual === f.val || (f.val === null && actual == null);
      case 'gte': return actual != null && actual >= f.val;
      case 'in': return Array.isArray(f.val) && f.val.includes(actual);
    }
  });
}

class FakeDb {
  tables: Record<string, Row[]> = {
    report_schedules: [],
    report_executions: [],
    contacts: [],
    conversations: [],
    messages: [],
    funnel_stages: [],
  };

  /** Toda consulta executada, para auditoria de isolamento. */
  queries: Array<{ table: string; mode: string; filters: Filter[] }> = [];

  /** Acesso definido (evita undefined do noUncheckedIndexedAccess). */
  rows(table: string): Row[] {
    let r = this.tables[table];
    if (!r) { r = []; this.tables[table] = r; }
    return r;
  }

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows;
    return this;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: Filter[] = [];
  private mode: 'select' | 'update' | 'insert' = 'select';
  private counting = false;
  private payload: Row | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.counting = true;
    return this;
  }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  eq(col: string, val: any) { this.filters.push({ op: 'eq', col, val }); return this; }
  is(col: string, val: any) { this.filters.push({ op: 'is', col, val }); return this; }
  gte(col: string, val: any) { this.filters.push({ op: 'gte', col, val }); return this; }
  in(col: string, val: any) { this.filters.push({ op: 'in', col, val }); return this; }
  order() { return this; }
  limit() { return this; }

  private async exec() {
    // Cede o controle: é isto que permite simular duas invocações sobrepostas,
    // ambas lendo antes de qualquer uma escrever.
    await Promise.resolve();

    this.db.queries.push({ table: this.table, mode: this.mode, filters: [...this.filters] });
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);

    if (this.mode === 'insert') {
      rows.push({ ...this.payload });
      return { data: [this.payload], error: null };
    }

    const matched = rows.filter((r) => rowMatches(r, this.filters));

    if (this.mode === 'update') {
      for (const row of matched) Object.assign(row, this.payload);
      return { data: matched.map((r) => ({ id: r.id })), error: null };
    }

    if (this.counting) return { count: matched.length, error: null };
    // Cópias: quem leu não enxerga escrita posterior de outra invocação.
    return { data: matched.map((r) => ({ ...r })), error: null };
  }

  then(resolve: any, reject: any) { return this.exec().then(resolve, reject); }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-17T12:00:00Z'); // segunda, 09:00 em São Paulo
const WEEKLY_9AM = '0 9 * * 1';

function schedule(over: Partial<Row> = {}): Row {
  return {
    id: 'sched-1',
    tenant_id: 'tenant-A',
    name: 'Relatório Semanal',
    cron_expression: WEEKLY_9AM,
    recipients: ['dono@empresa.com.br'],
    parameters: { deliveryMethods: ['email'], frequency: 'weekly', dateRange: '7days' },
    is_active: true,
    last_run: null,
    next_run: null,
    created_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

function makeSender() {
  const sent: SendEmailArgs[] = [];
  const sendEmail = vi.fn(async (args: SendEmailArgs) => { sent.push(args); });
  return { sent, sendEmail };
}

let db: FakeDb;
beforeEach(() => { db = new FakeDb(); });

// ── 1. Detecção de vencimento ────────────────────────────────────────────────

describe('vencimento a partir de cron + last_run', () => {
  it('envia a agenda vencida', async () => {
    db.seed('report_schedules', [schedule()]);
    const { sendEmail, sent } = makeSender();

    const result = await runDueSchedules({ db, sendEmail, now: NOW });

    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(['dono@empresa.com.br']);
  });

  it('não envia agenda fora do horário', async () => {
    db.seed('report_schedules', [schedule()]);
    const { sendEmail } = makeSender();

    const result = await runDueSchedules({
      db, sendEmail, now: new Date('2026-08-17T18:00:00Z'),
    });

    expect(result.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.results[0]!.status).toBe('skipped_not_due');
  });

  it('não envia agenda que já rodou nesta ocorrência', async () => {
    db.seed('report_schedules', [schedule({ last_run: '2026-08-17T12:00:00Z' })]);
    const { sendEmail } = makeSender();

    const result = await runDueSchedules({
      db, sendEmail, now: new Date('2026-08-17T12:05:00Z'),
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('grava next_run para a tela exibir', async () => {
    db.seed('report_schedules', [schedule()]);
    const { sendEmail } = makeSender();

    await runDueSchedules({ db, sendEmail, now: NOW });

    const row = db.rows('report_schedules')[0]!;
    expect(row.next_run).toBe('2026-08-24T12:00:00.000Z');
    expect(row.last_run).toBe(NOW.toISOString());
  });
});

// ── 2. Idempotência ──────────────────────────────────────────────────────────

describe('idempotência — o mesmo relatório nunca sai duas vezes', () => {
  it('duas execuções seguidas enviam uma vez só', async () => {
    db.seed('report_schedules', [schedule()]);
    const { sendEmail } = makeSender();

    await runDueSchedules({ db, sendEmail, now: NOW });
    await runDueSchedules({ db, sendEmail, now: NOW });

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('duas invocações SOBREPOSTAS enviam uma vez só (compare-and-swap)', async () => {
    // As duas leem a agenda com last_run null antes de qualquer uma escrever —
    // exatamente o caso de dois ticks do cron se cruzando. Só quem vence o
    // UPDATE condicional envia.
    db.seed('report_schedules', [schedule()]);
    const { sendEmail } = makeSender();

    const [a, b] = await Promise.all([
      runDueSchedules({ db, sendEmail, now: NOW }),
      runDueSchedules({ db, sendEmail, now: NOW }),
    ]);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(a.sent + b.sent).toBe(1);
    expect(a.results[0]!.status === 'skipped_claimed_elsewhere' ||
           b.results[0]!.status === 'skipped_claimed_elsewhere').toBe(true);
    // E só uma execução foi registrada.
    expect(db.rows('report_executions')).toHaveLength(1);
  });

  it('a reclamação exige o last_run exato que foi lido', async () => {
    db.seed('report_schedules', [schedule()]);
    const { sendEmail } = makeSender();

    await runDueSchedules({ db, sendEmail, now: NOW });

    const claim = db.queries.find((q) => q.table === 'report_schedules' && q.mode === 'update');
    expect(claim).toBeDefined();
    expect(claim!.filters).toEqual(expect.arrayContaining([
      { op: 'eq', col: 'id', val: 'sched-1' },
      { op: 'eq', col: 'is_active', val: true },
      { op: 'is', col: 'last_run', val: null },
    ]));
  });
});

// ── 3. Isolamento entre Contas ───────────────────────────────────────────────

describe('isolamento entre Contas', () => {
  beforeEach(() => {
    db.seed('report_schedules', [
      schedule({ id: 'sched-A', tenant_id: 'tenant-A', name: 'Relatório A' }),
      schedule({ id: 'sched-B', tenant_id: 'tenant-B', name: 'Relatório B' }),
    ]);
    // A tem 3 contatos, B tem 1. Se o filtro de Conta sumir, A vê 4.
    db.seed('contacts', [
      { id: 'c1', tenant_id: 'tenant-A', created_at: '2026-08-16T00:00:00Z' },
      { id: 'c2', tenant_id: 'tenant-A', created_at: '2026-08-16T00:00:00Z' },
      { id: 'c3', tenant_id: 'tenant-A', created_at: '2026-08-16T00:00:00Z' },
      { id: 'c4', tenant_id: 'tenant-B', created_at: '2026-08-16T00:00:00Z' },
    ]);
    db.seed('conversations', [
      { id: 'v1', tenant_id: 'tenant-A', created_at: '2026-08-16T00:00:00Z', is_archived: false },
      { id: 'v2', tenant_id: 'tenant-B', created_at: '2026-08-16T00:00:00Z', is_archived: false },
      { id: 'v3', tenant_id: 'tenant-B', created_at: '2026-08-16T00:00:00Z', is_archived: false },
    ]);
    db.seed('messages', [
      { id: 'm1', tenant_id: 'tenant-A', created_at: '2026-08-16T00:00:00Z', direction: 'outbound' },
      { id: 'm2', tenant_id: 'tenant-B', created_at: '2026-08-16T00:00:00Z', direction: 'inbound' },
      { id: 'm3', tenant_id: 'tenant-B', created_at: '2026-08-16T00:00:00Z', direction: 'inbound' },
      { id: 'm4', tenant_id: 'tenant-B', created_at: '2026-08-16T00:00:00Z', direction: 'inbound' },
    ]);
  });

  it('cada relatório contém apenas os números da própria Conta', async () => {
    const { sendEmail } = makeSender();

    await runDueSchedules({ db, sendEmail, now: NOW });

    const execA = db.rows('report_executions').find((e) => e.tenant_id === 'tenant-A');
    const execB = db.rows('report_executions').find((e) => e.tenant_id === 'tenant-B');

    expect(execA!.parameters.result.contactsTotal).toBe(3);
    expect(execA!.parameters.result.conversationsTotal).toBe(1);
    expect(execA!.parameters.result.messagesTotal).toBe(1);

    expect(execB!.parameters.result.contactsTotal).toBe(1);
    expect(execB!.parameters.result.conversationsTotal).toBe(2);
    expect(execB!.parameters.result.messagesTotal).toBe(3);
  });

  it('nenhuma consulta de dados roda sem filtro de Conta', async () => {
    const { sendEmail } = makeSender();

    await runDueSchedules({ db, sendEmail, now: NOW });

    const dataTables = ['contacts', 'conversations', 'messages', 'funnel_stages'];
    const offenders = db.queries.filter(
      (q) => dataTables.includes(q.table) &&
        !q.filters.some((f) => f.col === 'tenant_id' && f.op === 'eq' && !!f.val),
    );

    expect(offenders).toEqual([]);
  });

  it('o e-mail de uma Conta nunca vai para o destinatário da outra', async () => {
    db.rows('report_schedules')[1]!.recipients = ['outro@empresa-b.com.br'];
    const { sendEmail, sent } = makeSender();

    await runDueSchedules({ db, sendEmail, now: NOW });

    const toA = sent.find((s) => s.subject.includes('Relatório A'));
    const toB = sent.find((s) => s.subject.includes('Relatório B'));
    expect(toA!.to).toEqual(['dono@empresa.com.br']);
    expect(toB!.to).toEqual(['outro@empresa-b.com.br']);
  });
});

// ── 4. Falha registrada, nunca engolida ──────────────────────────────────────

describe('falha registrada, nunca engolida', () => {
  it('grava report_executions com status failed e a mensagem do erro', async () => {
    db.seed('report_schedules', [schedule()]);
    const sendEmail = vi.fn(async () => { throw new Error('Resend fora do ar (HTTP 502)'); });

    const result = await runDueSchedules({ db, sendEmail, now: NOW });

    expect(result.failed).toBe(1);
    const exec = db.rows('report_executions')[0]!;
    expect(exec.status).toBe('failed');
    expect(exec.error_message).toContain('Resend fora do ar');
    expect(exec.tenant_id).toBe('tenant-A');
  });

  it('uma agenda que falha não impede as outras', async () => {
    db.seed('report_schedules', [
      schedule({ id: 'sched-A', tenant_id: 'tenant-A', recipients: ['a@x.com'] }),
      schedule({ id: 'sched-B', tenant_id: 'tenant-B', recipients: ['b@x.com'] }),
      schedule({ id: 'sched-C', tenant_id: 'tenant-C', recipients: ['c@x.com'] }),
    ]);
    const sendEmail = vi.fn(async (args: SendEmailArgs) => {
      if (args.to[0] === 'a@x.com') throw new Error('caixa cheia');
    });

    const result = await runDueSchedules({ db, sendEmail, now: NOW });

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(2);
    expect(db.rows('report_executions').filter((e) => e.status === 'success')).toHaveLength(2);
    expect(db.rows('report_executions').filter((e) => e.status === 'failed')).toHaveLength(1);
  });

  it('agenda sem destinatário válido vira falha registrada, não silêncio', async () => {
    db.seed('report_schedules', [schedule({ recipients: ['isso-não-é-email'] })]);
    const { sendEmail } = makeSender();

    const result = await runDueSchedules({ db, sendEmail, now: NOW });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(db.rows('report_executions')[0]!.status).toBe('failed');
    expect(db.rows('report_executions')[0]!.error_message).toContain('destinatário');
  });

  it('agenda com cron inválido é pulada sem derrubar o tick', async () => {
    db.seed('report_schedules', [
      schedule({ id: 'ruim', cron_expression: 'lixo' }),
      schedule({ id: 'boa', tenant_id: 'tenant-B' }),
    ]);
    const { sendEmail } = makeSender();

    const result = await runDueSchedules({ db, sendEmail, now: NOW });

    expect(result.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

// ── Auxiliares ───────────────────────────────────────────────────────────────

describe('normalizeRecipients', () => {
  it('aceita array, string separada e descarta o que não é e-mail', () => {
    expect(normalizeRecipients(['a@x.com', 'lixo', 'b@x.com'])).toEqual(['a@x.com', 'b@x.com']);
    expect(normalizeRecipients('a@x.com, b@x.com')).toEqual(['a@x.com', 'b@x.com']);
    expect(normalizeRecipients('5511999999999')).toEqual([]);
    expect(normalizeRecipients(null)).toEqual([]);
  });

  it('remove duplicados', () => {
    expect(normalizeRecipients(['a@x.com', 'a@x.com'])).toEqual(['a@x.com']);
  });
});

describe('resolveDateRange', () => {
  it('usa o dateRange gravado quando existe', () => {
    expect(resolveDateRange({ dateRange: '90days' }, '0 9 * * 1')).toBe('90days');
  });

  it('cai para o período da frequência em agenda antiga', () => {
    expect(resolveDateRange({ frequency: 'daily' }, '0 9 * * *')).toBe('1day');
    expect(resolveDateRange({ frequency: 'monthly' }, '0 9 1 * *')).toBe('30days');
    expect(resolveDateRange(null, '0 9 * * *')).toBe('1day');
    expect(resolveDateRange(null, '0 9 1 * *')).toBe('30days');
    expect(resolveDateRange(null, '0 9 * * 1')).toBe('7days');
  });
});
