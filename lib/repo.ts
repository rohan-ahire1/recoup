import { all, get, run } from './db';
import { BUILTIN_TONES, type TemplateSetContent } from './tones';
import type {
  Case,
  CaseStatus,
  Customer,
  CustomerEvent,
  Installment,
  Invoice,
  Message,
  MessageStatus,
  Payment,
  Tone,
} from './types';

type Row = Record<string, unknown>;

const bool = (v: unknown) => Boolean(v);
const plain = <T>(r: unknown): T => ({ ...(r as object) }) as T;

// ------------------------------------------------------------------ customers

const CUSTOMER_COLS = `id, name, type, contact_name AS contactName, email, phone, preferred_channel AS preferredChannel,
  tags, template_set_id AS templateSetId, do_not_chase AS doNotChase, opted_out_sms AS optedOutSms, notes,
  pay_token AS payToken, created_at AS createdAt`;

const toCustomer = (r: Row): Customer => ({
  ...(r as unknown as Customer),
  tags: JSON.parse(String(r.tags ?? '[]')),
  doNotChase: bool(r.doNotChase),
  optedOutSms: bool(r.optedOutSms),
});

export function getCustomer(id: number): Customer | undefined {
  const r = get<Row>(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ?`, id);
  return r && toCustomer(r);
}

export function getCustomerByToken(token: string): Customer | undefined {
  const r = get<Row>(`SELECT ${CUSTOMER_COLS} FROM customers WHERE pay_token = ?`, token);
  return r && toCustomer(r);
}

export function listCustomers(): Customer[] {
  return all<Row>(`SELECT ${CUSTOMER_COLS} FROM customers ORDER BY name COLLATE NOCASE`).map(toCustomer);
}

export function findCustomer(by: { name?: string; email?: string | null; phone?: string | null }): Customer | undefined {
  const tries: [string, string | null | undefined][] = [
    ['name = ? COLLATE NOCASE', by.name],
    ['email = ?', by.email],
    ['phone = ?', by.phone],
  ];
  for (const [where, value] of tries) {
    if (!value) continue;
    const r = get<Row>(`SELECT ${CUSTOMER_COLS} FROM customers WHERE ${where} ORDER BY id LIMIT 1`, value);
    if (r) return toCustomer(r);
  }
  return undefined;
}

export function updateCustomer(id: number, fields: Record<string, string | number | null>) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  run(`UPDATE customers SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => fields[c]), id);
}

// ------------------------------------------------------------------ invoices

const INVOICE_COLS = `id, customer_id AS customerId, number, description, amount_cents AS amountCents,
  amount_paid_cents AS amountPaidCents, issued_date AS issuedDate, due_date AS dueDate, status,
  paid_date AS paidDate, case_id AS caseId, created_at AS createdAt`;

export function getInvoice(id: number): Invoice | undefined {
  const r = get<Row>(`SELECT ${INVOICE_COLS} FROM invoices WHERE id = ?`, id);
  return r && plain<Invoice>(r);
}

export function listCustomerInvoices(customerId: number): Invoice[] {
  return all<Row>(`SELECT ${INVOICE_COLS} FROM invoices WHERE customer_id = ? ORDER BY due_date DESC, id DESC`, customerId).map((r) =>
    plain<Invoice>(r),
  );
}

export function listAllInvoices(): Invoice[] {
  return all<Row>(`SELECT ${INVOICE_COLS} FROM invoices ORDER BY due_date DESC, id DESC`).map((r) => plain<Invoice>(r));
}

/** Invoices with money still owed, oldest due first. */
export function openInvoices(customerId: number): Invoice[] {
  return all<Row>(
    `SELECT ${INVOICE_COLS} FROM invoices WHERE customer_id = ? AND status IN ('open', 'disputed') AND amount_cents > amount_paid_cents
     ORDER BY due_date, id`,
    customerId,
  ).map((r) => plain<Invoice>(r));
}

export function updateInvoice(id: number, fields: Record<string, string | number | null>, now: number) {
  const cols = Object.keys(fields);
  run(`UPDATE invoices SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((c) => fields[c]), now, id);
}

// ------------------------------------------------------------------ cases

const CASE_COLS = `id, customer_id AS customerId, status, started_at AS startedAt, current_step AS currentStep,
  last_sent_at AS lastSentAt, paused_at AS pausedAt, promise_date AS promiseDate, needs_attention AS needsAttention,
  attention_reason AS attentionReason, resolved_at AS resolvedAt, created_at AS createdAt`;

const toCase = (r: Row): Case => ({ ...(r as unknown as Case), needsAttention: bool(r.needsAttention) });

export function getCase(id: number): Case | undefined {
  const r = get<Row>(`SELECT ${CASE_COLS} FROM cases WHERE id = ?`, id);
  return r && toCase(r);
}

export function getOpenCase(customerId: number): Case | undefined {
  const r = get<Row>(
    `SELECT ${CASE_COLS} FROM cases WHERE customer_id = ? AND status != 'resolved' ORDER BY id DESC LIMIT 1`,
    customerId,
  );
  return r && toCase(r);
}

export function listCustomerCases(customerId: number): Case[] {
  return all<Row>(`SELECT ${CASE_COLS} FROM cases WHERE customer_id = ? ORDER BY id DESC`, customerId).map(toCase);
}

export function listOpenCases(): Case[] {
  return all<Row>(`SELECT ${CASE_COLS} FROM cases WHERE status != 'resolved' ORDER BY id`).map(toCase);
}

export function listAllCases(): Case[] {
  return all<Row>(`SELECT ${CASE_COLS} FROM cases ORDER BY id`).map(toCase);
}

export function updateCase(id: number, fields: Record<string, string | number | null>, now: number) {
  const cols = Object.keys(fields);
  run(`UPDATE cases SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((c) => fields[c]), now, id);
}

