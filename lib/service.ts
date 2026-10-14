import { randomBytes } from 'node:crypto';
import { registerPayToken } from './accounts';
import { aiEnabled, classifyReply, generateTemplateSet, personalizeMessage } from './ai';
import { parseInvoiceCsv, type ParsedRow } from './csv';
import { all, get, run, tx } from './db';
import { formatDateLong, money, plural } from './format';
import { suggestedTone, summarize, trackRecord, type TrackRecord } from './history';
import { sendEmail, type SendResult } from './providers';
import { resendConfigured } from './providers/email';
import {
  builtinSet,
  findCustomer,
  getCase,
  getCustomer,
  getInvoice,
  getMessage,
  getOpenCase,
  getTemplateSet,
  lastActivity,
  listCustomerInvoices,
  listCustomerMessages,
  listCustomers,
  listInstallments,
  listOpenCases,
  logEvent,
  openInvoices,
  readyMessageForCase,
  sentKeys,
  setCaseStatus,
  updateCase,
  updateCustomer,
  updateInvoice,
  updateMessage,
  type TemplateSet,
} from './repo';
import {
  INSTALLMENT_INTERVAL_DAYS,
  PLAN_OFFER_STEP,
  STEPS,
  allocatePayment,
  availableChannels,
  pickChannel,
  planActions,
  splitInstallments,
  type Action,
  type NextAction,
  type TemplateKey,
} from './sequence';
import { getClockOffset, getNow, getSettings, setClockOffset, type Settings } from './settings';
import { firstName, renderTemplate, templateVars } from './templates';
import { currentTenant } from './tenant';
import { DAY, daysOverdue, localDate, monthKey, nextSmsWindow } from './time';
import type { TemplateSetContent } from './tones';
import type { Case, CaseStatus, Channel, Customer, Invoice, Message, ReplyKind } from './types';

const token = () => randomBytes(24).toString('base64url');

/** Open invoices in a case: what reminders cover and the pay page collects. */
export function caseInvoices(customerId: number, caseId: number): Invoice[] {
  return openInvoices(customerId).filter((i) => i.caseId === caseId);
}
const today = (now: number) => localDate(now, getSettings().timezone);
const owed = (i: Invoice) => i.amountCents - i.amountPaidCents;

// =================================================================== import

export interface PreviewRow extends ParsedRow {
  duplicate: boolean;
  existingCustomer: boolean;
}

export function previewImport(text: string, now = getNow()) {
  const { timezone } = getSettings();
  const { rows, missingColumns, hasHistory } = parseInvoiceCsv(text, { now, timeZone: timezone });
  const existing = new Set(all<{ n: string }>('SELECT lower(number) AS n FROM invoices').map((r) => r.n));
  const preview: PreviewRow[] = rows.map((r) => ({
    ...r,
    duplicate: Boolean(r.invoice && existing.has(r.invoice.invoiceNumber.toLowerCase())),
    existingCustomer: Boolean(r.invoice && findCustomer({ name: r.invoice.customerName, email: r.invoice.email, phone: r.invoice.phone })),
  }));
  const ready = preview.filter((r) => r.invoice && !r.duplicate);
  const t = today(now);
  const openReady = ready.filter((r) => !r.invoice!.paid);
  return {
    missingColumns,
    hasHistory,
    rows: preview,
    summary: {
      total: preview.length,
      ready: ready.length,
      duplicates: preview.filter((r) => r.duplicate).length,
      errors: preview.filter((r) => !r.invoice).length,
      customers: new Set(ready.map((r) => r.invoice!.customerName.toLowerCase())).size,
      paidCount: ready.length - openReady.length,
      overdueCount: openReady.filter((r) => r.invoice!.dueDate < t).length,
      overdueCents: openReady.filter((r) => r.invoice!.dueDate < t).reduce((s, r) => s + r.invoice!.amountCents, 0),
    },
  };
}

