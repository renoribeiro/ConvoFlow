/**
 * Chatbot flow execution engine — Deno-compatible.
 *
 * This is the server-side mirror of `src/lib/chatbot/flowEngine.ts`.
 * All pure decision-logic functions are reproduced here with identical
 * semantics so the vitest suite that tests the src/ version stays valid
 * (both implementations must behave the same way).
 *
 * Dependencies: only Supabase JS client (passed in from the caller) and
 * the WhatsApp provider abstraction. No Node/browser APIs.
 */

// ---------------------------------------------------------------------------
// Types (mirrors src/types/chatbot-flow.types.ts — kept in sync manually)
// ---------------------------------------------------------------------------

export type ChatbotNodeType =
  | 'start'
  | 'send_text'
  | 'ask_question'
  | 'show_options'
  | 'condition'
  | 'transfer_agent'
  | 'end_flow'
  | 'set_variable'
  | 'update_contact'
  | 'move_funnel';

export type ChatbotSessionStatus =
  | 'active'
  | 'completed'
  | 'transferred'
  | 'abandoned';

export type QuestionValidation = 'none' | 'email' | 'phone' | 'number';
export type ConditionOperator = 'contains' | 'equals' | 'not_empty' | 'empty';
export type UpdateContactField = 'name' | 'email' | 'phone' | 'tag';

export const DEFAULT_HANDLE = 'default';
export const CONDITION_TRUE_HANDLE = 'true';
export const CONDITION_FALSE_HANDLE = 'false';

export const INPUT_NODE_TYPES: ChatbotNodeType[] = ['ask_question', 'show_options'];
export const TERMINAL_NODE_TYPES: ChatbotNodeType[] = ['end_flow', 'transfer_agent'];

export interface ShowOptionsOption {
  id: string;
  label: string;
  value: string;
}

export interface VariableContext {
  name?: string | null;
  first_name?: string | null;
  phone?: string | null;
  incoming_message?: string | null;
  date?: string;
  time?: string;
  datetime?: string;
  [key: string]: string | null | undefined;
}

export interface ChatbotNode {
  id: string;
  chatbot_id: string;
  tenant_id: string;
  node_type: ChatbotNodeType;
  position_x: number;
  position_y: number;
  data: Record<string, unknown>;
}

export interface ChatbotEdge {
  id: string;
  chatbot_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
}

export interface ChatbotSession {
  id: string;
  chatbot_id: string;
  contact_id: string;
  tenant_id: string;
  whatsapp_instance_id: string | null;
  current_node_id: string | null;
  variables: Record<string, string>;
  status: ChatbotSessionStatus;
  awaiting_input: boolean;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (identical semantics to src/lib/chatbot/flowEngine.ts)
// ---------------------------------------------------------------------------

/**
 * Replace `{token}` occurrences in `template` with values from `context`.
 * Unknown tokens are left as-is. Whitespace inside braces is tolerated.
 */
export function substituteVariables(
  template: string | null | undefined,
  context: VariableContext,
): string {
  if (!template) return '';
  return template.replace(
    /\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}/g,
    (match, token) => {
      const value = context[token as keyof VariableContext];
      return value === undefined || value === null ? match : String(value);
    },
  );
}