export function setCaseStatus(id: number, status: CaseStatus, now: number, extra: Record<string, string | number | null> = {}) {
  updateCase(id, { status, ...extra }, now);
}

export function listInstallments(caseId: number): Installment[] {
  return all<Row>(
    'SELECT id, case_id AS caseId, seq, amount_cents AS amountCents, due_at AS dueAt, paid_at AS paidAt FROM installments WHERE case_id = ? ORDER BY seq',
    caseId,
  ).map((r) => plain<Installment>(r));
}

// ------------------------------------------------------------------ messages

const MESSAGE_COLS = `id, customer_id AS customerId, case_id AS caseId, channel, direction, action_key AS actionKey, step, tone,
  to_addr AS toAddr, subject, body, status, provider, error, reply_kind AS replyKind, created_at AS createdAt, sent_at AS sentAt`;

export function getMessage(id: number): Message | undefined {
  const r = get<Row>(`SELECT ${MESSAGE_COLS} FROM messages WHERE id = ?`, id);
  return r && plain<Message>(r);
}

export function listCustomerMessages(customerId: number): Message[] {
  return all<Row>(`SELECT ${MESSAGE_COLS} FROM messages WHERE customer_id = ? ORDER BY created_at, id`, customerId).map((r) =>
    plain<Message>(r),
  );
}

export function listMessagesByStatus(statuses: MessageStatus[], limit = 500): Message[] {
  const marks = statuses.map(() => '?').join(',');
  return all<Row>(
    `SELECT ${MESSAGE_COLS} FROM messages WHERE status IN (${marks}) ORDER BY COALESCE(sent_at, created_at) DESC, id DESC LIMIT ?`,
    ...statuses,
    limit,
  ).map((r) => plain<Message>(r));
}

export function readyMessageForCase(caseId: number): Message | undefined {
  const r = get<Row>(`SELECT ${MESSAGE_COLS} FROM messages WHERE case_id = ? AND status = 'ready' ORDER BY id DESC LIMIT 1`, caseId);
  return r && plain<Message>(r);
}

export function sentKeys(caseId: number): Set<string> {
  return new Set(
    all<{ k: string }>('SELECT action_key AS k FROM messages WHERE case_id = ? AND action_key IS NOT NULL', caseId).map((r) => r.k),
  );
}

export function updateMessage(id: number, fields: Record<string, string | number | null>) {
  const cols = Object.keys(fields);
  run(`UPDATE messages SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => fields[c]), id);
}

// ------------------------------------------------------------------ payments & events

export function listPayments(customerId?: number): Payment[] {
  const where = customerId === undefined ? '' : 'WHERE customer_id = ?';
  return all<Row>(
    `SELECT id, customer_id AS customerId, case_id AS caseId, amount_cents AS amountCents, method, source, paid_at AS paidAt
     FROM payments ${where} ORDER BY paid_at`,
    ...(customerId === undefined ? [] : [customerId]),
  ).map((r) => plain<Payment>(r));
}

export function listEvents(customerId: number): CustomerEvent[] {
  return all<Row>(
    'SELECT id, customer_id AS customerId, case_id AS caseId, type, detail, created_at AS createdAt FROM events WHERE customer_id = ? ORDER BY created_at, id',
    customerId,
  ).map((r) => plain<CustomerEvent>(r));
}

export function lastActivity(customerId: number): number | null {
  return (
    get<{ t: number | null }>(
      `SELECT MAX(t) AS t FROM (
         SELECT MAX(created_at) AS t FROM events WHERE customer_id = ?
         UNION ALL SELECT MAX(COALESCE(sent_at, created_at)) FROM messages WHERE customer_id = ?)`,
      customerId,
      customerId,
    )?.t ?? null
  );
}

export function logEvent(customerId: number, caseId: number | null, type: string, detail: string | null, now: number) {
  run('INSERT INTO events (customer_id, case_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?)', customerId, caseId, type, detail, now);
}

// ------------------------------------------------------------------ template sets

export interface TemplateSet {
  id: number;
  name: string;
  tone: Tone;
  description: string | null;
  builtin: boolean;
  templates: TemplateSetContent;
  createdAt: number;
}

const toSet = (r: Row): TemplateSet => ({
  ...(r as unknown as TemplateSet),
  builtin: bool(r.builtin),
  templates: JSON.parse(String(r.templates)),
});

const SET_COLS = 'id, name, tone, description, builtin, templates, created_at AS createdAt';

/** The four built-in tones exist in every database. */
export function ensureBuiltinSets() {
  const have = new Set(all<{ tone: string }>('SELECT tone FROM template_sets WHERE builtin = 1').map((r) => r.tone));
  for (const t of BUILTIN_TONES) {
    if (have.has(t.tone)) continue;
    run(
      'INSERT INTO template_sets (name, tone, description, builtin, templates, created_at) VALUES (?, ?, ?, 1, ?, ?)',
      t.name,
      t.tone,
      t.description,
      JSON.stringify(t.templates),
      Date.now(),
    );
  }
}

export function listTemplateSets(): TemplateSet[] {
  ensureBuiltinSets();
  return all<Row>(`SELECT ${SET_COLS} FROM template_sets ORDER BY builtin DESC, id`).map(toSet);
}

export function getTemplateSet(id: number): TemplateSet | undefined {
  const r = get<Row>(`SELECT ${SET_COLS} FROM template_sets WHERE id = ?`, id);
  return r && toSet(r);
}

export function builtinSet(tone: string): TemplateSet {
  ensureBuiltinSets();
  return toSet(get<Row>(`SELECT ${SET_COLS} FROM template_sets WHERE builtin = 1 AND tone = ?`, tone)!);
}