export async function importCsv(text: string, now = getNow()) {
  const preview = previewImport(text, now);
  if (preview.missingColumns.length) return { imported: 0, customers: 0, skipped: [], missingColumns: preview.missingColumns };

  const skipped: { line: number; reason: string }[] = [];
  const touched = new Set<number>();
  const imported = tx(() => {
    let count = 0;
    for (const row of preview.rows) {
      const inv = row.invoice;
      if (!inv) {
        skipped.push({ line: row.line, reason: row.errors.join('; ') });
        continue;
      }
      if (row.duplicate) {
        skipped.push({ line: row.line, reason: `Invoice #${inv.invoiceNumber} was already imported` });
        continue;
      }
      let customer = findCustomer({ name: inv.customerName, email: inv.email, phone: inv.phone });
      if (!customer) {
        const payToken = token();
        const id = run(
          `INSERT INTO customers (name, type, contact_name, email, phone, preferred_channel, tags, pay_token, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          inv.customerName,
          inv.customerType ?? 'individual',
          inv.contactName,
          inv.email,
          inv.phone,
          inv.email ? 'email' : 'sms',
          JSON.stringify(inv.tags),
          payToken,
          now,
        ).id;
        registerPayToken(payToken, currentTenant().businessId);
        customer = getCustomer(id)!;
        logEvent(id, null, 'customer_added', 'Added from an import', now);
      } else {
        // Fill in anything we didn't know before; never overwrite what the owner set.
        const fill: Record<string, string | null> = {};
        if (!customer.email && inv.email) fill.email = inv.email;
        if (!customer.phone && inv.phone) fill.phone = inv.phone;
        if (!customer.contactName && inv.contactName) fill.contact_name = inv.contactName;
        if (inv.tags.length) fill.tags = JSON.stringify([...new Set([...customer.tags, ...inv.tags])]);
        updateCustomer(customer.id, fill);
      }
      run(
        `INSERT INTO invoices (customer_id, number, description, amount_cents, amount_paid_cents, issued_date, due_date, status, paid_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        customer.id,
        inv.invoiceNumber,
        inv.description,
        inv.amountCents,
        inv.paid ? inv.amountCents : 0,
        inv.issuedDate,
        inv.dueDate,
        inv.paid ? 'paid' : 'open',
        inv.paidDate,
        now,
        now,
      );
      touched.add(customer.id);
      count++;
    }
    return count;
  });
  await runDueActions(now);
  return { imported, customers: touched.size, skipped, missingColumns: [] as string[] };
}

// =================================================================== tone

export interface ToneChoice {
  set: TemplateSet;
  /** Chosen automatically from the customer's history. */
  auto: boolean;
}

export function toneFor(customer: Customer, record?: TrackRecord): ToneChoice {
  if (customer.templateSetId) {
    const set = getTemplateSet(customer.templateSetId);
    if (set) return { set, auto: false };
  }
  const { defaultTemplateSet } = getSettings();
  if (typeof defaultTemplateSet === 'number') {
    const set = getTemplateSet(defaultTemplateSet);
    if (set) return { set, auto: false };
  }
  const rec = record ?? trackRecord(listCustomerInvoices(customer.id));
  return { set: builtinSet(suggestedTone(rec.reliability)), auto: true };
}

// =================================================================== runner

export interface RunResult {
  checked: number;
  prepared: number;
  sent: number;
  failed: number;
}

/** Whether this business can really send on a channel. Texts are always prepared for the business's own phone; demo workspaces never send. */
function providerFor(channel: Channel): boolean {
  if (currentTenant().demo) return false;
  return channel === 'email' && resendConfigured();
}

function autoSends(channel: Channel, settings: Settings): boolean {
  return settings.deliveryMode === 'auto' && providerFor(channel);
}

async function deliver(message: { channel: Channel; toAddr: string | null; subject: string | null; body: string }, settings: Settings): Promise<SendResult> {
  if (message.channel === 'sms') throw new Error('Texts are sent from the business’s own phone');
  return sendEmail({
    to: message.toAddr!,
    subject: message.subject ?? `Message from ${settings.businessName}`,
    text: message.body,
    fromName: settings.businessName,
    replyTo: settings.replyToEmail || undefined,
  });
}

function stepLabel(m: Pick<Message, 'step' | 'actionKey'>): string {
  if (m.step) return STEPS.find((s) => s.step === m.step)?.label ?? 'Reminder';
  if (m.actionKey?.startsWith('installment')) return 'Payment plan reminder';
  if (m.actionKey?.startsWith('reply-plan')) return 'Payment plan offer';
  return 'Message';
}

/** Render one template for a customer's current balance. */
function renderFor(
  customer: Customer,
  c: Case,
  templateKey: TemplateKey,
  channel: Channel,
  set: TemplateSetContent,
  now: number,
  installmentId?: number,
) {
  const settings = getSettings();
  // Only what's being chased: invoices that aren't due yet stay out of reminders.
  const invoices = caseInvoices(customer.id, c.id).map((i) => ({ number: i.number, owedCents: owed(i), dueDate: i.dueDate }));
  const installment = installmentId ? listInstallments(c.id).find((i) => i.id === installmentId) : undefined;
  const vars = templateVars({
    customer,
    invoices,
    businessName: settings.businessName,
    senderName: settings.senderName,
    timeZone: settings.timezone,
    now,
    installment,
  });
  const t = set[templateKey];
  return {
    subject: channel === 'email' ? renderTemplate(t.subject, vars) : null,
    body: renderTemplate(channel === 'email' ? t.email : t.sms, vars),
  };
}

async function prepare(customer: Customer, c: Case, action: Action, now: number) {
  const settings = getSettings();
  const tone = toneFor(customer);
  const { subject, body } = renderFor(customer, c, action.templateKey, action.channel, tone.set.templates, now, action.installmentId);
  const to = action.channel === 'email' ? customer.email : customer.phone;

  // Claim the step first. The unique index makes a repeated or concurrent run a no-op.
  const claim = run(
    `INSERT OR IGNORE INTO messages (customer_id, case_id, channel, direction, action_key, step, tone, to_addr, subject, body, status, created_at)
     VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, 'ready', ?)`,
    customer.id,
    c.id,
    action.channel,
    action.key,
    action.step ?? null,
    tone.set.name,
    to,
    subject,
    body,
    now,
  );
  if (claim.changes === 0) return null;
  if (action.step) run('UPDATE cases SET current_step = MAX(current_step, ?), updated_at = ? WHERE id = ?', action.step, now, c.id);

  const label = stepLabel({ step: action.step ?? null, actionKey: action.key });
  const via = action.channel === 'email' ? 'email' : 'text';
  if (!autoSends(action.channel, settings)) {
    logEvent(customer.id, c.id, 'prepared', `${label} ready to send by ${via}`, now);
    return 'prepared' as const;
  }
  const result = await deliver({ channel: action.channel, toAddr: to, subject, body }, settings);
  if (result.status === 'failed') {
    updateMessage(claim.id, { status: 'failed', provider: result.provider, error: result.error ?? 'Unknown error' });
    logEvent(customer.id, c.id, 'send_failed', `${label} by ${via} failed: ${result.error}`, now);
    return 'failed' as const;
  }
  updateMessage(claim.id, { status: 'sent', provider: result.provider, sent_at: now });
  updateCase(c.id, { last_sent_at: now }, now);
  return 'sent' as const;
}

/** Open a case for anyone with overdue invoices, and fold new overdue invoices into open cases. */
function openCases(now: number) {
  const t = today(now);
  const overdue = all<{ customerId: number; id: number; number: string; caseId: number | null }>(
    `SELECT i.customer_id AS customerId, i.id, i.number, i.case_id AS caseId FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.status = 'open' AND i.amount_cents > i.amount_paid_cents AND i.due_date < ? AND c.do_not_chase = 0
     ORDER BY i.due_date`,
    t,
  );
  for (const inv of overdue) {
    let c = getOpenCase(inv.customerId);
    if (!c) {
      const id = run(
        `INSERT INTO cases (customer_id, status, started_at, created_at, updated_at) VALUES (?, 'active', ?, ?, ?)`,
        inv.customerId,
        now,
        now,
        now,
      ).id;
      c = getCase(id)!;
      logEvent(inv.customerId, id, 'case_opened', 'Reminders started', now);
    }
    if (inv.caseId !== c.id) {
      run('UPDATE invoices SET case_id = ? WHERE id = ?', c.id, inv.id);
      if (c.startedAt !== now) logEvent(inv.customerId, c.id, 'invoice_added', `Invoice #${inv.number} is overdue and joins the reminders`, now);
    }
  }
}

/** Prepare (or send) everything that's due. Safe to call as often as you like. */
export async function runDueActions(now = getNow()): Promise<RunResult> {
  const settings = getSettings();
  const result: RunResult = { checked: 0, prepared: 0, sent: 0, failed: 0 };
  openCases(now);

  for (const c of listOpenCases()) {
    result.checked++;
    const customer = getCustomer(c.customerId)!;
    // A case closes when its own overdue invoices are settled, even if newer ones aren't due yet.
    if (caseInvoices(customer.id, c.id).length === 0) {
      setCaseStatus(c.id, 'resolved', now, { resolved_at: now, needs_attention: 0 });
      logEvent(customer.id, c.id, 'resolved', 'Nothing left to collect. Reminders stopped.', now);
      continue;
    }
    if (c.status === 'promised' && c.promiseDate && today(now) > c.promiseDate) {
      setCaseStatus(c.id, 'active', now, { promise_date: null, needs_attention: 1, attention_reason: 'The promised date passed without payment' });
      logEvent(customer.id, c.id, 'promise_missed', `Promised date (${formatDateLong(c.promiseDate)}) passed. Reminders resumed.`, now);
      c.status = 'active';
    }
    if (c.status === 'active' && !pickChannel(customer)) {
      setCaseStatus(c.id, 'unreachable', now);
      logEvent(customer.id, c.id, 'unreachable', 'No email or phone to reach them. Reminders stopped.', now);
      continue;
    }
    const plan = planActions({
      status: c.status,
      startedAt: c.startedAt,
      currentStep: c.currentStep,
      lastSentAt: c.lastSentAt,
      pendingReady: Boolean(readyMessageForCase(c.id)),
      customer,
      sentKeys: sentKeys(c.id),
      installments: listInstallments(c.id),
      now,
      timeZone: settings.timezone,
      autoSms: autoSends('sms', settings),
    });
    for (const action of plan.actions) {
      const r = await prepare(customer, c, action, now);
      if (r === 'prepared') result.prepared++;
      if (r === 'sent') result.sent++;
      if (r === 'failed') result.failed++;
    }
  }
  return result;
}

export function nextFor(customer: Customer, c: Case | undefined, now = getNow()): NextAction | null {
  if (!c) return null;
  return planActions({
    status: c.status,
    startedAt: c.startedAt,
    currentStep: c.currentStep,
    lastSentAt: c.lastSentAt,
    pendingReady: Boolean(readyMessageForCase(c.id)),
    customer,
    sentKeys: sentKeys(c.id),
    installments: listInstallments(c.id),
    now,
    timeZone: getSettings().timezone,
    autoSms: autoSends('sms', getSettings()),
  }).next;
}

// =================================================================== drafts

export function markSent(messageId: number, now = getNow()) {
  const m = getMessage(messageId);
  if (!m || m.status !== 'ready') return;
  updateMessage(m.id, { status: 'sent', sent_at: now, provider: 'manual' });
  if (m.caseId) updateCase(m.caseId, { last_sent_at: now }, now);
  logEvent(m.customerId, m.caseId, 'sent', `You sent the ${stepLabel(m).toLowerCase()} by ${m.channel === 'email' ? 'email' : 'text'}`, now);
}

export function markAllSent(now = getNow()) {
  const ready = all<{ id: number }>("SELECT id FROM messages WHERE status = 'ready' ORDER BY id");
  for (const r of ready) markSent(r.id, now);
  return ready.length;
}

export function skipMessage(messageId: number, now = getNow()) {
  const m = getMessage(messageId);
  if (!m || m.status !== 'ready') return;
  updateMessage(m.id, { status: 'skipped' });
  logEvent(m.customerId, m.caseId, 'skipped', `You skipped the ${stepLabel(m).toLowerCase()}`, now);
}

export function saveDraft(messageId: number, subject: string | null, body: string) {
  const m = getMessage(messageId);
  if (!m || m.status !== 'ready' || !body.trim()) return;
  updateMessage(m.id, { subject: m.channel === 'email' ? (subject ?? '').trim() : null, body: body.trim() });
}

/** Send a prepared draft through the connected provider. */
export async function sendDraftNow(messageId: number, now = getNow()) {
  const m = getMessage(messageId);
  if (!m || m.status !== 'ready') return;
  const channel = m.channel as Channel; // drafts are only ever email or text
  if (!providerFor(channel)) throw new Error(`No ${channel === 'email' ? 'email' : 'texting'} service is connected`);
  const result = await deliver({ ...m, channel }, getSettings());
  if (result.status === 'failed') {
    updateMessage(m.id, { error: result.error ?? 'Unknown error' });
    throw new Error(result.error ?? 'Sending failed');
  }
  updateMessage(m.id, { status: 'sent', sent_at: now, provider: result.provider, error: null });
  if (m.caseId) updateCase(m.caseId, { last_sent_at: now }, now);
  logEvent(m.customerId, m.caseId, 'sent', `${stepLabel(m)} sent by ${m.channel === 'email' ? 'email' : 'text'}`, now);
}

/** Re-render a waiting draft, e.g. after the tone or channel changes. */
export function refreshDraft(customerId: number, now = getNow()) {
  const c = getOpenCase(customerId);
  const m = c && readyMessageForCase(c.id);
  if (!c || !m) return;
  const customer = getCustomer(customerId)!;
  const channel = pickChannel(customer) ?? (m.channel as Channel);
  const key: TemplateKey = m.step ? (String(m.step) as TemplateKey) : m.actionKey?.startsWith('installment') ? 'installment' : '4';
  const installmentId = m.actionKey?.startsWith('installment:') ? Number(m.actionKey.split(':')[1]) : undefined;
  const tone = toneFor(customer);
  const { subject, body } = renderFor(customer, c, key, channel, tone.set.templates, now, installmentId);
  updateMessage(m.id, { channel, subject, body, tone: tone.set.name, to_addr: channel === 'email' ? customer.email : customer.phone });
}

export async function personalizeDraft(messageId: number) {
  if (!aiEnabled()) throw new Error('AI features are not switched on');
  const m = getMessage(messageId);
  if (!m || m.status !== 'ready') return;
  const customer = getCustomer(m.customerId)!;
  const record = trackRecord(listCustomerInvoices(customer.id));
  const convo = listCustomerMessages(customer.id)
    .filter((x) => x.status !== 'ready' && x.status !== 'skipped')
    .slice(-6)
    .map((x) => `${x.direction === 'inbound' ? 'Customer' : 'Us'}: ${x.body.slice(0, 400)}`);
  const out = await personalizeMessage({
    channel: m.channel as Channel,
    subject: m.subject,
    body: m.body,
    tone: m.tone ?? 'friendly',
    customerSummary: summarize(record, firstName(customer)),
    recentConversation: convo,
  });
  updateMessage(m.id, { subject: m.channel === 'email' ? out.subject : null, body: out.body });
}

// =================================================================== replies

export interface ReplyInput {
  customerId: number;
  channel: Channel | 'phone';
  body: string;
  /** 'auto' asks the AI to read it (Premium). */
  kind: ReplyKind | 'auto';
  promiseDate?: string | null;
}

export async function logReply(input: ReplyInput, now = getNow()) {
  const customer = getCustomer(input.customerId);
  if (!customer) throw new Error('Unknown customer');
  let kind = input.kind;
  let promiseDate = input.promiseDate ?? null;
  let summary: string | null = null;
  if (kind === 'auto') {
    if (aiEnabled()) {
      const read = await classifyReply(input.body, today(now));
      kind = read.kind;
      promiseDate = read.promiseDate;
      summary = read.summary;
    } else {
      kind = 'other';
    }
  }
  const c = getOpenCase(customer.id);
  run(
    `INSERT INTO messages (customer_id, case_id, channel, direction, body, status, reply_kind, created_at, sent_at)
     VALUES (?, ?, ?, 'inbound', ?, 'received', ?, ?, ?)`,
    customer.id,
    c?.id ?? null,
    input.channel,
    input.body.trim(),
    kind,
    now,
    now,
  );
  await applyReply(customer, c, kind, promiseDate, summary, now);
  return { kind, promiseDate };
}

async function applyReply(customer: Customer, c: Case | undefined, kind: ReplyKind, promiseDate: string | null, summary: string | null, now: number) {
  if (kind === 'stop') {
    updateCustomer(customer.id, { opted_out_sms: 1, preferred_channel: customer.email ? 'email' : customer.preferredChannel });
    if (c) {
      const stillReachable = Boolean(customer.email);
      if (!stillReachable) setCaseStatus(c.id, 'unreachable', now);
      logEvent(customer.id, c.id, 'opted_out', stillReachable ? 'Texted STOP. No more texts; email continues.' : 'Texted STOP. No email on file, so reminders stopped.', now);
      refreshDraft(customer.id, now);
    }
    return;
  }
  if (!c) {
    logEvent(customer.id, null, 'reply', summary ?? 'Customer sent a message', now);
    return;
  }
  // Any real reply supersedes a draft that was waiting to go out.
  const draft = readyMessageForCase(c.id);
  if (draft) updateMessage(draft.id, { status: 'skipped' });

  switch (kind) {
    case 'promise': {
      const date = promiseDate && /^\d{4}-\d{2}-\d{2}$/.test(promiseDate) ? promiseDate : localDate(now + 7 * DAY, getSettings().timezone);
      setCaseStatus(c.id, 'promised', now, { promise_date: date, needs_attention: 0, attention_reason: null, paused_at: now });
      logEvent(customer.id, c.id, 'promised', `Promised to pay by ${formatDateLong(date)}. Reminders wait until then.`, now);
      break;
    }
    case 'paid':
      setCaseStatus(c.id, 'needs_you', now, { needs_attention: 1, attention_reason: 'Says they already paid. Check, then mark it paid.', paused_at: now });
      logEvent(customer.id, c.id, 'claims_paid', summary ?? 'Says they already paid', now);
      break;
    case 'dispute':
      setCaseStatus(c.id, 'disputed', now, { needs_attention: 1, attention_reason: 'Disputes the invoice', paused_at: now });
      logEvent(customer.id, c.id, 'disputed', summary ?? 'Disputes the invoice. Reminders stopped until it’s sorted.', now);
      break;
    case 'plan': {
      const channel = pickChannel(customer);
      if (channel) {
        await prepare(customer, c, { key: `reply-plan:${now}`, channel, templateKey: '4' }, now);
        setCaseStatus(c.id, 'active', now, { needs_attention: 0, attention_reason: null });
      }
      logEvent(customer.id, c.id, 'wants_plan', 'Asked about paying in parts. A plan offer is ready to send.', now);
      break;
    }
    default:
      setCaseStatus(c.id, 'needs_you', now, { needs_attention: 1, attention_reason: summary ?? 'Replied. Waiting on you.', paused_at: now });
      logEvent(customer.id, c.id, 'replied', summary ?? 'Replied. Reminders paused until you respond.', now);
  }
}

// =================================================================== payments & plans

export function recordPayment(opts: {
  customerId: number;
  amountCents: number;
  source: string;
  method?: string | null;
  invoiceId?: number | null;
  installmentId?: number | null;
  externalId?: string | null;
  now?: number;
}) {
  const now = opts.now ?? getNow();
  return tx(() => {
    const customer = getCustomer(opts.customerId);
    if (!customer) throw new Error('Customer not found');
    const c = getOpenCase(customer.id);
    const inserted = run(
      `INSERT OR IGNORE INTO payments (customer_id, case_id, installment_id, amount_cents, method, source, external_id, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      customer.id,
      c?.id ?? null,
      opts.installmentId ?? null,
      opts.amountCents,
      opts.method ?? null,
      opts.source,
      opts.externalId ?? null,
      now,
    );
    if (inserted.changes === 0) return { duplicate: true }; // webhook retry

    const pool = openInvoices(customer.id).filter((i) => !opts.invoiceId || i.id === opts.invoiceId);
    const t = today(now);
    for (const part of allocatePayment(opts.amountCents, pool.map((i) => ({ id: i.id, dueDate: i.dueDate, owedCents: owed(i) })))) {
      const inv = pool.find((i) => i.id === part.id)!;
      const paid = inv.amountPaidCents + part.cents;
      updateInvoice(inv.id, { amount_paid_cents: paid, ...(paid >= inv.amountCents ? { status: 'paid', paid_date: t } : {}) }, now);
    }
    if (opts.installmentId) run('UPDATE installments SET paid_at = ? WHERE id = ?', now, opts.installmentId);

    const via: Record<string, string> = { manual: 'recorded by you', demo: 'simulated' };
    const stillOverdue = c ? caseInvoices(customer.id, c.id).reduce((s, i) => s + owed(i), 0) : 0;
    logEvent(customer.id, c?.id ?? null, 'payment', `Paid ${money(opts.amountCents)} ${via[opts.source] ?? opts.source}${stillOverdue ? `. ${money(stillOverdue)} still overdue.` : '. All caught up.'}`, now);
    if (c && stillOverdue === 0) {
      setCaseStatus(c.id, 'resolved', now, { resolved_at: now, needs_attention: 0, attention_reason: null });
      const draft = readyMessageForCase(c.id);
      if (draft) updateMessage(draft.id, { status: 'skipped' });
    }
    return { duplicate: false };
  });
}

/** What the pay page collects: the chased invoices, or everything open if nothing is being chased. */
export function payableInvoices(customer: Customer): Invoice[] {
  const c = getOpenCase(customer.id);
  return c ? caseInvoices(customer.id, c.id) : openInvoices(customer.id);
}

export function payableCents(customer: Customer): number {
  return payableInvoices(customer).reduce((s, i) => s + owed(i), 0);
}

/** The customer pressed "I've sent payment" on their payment page. Flags it for the business to check. */
export function reportPaymentSent(customerId: number, now = getNow()) {
  const c = getOpenCase(customerId);
  if (!c || (c.needsAttention && c.attentionReason?.startsWith('Says they'))) return;
  if (c.status === 'plan') {
    updateCase(c.id, { needs_attention: 1, attention_reason: 'Says they sent a plan payment. Check, then record it.' }, now);
  } else {
    const draft = readyMessageForCase(c.id);
    if (draft) updateMessage(draft.id, { status: 'skipped' });
    setCaseStatus(c.id, 'needs_you', now, { needs_attention: 1, attention_reason: 'Says they sent payment. Check, then record it.', paused_at: now });
  }
  logEvent(customerId, c.id, 'claims_paid', 'Said on their payment page that they’ve sent payment', now);
}

export function choosePlan(customerId: number, count: number, now = getNow()) {
  if (count !== 2 && count !== 3) throw new Error('Plans are 2 or 3 payments');
  return tx(() => {
    const c = getOpenCase(customerId);
    if (!c) throw new Error('Nothing is owed');
    if (c.status === 'plan') return listInstallments(c.id);
    const balance = openInvoices(customerId).reduce((s, i) => s + owed(i), 0);
    splitInstallments(balance, count).forEach((amount, i) =>
      run('INSERT INTO installments (case_id, seq, amount_cents, due_at) VALUES (?, ?, ?, ?)', c.id, i + 1, amount, now + i * INSTALLMENT_INTERVAL_DAYS * DAY),
    );
    setCaseStatus(c.id, 'plan', now, { needs_attention: 0, attention_reason: null });
    const draft = readyMessageForCase(c.id);
    if (draft) updateMessage(draft.id, { status: 'skipped' });
    logEvent(customerId, c.id, 'plan', `Chose ${count} payments of about ${money(Math.floor(balance / count))}, every ${INSTALLMENT_INTERVAL_DAYS} days`, now);
    return listInstallments(c.id);
  });
}

// =================================================================== owner actions

export function pauseCase(customerId: number, now = getNow()) {
  const c = getOpenCase(customerId);
  if (!c || c.status !== 'active') return;
  setCaseStatus(c.id, 'paused', now, { paused_at: now });
  logEvent(customerId, c.id, 'paused', 'You paused reminders', now);
}

/** Resuming keeps the cadence: the sequence moves forward by the time spent paused. */
export async function resumeCase(customerId: number, now = getNow()) {
  const c = getOpenCase(customerId);
  if (!c || c.status === 'active' || c.status === 'plan') {
    if (c?.needsAttention) updateCase(c.id, { needs_attention: 0, attention_reason: null }, now);
    return;
  }
  const shift = c.pausedAt ? now - c.pausedAt : 0;
  setCaseStatus(c.id, 'active', now, {
    started_at: c.startedAt + shift,
    paused_at: null,
    promise_date: null,
    needs_attention: 0,
    attention_reason: null,
  });
  logEvent(customerId, c.id, 'resumed', 'You resumed reminders', now);
  await runDueActions(now);
}

export function markHandled(customerId: number, now = getNow()) {
  const c = getOpenCase(customerId);
  if (c) updateCase(c.id, { needs_attention: 0, attention_reason: null }, now);
}

export function setPromise(customerId: number, date: string, now = getNow()) {
  const c = getOpenCase(customerId);
  if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const draft = readyMessageForCase(c.id);
  if (draft) updateMessage(draft.id, { status: 'skipped' });
  setCaseStatus(c.id, 'promised', now, { promise_date: date, needs_attention: 0, attention_reason: null, paused_at: now });
  logEvent(customerId, c.id, 'promised', `Promised to pay by ${formatDateLong(date)}. Reminders wait until then.`, now);
}

export function markInvoicePaid(invoiceId: number, now = getNow()) {
  const inv = getInvoice(invoiceId);
  if (!inv || owed(inv) <= 0 || inv.status === 'paid' || inv.status === 'written_off') return;
  recordPayment({ customerId: inv.customerId, amountCents: owed(inv), source: 'manual', invoiceId, now });
}

export async function writeOffInvoice(invoiceId: number, now = getNow()) {
  const inv = getInvoice(invoiceId);
  if (!inv || inv.status === 'paid') return;
  updateInvoice(inv.id, { status: 'written_off' }, now);
  logEvent(inv.customerId, inv.caseId, 'written_off', `Wrote off invoice #${inv.number} (${money(owed(inv))})`, now);
  refreshDraft(inv.customerId, now);
  await runDueActions(now);
}

export async function setDoNotChase(customerId: number, on: boolean, now = getNow()) {
  updateCustomer(customerId, { do_not_chase: on ? 1 : 0 });
  const c = getOpenCase(customerId);
  if (on && c) {
    const draft = readyMessageForCase(c.id);
    if (draft) updateMessage(draft.id, { status: 'skipped' });
  }
  logEvent(customerId, c?.id ?? null, on ? 'not_chasing' : 'chasing', on ? 'Marked “don’t chase”. You’ll handle this one personally.' : 'Reminders allowed again', now);
  if (!on) await runDueActions(now);
}

export function setCustomerTone(customerId: number, templateSetId: number | null, now = getNow()) {
  updateCustomer(customerId, { template_set_id: templateSetId });
  refreshDraft(customerId, now);
}

export function updateCustomerDetails(
  customerId: number,
  fields: { name: string; type: string; contactName: string; email: string | null; phone: string | null; preferredChannel: Channel; tags: string[]; notes: string },
  now = getNow(),
) {
  updateCustomer(customerId, {
    name: fields.name,
    type: fields.type === 'business' ? 'business' : 'individual',
    contact_name: fields.contactName || null,
    email: fields.email,
    phone: fields.phone,
    preferred_channel: fields.preferredChannel,
    tags: JSON.stringify(fields.tags),
    notes: fields.notes || null,
  });
  refreshDraft(customerId, now);
}

// =================================================================== templates

export function createTemplateSet(name: string, description: string, content: TemplateSetContent, now = getNow()) {
  return run(
    'INSERT INTO template_sets (name, tone, description, builtin, templates, created_at) VALUES (?, ?, ?, 0, ?, ?)',
    name.trim() || 'My template',
    'custom',
    description.trim() || null,
    JSON.stringify(content),
    now,
  ).id;
}

export async function createTemplateSetWithAI(name: string, description: string) {
  const content = await generateTemplateSet(description, builtinSet('friendly').templates);
  return createTemplateSet(name, description, content);
}

export function updateTemplateSet(id: number, name: string, description: string, content: TemplateSetContent) {
  const set = getTemplateSet(id);
  if (!set || set.builtin) throw new Error('Built-in tones can’t be edited. Duplicate one first.');
  run('UPDATE template_sets SET name = ?, description = ?, templates = ? WHERE id = ?', name.trim() || set.name, description.trim() || null, JSON.stringify(content), id);
}

export function deleteTemplateSet(id: number) {
  const set = getTemplateSet(id);
  if (!set || set.builtin) return;
  run('DELETE FROM template_sets WHERE id = ?', id);
  const s = getSettings();
  if (s.defaultTemplateSet === id) run("DELETE FROM settings WHERE key = 'defaultTemplateSet'");
}

// =================================================================== views

export type CustomerState = CaseStatus | 'clear' | 'not_chasing' | 'not_due';

export interface CustomerSummary {
  customer: Customer;
  openCase: Case | undefined;
  state: CustomerState;
  owedCents: number;
  overdueCents: number;
  openCount: number;
  oldestOverdueDays: number;
  record: TrackRecord;
  summaryLine: string;
  tone: ToneChoice;
  next: NextAction | null;
  ready: Message | undefined;
  lastActivityAt: number | null;
  lastReply: string | null;
  recoveredCents: number;
}

export function summarizeCustomer(customer: Customer, now = getNow()): CustomerSummary {
  const invoices = listCustomerInvoices(customer.id);
  const t = today(now);
  const open = invoices.filter((i) => (i.status === 'open' || i.status === 'disputed') && owed(i) > 0);
  const overdue = open.filter((i) => i.dueDate < t);
  const record = trackRecord(invoices);
  const openCase = getOpenCase(customer.id);
  let state: CustomerState;
  if (customer.doNotChase && open.length) state = 'not_chasing';
  else if (openCase) state = openCase.status;
  else if (open.length) state = overdue.length ? 'active' : 'not_due';
  else state = 'clear';

  const lastReply = get<{ body: string }>(
    "SELECT body FROM messages WHERE customer_id = ? AND direction = 'inbound' ORDER BY created_at DESC, id DESC LIMIT 1",
    customer.id,
  )?.body ?? null;

  return {
    customer,
    openCase,
    state,
    owedCents: open.reduce((s, i) => s + owed(i), 0),
    overdueCents: overdue.reduce((s, i) => s + owed(i), 0),
    openCount: open.length,
    oldestOverdueDays: overdue.length ? daysOverdue(overdue.reduce((a, b) => (a.dueDate < b.dueDate ? a : b)).dueDate, now, getSettings().timezone) : 0,
    record,
    summaryLine: summarize(record, firstName(customer)),
    tone: toneFor(customer, record),
    next: nextFor(customer, openCase, now),
    ready: openCase ? readyMessageForCase(openCase.id) : undefined,
    lastActivityAt: lastActivity(customer.id),
    lastReply,
    recoveredCents:
      get<{ s: number | null }>('SELECT SUM(amount_cents) AS s FROM payments WHERE customer_id = ? AND case_id IS NOT NULL', customer.id)?.s ?? 0,
  };
}

export function allCustomerSummaries(now = getNow()): CustomerSummary[] {
  return listCustomers().map((c) => summarizeCustomer(c, now));
}

export const AGE_BUCKETS = [
  { key: '0-30', label: '1–30 days', min: 1, max: 30 },
  { key: '31-60', label: '31–60 days', min: 31, max: 60 },
  { key: '61-90', label: '61–90 days', min: 61, max: 90 },
  { key: '90+', label: '90+ days', min: 91, max: Infinity },
] as const;

export function ageBucket(days: number) {
  return AGE_BUCKETS.find((b) => days >= b.min && days <= b.max);
}

export function overview(now = getNow()) {
  const { timezone } = getSettings();
  const t = today(now);
  const month = monthKey(now, timezone);
  const recovered = all<{ amount: number; paidAt: number }>(
    'SELECT amount_cents AS amount, paid_at AS paidAt FROM payments WHERE case_id IS NOT NULL',
  );
  const recoveredThisMonth = recovered.filter((p) => monthKey(p.paidAt, timezone) === month).reduce((s, p) => s + p.amount, 0);
  const recoveredAll = recovered.reduce((s, p) => s + p.amount, 0);
  // Everything that ever entered a case, paid or not: the base for the recovery rate.
  const chasedTotal =
    get<{ s: number | null }>("SELECT SUM(amount_cents) AS s FROM invoices WHERE case_id IS NOT NULL AND status != 'written_off'")?.s ?? 0;

  const open = all<{ owed: number; dueDate: string; customerId: number }>(
    `SELECT amount_cents - amount_paid_cents AS owed, due_date AS dueDate, customer_id AS customerId FROM invoices
     WHERE status IN ('open', 'disputed') AND amount_cents > amount_paid_cents`,
  );
  const aging = AGE_BUCKETS.map((b) => ({ ...b, cents: 0, count: 0 }));
  let notDueCents = 0;
  for (const inv of open) {
    const days = daysOverdue(inv.dueDate, now, timezone);
    const bucket = inv.dueDate < t ? aging.find((b) => days >= b.min && days <= b.max) : undefined;
    if (bucket) {
      bucket.cents += inv.owed;
      bucket.count++;
    } else notDueCents += inv.owed;
  }

  const months: { key: string; label: string; cents: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(15);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = monthKey(d.getTime(), timezone);
    months.push({
      key,
      label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timezone }).format(d),
      cents: recovered.filter((p) => monthKey(p.paidAt, timezone) === key).reduce((s, p) => s + p.amount, 0),
    });
  }

  return {
    owedCents: open.reduce((s, i) => s + i.owed, 0),
    overdueCents: aging.reduce((s, b) => s + b.cents, 0),
    notDueCents,
    owingCustomers: new Set(open.map((i) => i.customerId)).size,
    recoveredThisMonth,
    recoveredAll,
    recoveryRate: chasedTotal ? recoveredAll / chasedTotal : 0,
    aging,
    months,
    readyCount: get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE status = 'ready'")!.n,
  };
}

/** Recovery by tone, customer type and reliability, for Reports. */
export function breakdowns(now = getNow()) {
  const summaries = allCustomerSummaries(now);
  const cases = all<{ id: number; customerId: number; status: string; startedAt: number; resolvedAt: number | null }>(
    'SELECT id, customer_id AS customerId, status, started_at AS startedAt, resolved_at AS resolvedAt FROM cases',
  );
  const chasedByCase = new Map(
    all<{ caseId: number; s: number }>('SELECT case_id AS caseId, SUM(amount_cents) AS s FROM invoices WHERE case_id IS NOT NULL GROUP BY case_id').map((r) => [r.caseId, r.s]),
  );
  const recoveredByCase = new Map(
    all<{ caseId: number; s: number }>('SELECT case_id AS caseId, SUM(amount_cents) AS s FROM payments WHERE case_id IS NOT NULL GROUP BY case_id').map((r) => [r.caseId, r.s]),
  );
  const toneByCase = new Map(
    all<{ caseId: number; tone: string }>(
      `SELECT case_id AS caseId, tone FROM messages m1 WHERE status = 'sent' AND tone IS NOT NULL
       AND id = (SELECT MAX(id) FROM messages m2 WHERE m2.case_id = m1.case_id AND m2.status = 'sent' AND m2.tone IS NOT NULL)`,
    ).map((r) => [r.caseId, r.tone]),
  );
  const byCustomer = new Map(summaries.map((s) => [s.customer.id, s]));

  type Row = { label: string; chased: number; recovered: number; cases: number };
  const group = (keyOf: (c: (typeof cases)[number]) => string | null) => {
    const m = new Map<string, Row>();
    for (const c of cases) {
      const key = keyOf(c);
      if (!key) continue;
      const row = m.get(key) ?? { label: key, chased: 0, recovered: 0, cases: 0 };
      row.chased += chasedByCase.get(c.id) ?? 0;
      row.recovered += recoveredByCase.get(c.id) ?? 0;
      row.cases++;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.chased - a.chased);
  };

  const resolved = cases.filter((c) => c.status === 'resolved' && c.resolvedAt && (recoveredByCase.get(c.id) ?? 0) > 0);
  return {
    byTone: group((c) => toneByCase.get(c.id) ?? null),
    byType: group((c) => (byCustomer.get(c.customerId)?.customer.type === 'business' ? 'Businesses' : 'Individuals')),
    byReliability: group((c) => {
      const s = byCustomer.get(c.customerId);
      return s ? { new: 'New', reliable: 'Reliable', sometimes_late: 'Sometimes late', often_late: 'Often late' }[s.record.reliability] : null;
    }),
    avgDaysToRecover: resolved.length
      ? Math.round(resolved.reduce((s, c) => s + (c.resolvedAt! - c.startedAt) / DAY, 0) / resolved.length)
      : null,
    resolvedCount: resolved.length,
  };
}

// =================================================================== demo

/**
 * Move the demo clock forward a day at a time, running the sequence each day
 * so steps land on schedule. Lands inside texting hours so demos never stall.
 */
export async function advanceClock(days: number) {
  const { timezone } = getSettings();
  const totals: RunResult = { checked: 0, prepared: 0, sent: 0, failed: 0 };
  for (let i = 0; i < days; i++) {
    let offset = getClockOffset() + DAY;
    const t = Date.now() + offset;
    offset += nextSmsWindow(t, timezone) - t;
    setClockOffset(offset);
    const r = await runDueActions(Date.now() + offset);
    totals.prepared += r.prepared;
    totals.sent += r.sent;
    totals.failed += r.failed;
    totals.checked = r.checked;
  }
  return { now: getNow(), ...totals };
}

export function describeCount(n: number, what: string) {
  return plural(n, what);
}

export { availableChannels };