/** Derive first_name from a full name. */
export function firstName(name?: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Evaluate a condition node operator. */
export function evaluateCondition(
  operator: ConditionOperator,
  variableValue: string | null | undefined,
  compareValue?: string | null,
): boolean {
  const v = (variableValue ?? '').toString();
  const c = (compareValue ?? '').toString();
  switch (operator) {
    case 'empty':
      return v.trim() === '';
    case 'not_empty':
      return v.trim() !== '';
    case 'equals':
      return v.trim().toLowerCase() === c.trim().toLowerCase();
    case 'contains':
      return v.toLowerCase().includes(c.toLowerCase());
    default:
      return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s().-]{8,20}$/;

/** Validate a user's free-text answer for an ask_question node. */
export function validateAnswer(
  validation: QuestionValidation,
  text: string,
): boolean {
  const t = (text ?? '').trim();
  switch (validation) {
    case 'email':
      return EMAIL_RE.test(t);
    case 'phone':
      return PHONE_RE.test(t) && t.replace(/\D/g, '').length >= 8;
    case 'number':
      return t !== '' && !Number.isNaN(Number(t.replace(',', '.')));
    case 'none':
    default:
      return t !== '';
  }
}

/** Does an incoming message match any of the trigger keywords? */
export function matchKeyword(message: string, keywords: string[]): boolean {
  if (!message || !keywords?.length) return false;
  const m = message.toLowerCase().trim();
  return keywords.some((k) => {
    const kw = k.toLowerCase().trim();
    return kw !== '' && m.includes(kw);
  });
}

/**
 * Match a user's reply to one of a menu's options. Accepts:
 *  - the 1-based index ("1", "2", ...)
 *  - an exact (case-insensitive) match of the option label or value
 */
export function matchOption(
  text: string,
  options: ShowOptionsOption[],
): ShowOptionsOption | null {
  if (!text || !options?.length) return null;
  const t = text.trim().toLowerCase();

  const asIndex = Number(t);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= options.length) {
    return options[asIndex - 1];
  }
  return (
    options.find(
      (o) =>
        o.label.trim().toLowerCase() === t ||
        o.value.trim().toLowerCase() === t,
    ) ?? null
  );
}

/**
 * Resolve the next node id from `currentNodeId` following the edge whose
 * source_handle matches `handle`. Falls back to the DEFAULT_HANDLE edge, then
 * to any single outgoing edge (mirrors src/ implementation exactly).
 */
export function resolveNextNodeId(
  edges: Pick<ChatbotEdge, 'source_node_id' | 'target_node_id' | 'source_handle'>[],
  currentNodeId: string,
  handle: string = DEFAULT_HANDLE,
): string | null {
  const outgoing = edges.filter((e) => e.source_node_id === currentNodeId);
  if (outgoing.length === 0) return null;

  const byHandle = outgoing.find(
    (e) => (e.source_handle ?? DEFAULT_HANDLE) === handle,
  );
  if (byHandle) return byHandle.target_node_id;

  const byDefault = outgoing.find(
    (e) => (e.source_handle ?? DEFAULT_HANDLE) === DEFAULT_HANDLE,
  );
  if (byDefault) return byDefault.target_node_id;

  return outgoing.length === 1 ? outgoing[0].target_node_id : null;
}

/** A node type that pauses the flow waiting for user input. */
export function isInputNode(nodeType: string): boolean {
  return (INPUT_NODE_TYPES as string[]).includes(nodeType);
}

/** A node type that terminates a flow (no outgoing edge required). */
export function isTerminalNode(nodeType: string): boolean {
  return (TERMINAL_NODE_TYPES as string[]).includes(nodeType);
}

// ---------------------------------------------------------------------------
// Business-hours helper
// ---------------------------------------------------------------------------

/**
 * Determine whether `now` (in UTC) falls inside the tenant's business hours.
 *
 * The tenant's `settings` JSONB may contain:
 *   {
 *     "business_hours": {
 *       "timezone": "America/Sao_Paulo",
 *       "schedule": {
 *         "0": null,               // Sunday — closed (null)
 *         "1": { "start": "09:00", "end": "18:00" },
 *         "2": { "start": "09:00", "end": "18:00" },
 *         ...
 *       }
 *     }
 *   }
 *
 * Fallback when absent: Mon–Fri 09:00–18:00 America/Sao_Paulo.
 * Returns true when OUTSIDE business hours (trigger fires when out-of-hours).
 */
export function isOutOfHours(
  tenantSettings: Record<string, unknown> | null | undefined,
  triggerTimezone?: string | null,
  nowOverride?: Date,
): boolean {
  const now = nowOverride ?? new Date();

  // Resolve timezone: prefer trigger-level, then tenant settings, then default.
  const bh = (tenantSettings?.business_hours ?? {}) as Record<string, unknown>;
  const timezone =
    triggerTimezone ||
    (bh.timezone as string | undefined) ||
    'America/Sao_Paulo';

  // Get the weekday and HH:MM in the configured timezone using Intl.DateTimeFormat.
  const localFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = localFormatter.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';

  // Intl weekday (short, en-US) → 0=Sun … 6=Sat
  const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayIndex = WEEKDAY_MAP[weekdayStr] ?? -1;
  const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);

  // Default schedule: Mon–Fri 09:00–18:00
  const DEFAULT_SCHEDULE: Record<number, { start: string; end: string } | null> = {
    0: null,
    1: { start: '09:00', end: '18:00' },
    2: { start: '09:00', end: '18:00' },
    3: { start: '09:00', end: '18:00' },
    4: { start: '09:00', end: '18:00' },
    5: { start: '09:00', end: '18:00' },
    6: null,
  };

  const schedule =
    (bh.schedule as Record<string, { start: string; end: string } | null> | undefined) ??
    DEFAULT_SCHEDULE;

  const dayEntry = schedule[String(dayIndex)] ?? schedule[dayIndex] ?? null;

  if (dayEntry === null || dayEntry === undefined) {
    // Day is closed — we're outside business hours.
    return true;
  }

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const startMin = toMinutes(dayEntry.start ?? '09:00');
  const endMin = toMinutes(dayEntry.end ?? '18:00');

  return currentMinutes < startMin || currentMinutes >= endMin;
}

