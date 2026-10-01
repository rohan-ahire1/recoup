import Papa from 'papaparse';
import { localDate, shiftDate } from './time';
import type { CustomerType } from './types';

export interface ParsedInvoice {
  customerName: string;
  customerType: CustomerType | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  tags: string[];
  invoiceNumber: string;
  description: string | null;
  amountCents: number;
  issuedDate: string | null;
  dueDate: string;
  /** Paid invoices feed the customer's track record; open ones get chased. */
  paid: boolean;
  paidDate: string | null;
}

export interface ParsedRow {
  line: number;
  raw: Record<string, string>;
  invoice: ParsedInvoice | null;
  errors: string[];
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  missingColumns: string[];
  /** True when at least one row is a paid invoice, i.e. the file includes history. */
  hasHistory: boolean;
}

type Field = 'customer' | 'type' | 'contact' | 'phone' | 'email' | 'tags' | 'invoice' | 'description' | 'amount' | 'issued' | 'due' | 'paid' | 'status';

const HEADER_ALIASES: Record<Field, string[]> = {
  customer: ['customer', 'customer name', 'name', 'client', 'client name', 'company', 'business'],
  type: ['type', 'customer type', 'kind'],
  contact: ['contact', 'contact name', 'contact person', 'attention', 'attn'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'cell phone', 'mobile phone'],
  email: ['email', 'e-mail', 'email address'],
  tags: ['tags', 'tag', 'category', 'categories', 'segment', 'group'],
  invoice: ['invoice', 'invoice #', 'invoice number', 'invoice no', 'invoice no.', 'inv', 'inv #', '#', 'number'],
  description: ['description', 'for', 'item', 'items', 'service', 'memo', 'details'],
  amount: ['amount', 'amount due', 'balance', 'balance due', 'total', 'owed'],
  issued: ['issued', 'issue date', 'date', 'invoice date', 'issued date'],
  due: ['due', 'due date', 'days overdue', 'overdue', 'age'],
  paid: ['paid', 'paid date', 'paid on', 'date paid', 'payment date'],
  status: ['status', 'state'],
};

const normHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** US-centric: 10-digit numbers get +1; anything starting with + is kept as international. */
export function normalizePhone(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function normalizeEmail(input: string): string | null {
  const s = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function parseAmount(input: string): number | null {
  const s = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 ? cents : null;
}

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** "2026-08-25" or "8/25/2026". */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return validDate(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

/** Accepts a date, or days overdue like "32d", "32 days" or "32". */
export function parseDue(input: string, today: string): string | null {
  const m = input.trim().match(/^(\d{1,4})\s*(d|days?)?(\s+overdue)?$/i);
  if (m) return shiftDate(today, -Number(m[1]));
  return parseDate(input);
}

export function parseCustomerType(input: string): CustomerType | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^(b|business|company|org|organization|organisation|commercial)$/.test(s)) return 'business';
  if (/^(i|individual|person|personal|consumer|home|residential)$/.test(s)) return 'individual';
  return null;
}

export function normalizeInvoiceNumber(input: string): string {
  return input.trim().replace(/^#\s*/, '').trim();
}

export function parseInvoiceCsv(text: string, opts: { now: number; timeZone: string }): ParseResult {
  const today = localDate(opts.now, opts.timeZone);
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normHeader,
  });
  const headers = parsed.meta.fields ?? [];

  const columns = {} as Record<Field, string | undefined>;
  const taken = new Set<string>();
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    columns[field] = HEADER_ALIASES[field].find((alias) => headers.includes(alias) && !taken.has(alias));
    if (columns[field]) taken.add(columns[field]!);
  }

  const missingColumns: string[] = [];
  if (!columns.customer) missingColumns.push('Customer');
  if (!columns.invoice) missingColumns.push('Invoice');
  if (!columns.amount) missingColumns.push('Amount');
  if (!columns.due) missingColumns.push('Due');
  if (!columns.phone && !columns.email) missingColumns.push('Phone or Email');
  if (missingColumns.length) return { rows: [], missingColumns, hasHistory: false };

  const seen = new Map<string, number>();
  const rows = parsed.data.map((raw, i): ParsedRow => {
    const line = i + 2; // header is line 1
    const cell = (f: Field) => (columns[f] ? String(raw[columns[f]!] ?? '').trim() : '');
    const errors: string[] = [];
    const warnings: string[] = [];

    const customerName = cell('customer');
    if (!customerName) errors.push('Missing customer name');

    const invoiceNumber = normalizeInvoiceNumber(cell('invoice'));
    if (!invoiceNumber) errors.push('Missing invoice number');
    else if (seen.has(invoiceNumber.toLowerCase())) errors.push(`Same invoice as line ${seen.get(invoiceNumber.toLowerCase())}`);
    else seen.set(invoiceNumber.toLowerCase(), line);

    const amountCents = parseAmount(cell('amount'));
    if (amountCents === null) errors.push(`Amount "${cell('amount')}" isn't a dollar amount`);

    const dueDate = parseDue(cell('due'), today);
    if (!dueDate) errors.push(`Due "${cell('due')}" isn't a date or "32d"`);

    const issuedDate = cell('issued') ? parseDate(cell('issued')) : null;
    if (cell('issued') && !issuedDate) warnings.push(`Issued date "${cell('issued')}" ignored`);

    // Paid: a date, or "yes"/"paid" in Paid or Status.
    const paidCell = cell('paid');
    const statusCell = cell('status').toLowerCase();
    let paidDate: string | null = null;
    let paid = false;
    if (paidCell) {
      paidDate = parseDate(paidCell);
      paid = Boolean(paidDate) || /^(y|yes|paid|true|1)$/i.test(paidCell);
      if (!paid) warnings.push(`Paid "${paidCell}" isn't a date; treated as unpaid`);
    }
    if (!paid && /^(paid|closed|settled)$/.test(statusCell)) paid = true;
    if (paid && !paidDate) warnings.push('Paid, but no date; left out of the track record');

    const phoneRaw = cell('phone');
    const emailRaw = cell('email');
    const phone = normalizePhone(phoneRaw);
    const email = normalizeEmail(emailRaw);
    if (!phone && !email) {
      if (paid) warnings.push('No contact details');
      else errors.push('Needs a valid phone number or email');
    } else {
      if (phoneRaw && !phone) warnings.push(`Phone "${phoneRaw}" isn't valid`);
      if (emailRaw && !email) warnings.push(`Email "${emailRaw}" isn't valid`);
    }

    if (!paid && dueDate && dueDate >= today) warnings.push('Not due yet; reminders start once it is overdue');

    const contactName = cell('contact') || null;
    const customerType =
      parseCustomerType(cell('type')) ?? (contactName && contactName.toLowerCase() !== customerName.toLowerCase() ? 'business' : null);
    const tags = cell('tags')
      .split(/[;,|]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const invoice =
      errors.length === 0
        ? {
            customerName,
            customerType,
            contactName,
            phone,
            email,
            tags,
            invoiceNumber,
            description: cell('description') || null,
            amountCents: amountCents!,
            issuedDate,
            dueDate: dueDate!,
            paid,
            paidDate,
          }
        : null;
    return { line, raw, invoice, errors, warnings };
  });

  return { rows, missingColumns, hasHistory: rows.some((r) => r.invoice?.paid) };
}
