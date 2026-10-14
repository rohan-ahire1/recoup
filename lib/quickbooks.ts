import { getQuickBooks, removeQuickBooks, saveQuickBooks, updateQuickBooks, type QuickBooksConnection } from './accounts';
import { normalizeEmail, normalizePhone } from './csv';
import { open, seal, secretBoxReady } from './secret-box';
import { syncInvoices, type SyncedInvoice } from './service';
import { getNow, getSettings } from './settings';
import { baseUrl } from './templates';
import { currentTenant } from './tenant';
import { localDate } from './time';

/**
 * QuickBooks Online, read-only. A business connects with Intuit's OAuth 2.0
 * sign-in; Recoup then pulls customers and invoices on every scheduler run,
 * so a payment recorded in QuickBooks stops the reminders here.
 */

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const SCOPE = 'com.intuit.quickbooks.accounting';
const MINOR_VERSION = '75';

const apiBase = () =>
  process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';

/** Holds the OAuth state between leaving for Intuit and coming back. */
export const STATE_COOKIE = 'recoup_qb_state';

export const redirectUri = () => `${baseUrl()}/api/quickbooks/callback`;

export function quickBooksConfigured(): boolean {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET && secretBoxReady());
}

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID!,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: redirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${q}`;
}

const basicAuth = () => `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64')}`;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok || !data.access_token) throw new QuickBooksError(data.error ?? `HTTP ${res.status}`, data.error === 'invalid_grant');
  return data;
}

export class QuickBooksError extends Error {
  constructor(
    message: string,
    /** The business revoked access, or the refresh token expired: they need to connect again. */
    readonly disconnected = false,
  ) {
    super(message);
  }
}

/** Finish the sign-in: swap the code for tokens and store them for the current business. */
export async function connectQuickBooks(code: string, realmId: string, now = Date.now()) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  const { businessId } = currentTenant();
  saveQuickBooks({
    businessId,
    realmId,
    companyName: null,
    accessToken: seal(t.access_token),
    accessExpiresAt: now + t.expires_in * 1000,
    refreshToken: seal(t.refresh_token),
    refreshExpiresAt: now + t.x_refresh_token_expires_in * 1000,
    connectedAt: now,
  });
  const info = await api<{ CompanyInfo?: { CompanyName?: string } }>(getQuickBooks(businessId)!, `/companyinfo/${encodeURIComponent(realmId)}`).catch(() => null);
  if (info?.CompanyInfo?.CompanyName) updateQuickBooks(businessId, { company_name: info.CompanyInfo.CompanyName });
}

export async function disconnectQuickBooks(businessId: string) {
  const c = getQuickBooks(businessId);
  if (!c) return;
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: basicAuth(), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: open(c.refreshToken) }),
    });
  } catch {
    // Forgetting the tokens is what matters; they expire on their own.
  }
  removeQuickBooks(businessId);
}

// Refreshes in flight, one per business: Intuit rotates the refresh token, so two at once would break the second.
const g = globalThis as unknown as { __recoupQbRefresh?: Map<string, Promise<string>> };
const refreshing = (g.__recoupQbRefresh ??= new Map());

async function accessToken(c: QuickBooksConnection): Promise<string> {
  if (c.accessExpiresAt - Date.now() > 60_000) return open(c.accessToken);
  let p = refreshing.get(c.businessId);
  if (!p) {
    p = (async () => {
      const latest = getQuickBooks(c.businessId) ?? c;
      if (latest.accessExpiresAt - Date.now() > 60_000) return open(latest.accessToken);
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: open(latest.refreshToken) });
      const now = Date.now();
      updateQuickBooks(c.businessId, {
        access_token: seal(t.access_token),
        access_expires_at: now + t.expires_in * 1000,
        refresh_token: seal(t.refresh_token),
        refresh_expires_at: now + t.x_refresh_token_expires_in * 1000,
      });
      return t.access_token;
    })().finally(() => refreshing.delete(c.businessId));
    refreshing.set(c.businessId, p);
  }
  return p;
}

async function api<T>(c: QuickBooksConnection, path: string, query: Record<string, string> = {}): Promise<T> {
  const url = `${apiBase()}/v3/company/${encodeURIComponent(c.realmId)}${path}?${new URLSearchParams({ ...query, minorversion: MINOR_VERSION })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken(c)}`, Accept: 'application/json' } });
  if (res.status === 401) throw new QuickBooksError('QuickBooks refused the connection', true);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new QuickBooksError(`QuickBooks error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as T;
}

/** Runs a QuickBooks query, following pages. */
async function queryAll<T>(c: QuickBooksConnection, entity: string, where: string): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let start = 1, pages = 0; pages < 50; start += PAGE, pages++) {
    const q = `SELECT * FROM ${entity}${where ? ` WHERE ${where}` : ''} STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
    const r = await api<{ QueryResponse: Record<string, T[] | undefined> }>(c, '/query', { query: q });
    const rows = r.QueryResponse[entity] ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const quote = (s: string) => `'${s.replace(/'/g, "\\'")}'`;

async function byIds<T>(c: QuickBooksConnection, entity: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    out.push(...(await queryAll<T>(c, entity, `Id IN (${unique.slice(i, i + 100).map(quote).join(', ')})`)));
  }
  return out;
}