// ---------------------------------------------------------------------------
// Variable context builder
// ---------------------------------------------------------------------------

/** Build the substitution context from session + contact data. */
export function buildVariableContext(opts: {
  contactName?: string | null;
  phone?: string | null;
  incomingMessage?: string | null;
  sessionVariables?: Record<string, string>;
  timezone?: string;
}): VariableContext {
  const tz = opts.timezone ?? 'America/Sao_Paulo';
  const now = new Date();

  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);

  const timeStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return {
    name: opts.contactName ?? null,
    first_name: firstName(opts.contactName),
    phone: opts.phone ?? null,
    incoming_message: opts.incomingMessage ?? null,
    date: dateStr,
    time: timeStr,
    datetime: `${dateStr} ${timeStr}`,
    ...(opts.sessionVariables ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Trigger evaluation
// ---------------------------------------------------------------------------

export interface TriggerRow {
  id: string;
  chatbot_id: string;
  trigger_type: string;
  trigger_value: Record<string, unknown>;
  is_active: boolean;
}

export interface ChatbotRow {
  id: string;
  tenant_id: string;
  whatsapp_instance_id: string | null;
  is_active: boolean | null;
  is_published: boolean;
  builder_version: number;
  priority: number | null;
}

/**
 * Evaluate whether a trigger fires for the current inbound message.
 *
 * NOTE: `no_agent_reply` is intentionally excluded here — it is time-based and
 * must be checked by a scheduler/cron job, not on inbound message arrival.
 * See `evaluateNoAgentReply` below.
 */
export function evaluateTrigger(
  trigger: TriggerRow,
  opts: {
    message: string;
    contactId: string;
    contactStageId?: string | null;
    priorInboundCount: number;
    tenantSettings?: Record<string, unknown> | null;
    now?: Date;
  },
): boolean {
  if (!trigger.is_active) return false;

  switch (trigger.trigger_type) {
    case 'keyword': {
      const keywords = (trigger.trigger_value.keywords as string[]) ?? [];
      return matchKeyword(opts.message, keywords);
    }
    case 'first_contact': {
      // Fire only when this is the very first inbound message from this contact.
      return opts.priorInboundCount === 0;
    }
    case 'out_of_hours': {
      const tz = trigger.trigger_value.timezone as string | undefined;
      return isOutOfHours(opts.tenantSettings, tz, opts.now);
    }
    case 'funnel_stage': {
      const stageId = trigger.trigger_value.stage_id as string | undefined;
      return stageId != null && opts.contactStageId === stageId;
    }
    case 'no_agent_reply':
      // Not evaluated on inbound messages — needs a scheduler.
      return false;
    default:
      return false;
  }
}

/**
 * `no_agent_reply` evaluation for use by a cron/job scheduler.
 *
 * Call this function when scanning for conversations that have been waiting
 * for an agent reply beyond the configured threshold. The function is kept
 * here so the engine owns the logic; wiring it to a scheduler is out of
 * scope and must be done separately (e.g., a pg_cron job or a job-worker
 * invocation every N minutes).
 *
 * @param lastHumanReplyAt  Timestamp of the last human-agent outbound message
 *                          (null if no human has replied yet).
 * @param triggerMinutes    Threshold in minutes (from trigger_value.minutes).
 * @param now               Current time (defaults to Date.now()).
 * @returns true if the no-reply window has elapsed.
 */
export function evaluateNoAgentReply(
  lastHumanReplyAt: Date | null,
  triggerMinutes: number,
  now?: Date,
): boolean {
  const reference = now ?? new Date();
  if (lastHumanReplyAt === null) return false;
  const elapsedMs = reference.getTime() - lastHumanReplyAt.getTime();
  return elapsedMs >= triggerMinutes * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Core engine types
// ---------------------------------------------------------------------------

export interface EngineInput {
  tenant_id: string;
  whatsapp_instance_id: string;
  contact_id: string;
  phone: string;
  /** Plain-text content of the inbound message. */
  message: string;
}

export interface EngineContext {
  supabase: SupabaseClientLike;
  logger: LoggerLike;
  /** Resolved whatsapp_instance row (id, provider, connection_config, ...). */
  instance: WhatsAppInstanceLike;
}

// Lightweight structural types to avoid importing the full supabase-js/logger modules here.
export interface SupabaseClientLike {
  from(table: string): QueryBuilder;
  rpc(fn: string, args?: Record<string, unknown>): QueryBuilder;
}

export interface QueryBuilder {
  select(cols?: string): this;
  insert(data: Record<string, unknown>): this;
  update(data: Record<string, unknown>): this;
  eq(col: string, val: unknown): this;
  neq(col: string, val: unknown): this;
  is(col: string, val: unknown): this;
  in(col: string, vals: unknown[]): this;
  single(): Promise<{ data: unknown; error: unknown }>;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  limit(n: number): this;
  order(col: string, opts?: { ascending?: boolean }): this;
  returns?(): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<T = unknown>(onfulfilled: (value: { data: T; error: unknown }) => unknown): Promise<unknown>;
}

export interface WhatsAppInstanceLike {
  id: string;
  tenant_id: string;
  instance_key: string;
  provider?: string | null;
  connection_config?: Record<string, unknown> | null;
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
}

export interface LoggerLike {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Max steps guard
// ---------------------------------------------------------------------------

const MAX_STEPS_PER_INVOCATION = 50;

// ---------------------------------------------------------------------------
// Main engine entry point
// ---------------------------------------------------------------------------

/**
 * Process a single inbound message through the chatbot flow engine.
 *
 * Returns a structured result for logging / debugging purposes.
 * Errors are caught per-section and logged; partial progress is committed.
 */
export async function processChatbotMessage(
  input: EngineInput,
  ctx: EngineContext,
): Promise<{ acted: boolean; reason: string }> {
  const { supabase, logger, instance } = ctx;
  const { tenant_id, whatsapp_instance_id, contact_id, phone, message } = input;

  // ------------------------------------------------------------------
  // 1. Look for an existing active session
  // ------------------------------------------------------------------
  const { data: session, error: sessionErr } = await (supabase
    .from('chatbot_sessions')
    .select('*')
    .eq('contact_id', contact_id)
    .eq('whatsapp_instance_id', whatsapp_instance_id)
    .eq('status', 'active')
    .maybeSingle() as Promise<{ data: ChatbotSession | null; error: unknown }>);

  if (sessionErr) {
    logger.warn('Failed to look up active session', { error: String(sessionErr) });
  }

  if (session) {
    logger.info('Active session found, routing reply', { sessionId: session.id });
    await handleSessionReply(session, message, input, ctx);
    return { acted: true, reason: 'existing_session' };
  }

  // ------------------------------------------------------------------
  // 2. No active session — find a matching chatbot trigger
  // ------------------------------------------------------------------
  const { data: chatbots, error: botsErr } = await (supabase
    .from('chatbots')
    .select('id, tenant_id, whatsapp_instance_id, is_active, is_published, builder_version, priority')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .eq('is_published', true)
    .eq('builder_version', 2) as Promise<{ data: ChatbotRow[] | null; error: unknown }>);

  if (botsErr || !chatbots?.length) {
    logger.info('No active v2 chatbots for tenant', { tenant_id });
    return { acted: false, reason: 'no_v2_chatbots' };
  }

  // Filter by instance scope: null = all, or matching instance id.
  const scopedBots = chatbots.filter(
    (b) => b.whatsapp_instance_id === null || b.whatsapp_instance_id === whatsapp_instance_id,
  );

  if (!scopedBots.length) {
    return { acted: false, reason: 'no_scoped_chatbots' };
  }

  // Fetch tenant settings for business-hours evaluation.
  const { data: tenantRow } = await (supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenant_id)
    .maybeSingle() as Promise<{ data: { settings: Record<string, unknown> } | null; error: unknown }>);
  const tenantSettings = tenantRow?.settings ?? null;

  // Count prior inbound messages to detect first_contact trigger.
  const { data: msgCountRow } = await (supabase
    .from('messages')
    .select('id')
    .eq('contact_id', contact_id)
    .eq('tenant_id', tenant_id)
    .eq('direction', 'inbound')
    .limit(2) as Promise<{ data: { id: string }[] | null; error: unknown }>);
  // If msgCountRow has 2+ rows the current message was already persisted, so
  // priorInboundCount >= 1 means it's not first contact.
  const priorInboundCount = Math.max(0, (msgCountRow?.length ?? 0) - 1);

  // Fetch current contact stage for funnel_stage trigger.
  const { data: contactRow } = await (supabase
    .from('contacts')
    .select('current_stage_id')
    .eq('id', contact_id)
    .maybeSingle() as Promise<{ data: { current_stage_id: string | null } | null; error: unknown }>);
  const contactStageId = contactRow?.current_stage_id ?? null;

  // Evaluate triggers for each candidate chatbot (highest priority first).
  const sortedBots = [...scopedBots].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  let matchedBot: ChatbotRow | null = null;
  let matchedTrigger: TriggerRow | null = null;

  for (const bot of sortedBots) {
    const { data: triggers } = await (supabase
      .from('chatbot_triggers')
      .select('*')
      .eq('chatbot_id', bot.id)
      .eq('is_active', true) as Promise<{ data: TriggerRow[] | null; error: unknown }>);

    if (!triggers?.length) continue;

    for (const trigger of triggers) {
      const fired = evaluateTrigger(trigger, {
        message,
        contactId: contact_id,
        contactStageId,
        priorInboundCount,
        tenantSettings,
      });
      if (fired) {
        matchedBot = bot;
        matchedTrigger = trigger;
        break;
      }
    }
    if (matchedBot) break;
  }

  if (!matchedBot) {
    return { acted: false, reason: 'no_trigger_matched' };
  }

  logger.info('Trigger matched, starting new session', {
    chatbotId: matchedBot.id,
    triggerType: matchedTrigger?.trigger_type,
  });

  await startNewSession(matchedBot, input, tenantSettings, ctx);
  return { acted: true, reason: `trigger:${matchedTrigger?.trigger_type}` };
}

// ---------------------------------------------------------------------------
// Start a new session
// ---------------------------------------------------------------------------

async function startNewSession(
  bot: ChatbotRow,
  input: EngineInput,
  tenantSettings: Record<string, unknown> | null,
  ctx: EngineContext,
): Promise<void> {
  const { supabase, logger } = ctx;
  const { contact_id, whatsapp_instance_id, tenant_id, message } = input;

  // Find start node.
  const { data: startNode } = await (supabase
    .from('chatbot_nodes')
    .select('id, chatbot_id, tenant_id, node_type, position_x, position_y, data')
    .eq('chatbot_id', bot.id)
    .eq('node_type', 'start')
    .maybeSingle() as Promise<{ data: ChatbotNode | null; error: unknown }>);

  if (!startNode) {
    logger.warn('Chatbot has no start node', { chatbotId: bot.id });
    return;
  }

  // Create session.
  const { data: newSession, error: insertErr } = await (supabase
    .from('chatbot_sessions')
    .insert({
      chatbot_id: bot.id,
      contact_id,
      tenant_id,
      whatsapp_instance_id,
      current_node_id: startNode.id,
      variables: {},
      status: 'active',
      awaiting_input: false,
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .select('*')
    .single() as Promise<{ data: ChatbotSession | null; error: unknown }>);

  if (insertErr || !newSession) {
    logger.error('Failed to create chatbot session', { error: String(insertErr) });
    return;
  }

  // Load graph and run from start node.
  await executeFlowFromNode(startNode, newSession, input, tenantSettings, ctx);
}

// ---------------------------------------------------------------------------
// Handle reply to an existing awaiting session
// ---------------------------------------------------------------------------

async function handleSessionReply(
  session: ChatbotSession,
  message: string,
  input: EngineInput,
  ctx: EngineContext,
): Promise<void> {
  const { supabase, logger } = ctx;

  if (!session.awaiting_input || !session.current_node_id) {
    // Session is active but not awaiting input — ignore stray messages.
    logger.info('Session not awaiting input; ignoring message', { sessionId: session.id });
    return;
  }

  // Load the current (waiting) node.
  const { data: currentNode } = await (supabase
    .from('chatbot_nodes')
    .select('id, chatbot_id, tenant_id, node_type, position_x, position_y, data')
    .eq('id', session.current_node_id)
    .maybeSingle() as Promise<{ data: ChatbotNode | null; error: unknown }>);

  if (!currentNode) {
    logger.warn('Current node not found; abandoning session', { nodeId: session.current_node_id });
    await updateSession(supabase, session.id, { status: 'abandoned', ended_at: new Date().toISOString() });
    return;
  }

  // Fetch graph (needed to advance after validation).
  const { data: edges } = await (supabase
    .from('chatbot_edges')
    .select('id, chatbot_id, source_node_id, target_node_id, source_handle')
    .eq('chatbot_id', session.chatbot_id) as Promise<{ data: ChatbotEdge[] | null; error: unknown }>);

  const allEdges = edges ?? [];

  // Fetch tenant settings for variable context.
  const { data: tenantRow } = await (supabase
    .from('tenants')
    .select('settings')
    .eq('id', session.tenant_id)
    .maybeSingle() as Promise<{ data: { settings: Record<string, unknown> } | null; error: unknown }>);
  const tenantSettings = tenantRow?.settings ?? null;

  let nextNodeId: string | null = null;
  let updatedVars = { ...session.variables };

  if (currentNode.node_type === 'ask_question') {
    const d = currentNode.data as { message?: string; save_to_variable?: string; validation?: QuestionValidation };
    const validation: QuestionValidation = d.validation ?? 'none';
    const isValid = validateAnswer(validation, message);

    if (!isValid) {
      // Re-send the question with a short retry hint.
      await sendBotMessage(
        `${d.message ?? ''}\n\n_(Resposta inválida, tente novamente.)_`,
        input,
        ctx,
      );
      return; // Stay on same node.
    }

    // Save answer to variable.
    if (d.save_to_variable) {
      updatedVars[d.save_to_variable] = message.trim();
    }

    nextNodeId = resolveNextNodeId(allEdges, currentNode.id, DEFAULT_HANDLE);
  } else if (currentNode.node_type === 'show_options') {
    const d = currentNode.data as { message?: string; options?: ShowOptionsOption[] };
    const options = d.options ?? [];
    const matched = matchOption(message, options);

    if (!matched) {
      // Re-send the menu.
      await sendBotMessage(buildOptionsText(d.message ?? '', options), input, ctx);
      return;
    }

    nextNodeId = resolveNextNodeId(allEdges, currentNode.id, matched.id);
  } else {
    logger.warn('Session awaiting input on non-input node type', {
      nodeType: currentNode.node_type,
      sessionId: session.id,
    });
    nextNodeId = resolveNextNodeId(allEdges, currentNode.id, DEFAULT_HANDLE);
  }

  // Persist variable updates and clear awaiting_input.
  await updateSession(supabase, session.id, {
    variables: updatedVars,
    awaiting_input: false,
    current_node_id: nextNodeId ?? session.current_node_id,
    last_activity_at: new Date().toISOString(),
  });

  if (!nextNodeId) {
    await updateSession(supabase, session.id, { status: 'completed', ended_at: new Date().toISOString() });
    return;
  }

  // Continue execution from the next node.
  const updatedSession: ChatbotSession = {
    ...session,
    current_node_id: nextNodeId,
    variables: updatedVars,
    awaiting_input: false,
  };

  await continueFlow(updatedSession, nextNodeId, input, tenantSettings, ctx);
}

// ---------------------------------------------------------------------------
// Flow execution helpers
// ---------------------------------------------------------------------------

async function executeFlowFromNode(
  startNode: ChatbotNode,
  session: ChatbotSession,
  input: EngineInput,
  tenantSettings: Record<string, unknown> | null,
  ctx: EngineContext,
): Promise<void> {
  await continueFlow(session, startNode.id, input, tenantSettings, ctx);
}

async function continueFlow(
  session: ChatbotSession,
  fromNodeId: string,
  input: EngineInput,
  tenantSettings: Record<string, unknown> | null,
  ctx: EngineContext,
): Promise<void> {
  const { supabase, logger } = ctx;

  // Load entire graph for the chatbot.
  const { data: nodes } = await (supabase
    .from('chatbot_nodes')
    .select('id, chatbot_id, tenant_id, node_type, position_x, position_y, data')
    .eq('chatbot_id', session.chatbot_id) as Promise<{ data: ChatbotNode[] | null; error: unknown }>);

  const { data: edges } = await (supabase
    .from('chatbot_edges')
    .select('id, chatbot_id, source_node_id, target_node_id, source_handle')
    .eq('chatbot_id', session.chatbot_id) as Promise<{ data: ChatbotEdge[] | null; error: unknown }>);

  const nodeMap = new Map<string, ChatbotNode>(
    (nodes ?? []).map((n) => [n.id, n]),
  );
  const allEdges = edges ?? [];

  let currentNodeId: string | null = fromNodeId;
  let currentVars: Record<string, string> = { ...session.variables };
  let stepCount = 0;

  // Build initial contact info for variable context.
  const { data: contactRow } = await (supabase
    .from('contacts')
    .select('name')
    .eq('id', input.contact_id)
    .maybeSingle() as Promise<{ data: { name: string | null } | null; error: unknown }>);
  const contactName = contactRow?.name ?? null;

  while (currentNodeId && stepCount < MAX_STEPS_PER_INVOCATION) {
    stepCount++;

    const node = nodeMap.get(currentNodeId);
    if (!node) {
      logger.warn('Node not found during flow execution', { nodeId: currentNodeId });
      break;
    }

    logger.info('Executing node', { nodeId: node.id, type: node.node_type, step: stepCount });

    // Build substitution context with up-to-date vars.
    const varCtx = buildVariableContext({
      contactName,
      phone: input.phone,
      incomingMessage: input.message,
      sessionVariables: currentVars,
    });

    const result = await executeNode(node, varCtx, currentVars, input, session, allEdges, ctx);

    if (result.updatedVars) {
      currentVars = result.updatedVars;
    }

    // Persist state after each node.
    await updateSession(supabase, session.id, {
      current_node_id: currentNodeId,
      variables: currentVars,
      awaiting_input: result.awaiting ?? false,
      last_activity_at: new Date().toISOString(),
      ...(result.status ? { status: result.status } : {}),
      ...(result.status && result.status !== 'active' ? { ended_at: new Date().toISOString() } : {}),
    });

    if (result.awaiting) {
      logger.info('Flow paused awaiting input', { sessionId: session.id, nodeId: currentNodeId });
      return;
    }

    if (result.status && result.status !== 'active') {
      logger.info('Flow ended', { sessionId: session.id, status: result.status });
      return;
    }

    currentNodeId = result.nextNodeId ?? null;

    if (!currentNodeId) {
      // Ran off the end of the graph — complete gracefully.
      await updateSession(supabase, session.id, {
        status: 'completed',
        ended_at: new Date().toISOString(),
      });
      return;
    }
  }

  if (stepCount >= MAX_STEPS_PER_INVOCATION) {
    logger.warn('Max node steps reached; aborting flow to prevent infinite loop', {
      sessionId: session.id,
      steps: stepCount,
    });
    await updateSession(supabase, session.id, {
      status: 'abandoned',
      ended_at: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Single-node execution
// ---------------------------------------------------------------------------

interface NodeResult {
  nextNodeId?: string | null;
  awaiting?: boolean;
  status?: ChatbotSessionStatus;
  updatedVars?: Record<string, string>;
}

async function executeNode(
  node: ChatbotNode,
  varCtx: VariableContext,
  currentVars: Record<string, string>,
  input: EngineInput,
  session: ChatbotSession,
  edges: ChatbotEdge[],
  ctx: EngineContext,
): Promise<NodeResult> {
  const { supabase, logger } = ctx;

  switch (node.node_type) {
    // ------------------------------------------------------------------
    case 'start': {
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'send_text': {
      const d = node.data as { message?: string; delay_seconds?: number };
      const text = substituteVariables(d.message ?? '', varCtx);
      const delaySec = Math.min(d.delay_seconds ?? 0, 10); // cap at 10 seconds

      if (delaySec > 0) {
        await delay(delaySec * 1000);
      }

      await sendBotMessage(text, input, ctx);

      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'ask_question': {
      const d = node.data as { message?: string };
      const text = substituteVariables(d.message ?? '', varCtx);
      await sendBotMessage(text, input, ctx);
      return { awaiting: true, nextNodeId: null };
    }

    // ------------------------------------------------------------------
    case 'show_options': {
      const d = node.data as { message?: string; options?: ShowOptionsOption[] };
      const options = d.options ?? [];
      const text = buildOptionsText(substituteVariables(d.message ?? '', varCtx), options);
      await sendBotMessage(text, input, ctx);
      return { awaiting: true, nextNodeId: null };
    }

    // ------------------------------------------------------------------
    case 'condition': {
      const d = node.data as {
        variable?: string;
        operator?: ConditionOperator;
        value?: string;
      };
      const variableValue = d.variable ? (currentVars[d.variable] ?? null) : null;
      const result = evaluateCondition(
        d.operator ?? 'equals',
        variableValue,
        d.value,
      );
      const handle = result ? CONDITION_TRUE_HANDLE : CONDITION_FALSE_HANDLE;
      const nextNodeId = resolveNextNodeId(edges, node.id, handle);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'set_variable': {
      const d = node.data as { variable_name?: string; value?: string };
      const updatedVars = { ...currentVars };
      if (d.variable_name) {
        updatedVars[d.variable_name] = substituteVariables(d.value ?? '', varCtx);
      }
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId, updatedVars };
    }

    // ------------------------------------------------------------------
    case 'update_contact': {
      const d = node.data as { field?: UpdateContactField; value?: string };
      const rawValue = substituteVariables(d.value ?? '', varCtx);

      if (d.field === 'tag') {
        // Upsert tag by name, then link to contact.
        await upsertContactTag(supabase, input.contact_id, session.tenant_id, rawValue, logger);
      } else if (d.field && ['name', 'email', 'phone'].includes(d.field)) {
        await (supabase
          .from('contacts')
          .update({ [d.field]: rawValue, updated_at: new Date().toISOString() })
          .eq('id', input.contact_id) as unknown as Promise<void>);
      }

      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'move_funnel': {
      const d = node.data as { stage_id?: string };
      if (d.stage_id) {
        await (supabase
          .from('contacts')
          .update({
            current_stage_id: d.stage_id,
            stage_entered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.contact_id) as unknown as Promise<void>);
      }
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }

    // ------------------------------------------------------------------
    case 'transfer_agent': {
      const d = node.data as {
        message?: string;
        assign_to?: string;
        user_id?: string | null;
      };
      if (d.message) {
        const text = substituteVariables(d.message, varCtx);
        await sendBotMessage(text, input, ctx);
      }

      // Notify available agents by creating a notification row.
      await createTransferNotification(supabase, input, session, d, logger);

      return { status: 'transferred' };
    }

    // ------------------------------------------------------------------
    case 'end_flow': {
      const d = node.data as { message?: string; silent?: boolean };
      if (!d.silent && d.message) {
        const text = substituteVariables(d.message, varCtx);
        await sendBotMessage(text, input, ctx);
      }
      return { status: 'completed' };
    }

    // ------------------------------------------------------------------
    default: {
      logger.warn('Unknown node type encountered during execution', { type: node.node_type });
      const nextNodeId = resolveNextNodeId(edges, node.id, DEFAULT_HANDLE);
      return { nextNodeId };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOptionsText(prompt: string, options: ShowOptionsOption[]): string {
  const lines = options.map((o, i) => `${i + 1}) ${o.label}`);
  return `${prompt}\n\n${lines.join('\n')}`;
}

async function sendBotMessage(
  text: string,
  input: EngineInput,
  ctx: EngineContext,
): Promise<void> {
  const { supabase, logger, instance } = ctx;

  if (!text.trim()) return;

  try {
    // Import provider factory dynamically to keep this file importable in test
    // environments without Deno network access.
    // NOTE: use the shared _shared/provider-factory.ts (async) — for the Meta
    // ('official') provider it resolves the access token from Vault via the
    // get_instance_meta_token RPC. The token is NOT in connection_config.
    const { ProviderFactory } = await import('./provider-factory.ts');
    const provider = await ProviderFactory.getProvider(instance, supabase as unknown as Parameters<typeof ProviderFactory.getProvider>[1]);
    await provider.sendMessage(input.phone, text);
  } catch (err) {
    logger.error('Failed to send bot message via provider', {
      error: String(err),
      phone: input.phone,
    });
    // Do not rethrow — a send failure should not abort the entire flow.
  }

  // Persist outbound bot message row.
  try {
    await (supabase
      .from('messages')
      .insert({
        contact_id: input.contact_id,
        tenant_id: input.tenant_id,
        whatsapp_instance_id: input.whatsapp_instance_id,
        direction: 'outbound',
        message_type: 'text',
        content: text,
        status: 'sent',
        is_from_bot: true,
      }) as unknown as Promise<void>);
  } catch (err) {
    logger.warn('Failed to persist outbound bot message row', { error: String(err) });
  }
}

async function updateSession(
  supabase: SupabaseClientLike,
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await (supabase
    .from('chatbot_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', sessionId) as unknown as Promise<void>);
}

async function upsertContactTag(
  supabase: SupabaseClientLike,
  contactId: string,
  tenantId: string,
  tagName: string,
  logger: LoggerLike,
): Promise<void> {
  if (!tagName.trim()) return;

  try {
    // Find or create tag by name (unique per tenant).
    let { data: tag } = await (supabase
      .from('tags')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', tagName.trim())
      .maybeSingle() as Promise<{ data: { id: string } | null; error: unknown }>);

    if (!tag) {
      const { data: newTag } = await (supabase
        .from('tags')
        .insert({ tenant_id: tenantId, name: tagName.trim() })
        .select('id')
        .single() as Promise<{ data: { id: string } | null; error: unknown }>);
      tag = newTag;
    }

    if (!tag) return;

    // Insert contact_tag (ignore conflict — PK is (contact_id, tag_id)).
    await (supabase
      .from('contact_tags')
      .insert({ contact_id: contactId, tag_id: tag.id }) as unknown as Promise<void>);
  } catch (err) {
    logger.warn('Failed to upsert contact tag', { error: String(err), tagName });
  }
}

async function createTransferNotification(
  supabase: SupabaseClientLike,
  input: EngineInput,
  session: ChatbotSession,
  transferData: { assign_to?: string; user_id?: string | null },
  logger: LoggerLike,
): Promise<void> {
  try {
    // The notifications table is keyed by user_id (auth.users).
    // When assign_to = 'specific_user' and user_id is set, notify that user.
    // When assign_to = 'any', we cannot determine auth.uid() server-side without
    // knowing which agents are online; insert one notification targeting the
    // specific user if provided, otherwise skip — agents see new conversations
    // via the conversations feed.
    if (transferData.assign_to === 'specific_user' && transferData.user_id) {
      await (supabase
        .from('notifications')
        .insert({
          user_id: transferData.user_id,
          title: 'Conversa transferida',
          message: `Uma conversa foi transferida para você (contato: ${input.phone}).`,
          type: 'info',
          action_url: `/dashboard/conversations?contact=${input.contact_id}`,
          action_label: 'Ver conversa',
          metadata: {
            session_id: session.id,
            contact_id: input.contact_id,
            chatbot_id: session.chatbot_id,
          },
        }) as unknown as Promise<void>);
    }
  } catch (err) {
    logger.warn('Failed to create transfer notification', { error: String(err) });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