// ---------------------------------------------------------------- mapping

export interface QbInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt: number;
  Balance: number;
  PrivateNote?: string;
  CustomerRef: { value: string; name?: string };
  Line?: { Description?: string; DetailType?: string }[];
  LinkedTxn?: { TxnId: string; TxnType: string }[];
  BillEmail?: { Address?: string };
}

export interface QbCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  Mobile?: { FreeFormNumber?: string };
}

interface QbPayment {
  Id: string;
  TxnDate: string;
}

const cents = (n: number) => Math.round(n * 100);

/** QuickBooks records as Recoup rows. Pure, so it's easy to test. */
export function mapInvoices(invoices: QbInvoice[], customers: QbCustomer[], paymentDates: Map<string, string>): SyncedInvoice[] {
  const byId = new Map(customers.map((c) => [c.Id, c]));
  return invoices.map((inv) => {
    const cust = byId.get(inv.CustomerRef.value);
    const company = cust?.CompanyName?.trim();
    const person = [cust?.GivenName, cust?.FamilyName].filter(Boolean).join(' ').trim();
    // QuickBooks allows several addresses separated by commas; the first is the main one.
    const email = normalizeEmail((cust?.PrimaryEmailAddr?.Address ?? inv.BillEmail?.Address ?? '').split(/[,;]/)[0]);
    const phone = normalizePhone(cust?.Mobile?.FreeFormNumber ?? cust?.PrimaryPhone?.FreeFormNumber ?? '');
    const paidCents = cents(inv.TotalAmt) - cents(inv.Balance);
    const paymentIds = (inv.LinkedTxn ?? []).filter((t) => t.TxnType === 'Payment').map((t) => t.TxnId);
    const paidDate = inv.Balance <= 0 ? paymentIds.map((id) => paymentDates.get(id)).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null : null;
    const description = inv.Line?.find((l) => l.DetailType === 'SalesItemLineDetail' && l.Description)?.Description?.trim() || null;
    return {
      qbId: inv.Id,
      number: inv.DocNumber?.trim() || `QB-${inv.Id}`,
      description: description?.slice(0, 200) ?? null,
      amountCents: cents(inv.TotalAmt),
      paidCents,
      issuedDate: inv.TxnDate ?? null,
      dueDate: inv.DueDate ?? inv.TxnDate ?? localDate(getNow(), getSettings().timezone),
      paidDate,
      customer: {
        qbId: inv.CustomerRef.value,
        name: (cust?.DisplayName ?? inv.CustomerRef.name ?? 'Unknown customer').trim(),
        type: company ? 'business' : 'individual',
        contactName: company && person ? person : null,
        email,
        phone,
        tags: [],
      },
    };
  });
}

// ---------------------------------------------------------------- sync

const DAY = 86_400_000;
/** First sync looks back this far, so Recoup learns how each customer usually pays. */
const HISTORY_DAYS = 548;

/** Pull changes for the current business. Run inside its tenant context. */
export async function syncQuickBooks(now = Date.now()) {
  const { businessId } = currentTenant();
  const c = getQuickBooks(businessId);
  if (!c) return null;
  try {
    let invoices: QbInvoice[];
    if (c.lastSyncAt) {
      // A little overlap, so nothing updated during the last run is missed.
      const since = new Date(c.lastSyncAt - 10 * 60_000).toISOString();
      invoices = await queryAll<QbInvoice>(c, 'Invoice', `MetaData.LastUpdatedTime >= ${quote(since)}`);
    } else {
      const from = new Date(now - HISTORY_DAYS * DAY).toISOString().slice(0, 10);
      const recent = await queryAll<QbInvoice>(c, 'Invoice', `TxnDate >= ${quote(from)}`);
      const open = await queryAll<QbInvoice>(c, 'Invoice', `Balance > '0'`);
      invoices = [...new Map([...recent, ...open].map((i) => [i.Id, i])).values()];
    }
    const customers = await byIds<QbCustomer>(c, 'Customer', invoices.map((i) => i.CustomerRef.value));
    const paymentIds = invoices.filter((i) => i.Balance <= 0).flatMap((i) => (i.LinkedTxn ?? []).filter((t) => t.TxnType === 'Payment').map((t) => t.TxnId));
    const payments = await byIds<QbPayment>(c, 'Payment', paymentIds);
    const rows = mapInvoices(invoices, customers, new Map(payments.map((p) => [p.Id, p.TxnDate])));
    const result = await syncInvoices(rows);
    updateQuickBooks(businessId, { last_sync_at: now, last_error: null });
    return result;
  } catch (err) {
    const message = err instanceof QuickBooksError && err.disconnected ? 'disconnected' : String(err instanceof Error ? err.message : err).slice(0, 300);
    updateQuickBooks(businessId, { last_error: message });
    throw err;
  }
}

/** Whether the scheduler should sync this connection now. Hourly is plenty. */
export function syncDue(c: QuickBooksConnection, now = Date.now()): boolean {
  return c.lastError !== 'disconnected' && (!c.lastSyncAt || now - c.lastSyncAt >= 55 * 60_000);
}
