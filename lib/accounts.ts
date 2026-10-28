import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { dataDir, deleteBusinessDb, openDatabase } from './db';
import type { Tenant } from './tenant';

/**
 * The one shared database: who can sign in, which businesses exist, and the
 * public lookups (payment links) that arrive before we know the business.
 * Business data itself never lives here.
 */
const MIGRATIONS = [
  `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL,
  -- Demo workspaces are deleted after this.
  expires_at INTEGER
);

CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, business_id)
);
CREATE INDEX memberships_business ON memberships(business_id);

-- Only hashes of secrets are stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE pay_tokens (
  token TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE
);
CREATE INDEX pay_tokens_business ON pay_tokens(business_id);
`,
  `
-- Set when bounces or spam complaints stop a business's automatic email.
ALTER TABLE businesses ADD COLUMN email_paused_at INTEGER;
ALTER TABLE businesses ADD COLUMN email_paused_reason TEXT;

-- A business's own sending address, verified through Resend.
CREATE TABLE email_domains (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE COLLATE NOCASE,
  resend_id TEXT NOT NULL,
  status TEXT NOT NULL,
  records TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  checked_at INTEGER
);

-- Every email sent through the shared sender, so bounce reports find their business
-- and the daily cap can be counted. Kept for 30 days.
CREATE TABLE sent_emails (
  provider_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sent_at INTEGER NOT NULL,
  outcome TEXT
);
CREATE INDEX sent_emails_business ON sent_emails(business_id, sent_at);
`,
  `
-- A business's QuickBooks Online company. Tokens are encrypted (lib/secret-box.ts).
CREATE TABLE quickbooks_connections (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,
  company_name TEXT,
  access_token TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  refresh_token TEXT NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  connected_at INTEGER NOT NULL,
  last_sync_at INTEGER,
  last_error TEXT
);
`,
  `
-- AI calls per business per calendar month (UTC, 'YYYY-MM'), for the monthly cap in lib/ai.ts.
CREATE TABLE ai_usage (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, month)
);
`,
];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const LOGIN_TOKEN_TTL = 15 * MINUTE;
export const SESSION_TTL = 30 * DAY;
export const DEMO_TTL = 3 * DAY;

const g = globalThis as unknown as { __recoupAccounts?: DatabaseSync };

function adb(): DatabaseSync {
  return (g.__recoupAccounts ??= openDatabase(path.join(dataDir(), 'accounts.db'), MIGRATIONS));
}

/** For the health check: the accounts database answers. */
export function countBusinesses(): number {
  return Number((adb().prepare('SELECT count(*) AS n FROM businesses').get() as { n: number }).n);
}

/** For tests that swap DATA_DIR. */
export function closeAccounts() {
  g.__recoupAccounts?.close();
  g.__recoupAccounts = undefined;
}

const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const newId = (prefix: string) => `${prefix}_${randomBytes(10).toString('hex')}`;

// ---------------------------------------------------------------- sign-in links

export function createLoginToken(email: string, now = Date.now()): string {
  const token = secret();
  adb()
    .prepare('INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hash(token), email.trim().toLowerCase(), now, now + LOGIN_TOKEN_TTL);
  return token;
}

/** The email a sign-in link was for, once. Expired or used links give null. */
export function consumeLoginToken(token: string, now = Date.now()): string | null {
  const r = adb()
    .prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email')
    .get(now, hash(token), now) as { email: string } | undefined;
  return r?.email ?? null;
}

// ---------------------------------------------------------------- users

export interface User {
  id: string;
  email: string;
}

export function findOrCreateUser(email: string, now = Date.now()): User {
  const clean = email.trim().toLowerCase();
  const d = adb();
  d.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING').run(newId('u'), clean, now);
  d.prepare('UPDATE users SET last_login_at = ? WHERE email = ?').run(now, clean);
  return d.prepare('SELECT id, email FROM users WHERE email = ?').get(clean) as unknown as User;
}

export function getUser(id: string): User | undefined {
  return adb().prepare('SELECT id, email FROM users WHERE id = ?').get(id) as User | undefined;
}

// ---------------------------------------------------------------- businesses

export interface Business {
  id: string;
  name: string;
  demo: boolean;
  plan: string;
  createdAt: number;
  expiresAt: number | null;
  emailPausedAt: number | null;
  emailPausedReason: string | null;
}

const BUSINESS_COLS =
  'b.id, b.name, b.demo, b.plan, b.created_at AS createdAt, b.expires_at AS expiresAt, b.email_paused_at AS emailPausedAt, b.email_paused_reason AS emailPausedReason';
const toBusiness = (r: Record<string, unknown> | undefined): Business | undefined =>
  r ? ({ ...(r as unknown as Business), demo: Boolean(r.demo) }) : undefined;

export function createBusiness(opts: { name: string; ownerId?: string; demo?: boolean }, now = Date.now()): Business {
  const id = newId('b');
  const d = adb();
  d.exec('BEGIN');
  try {
    d.prepare('INSERT INTO businesses (id, name, demo, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      opts.name,
      opts.demo ? 1 : 0,
      now,
      opts.demo ? now + DEMO_TTL : null,
    );
    if (opts.ownerId) d.prepare("INSERT INTO memberships (user_id, business_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(opts.ownerId, id, now);
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
  return getBusiness(id)!;
}

export function getBusiness(id: string): Business | undefined {
  return toBusiness(adb().prepare(`SELECT ${BUSINESS_COLS} FROM businesses b WHERE b.id = ?`).get(id));
}

export function renameBusiness(id: string, name: string) {
  adb().prepare('UPDATE businesses SET name = ? WHERE id = ?').run(name, id);
}

export function businessesForUser(userId: string): Business[] {
  return adb()
    .prepare(`SELECT ${BUSINESS_COLS} FROM businesses b JOIN memberships m ON m.business_id = b.id WHERE m.user_id = ? ORDER BY b.created_at`)
    .all(userId)
    .map((r) => toBusiness(r)!);
}

/** Every real (non-demo) business, for the scheduler. */
export function listLiveBusinesses(): Business[] {
  return adb().prepare(`SELECT ${BUSINESS_COLS} FROM businesses b WHERE b.demo = 0 ORDER BY b.created_at`).all().map((r) => toBusiness(r)!);
}

export const tenantOf = (b: Business): Tenant => ({ businessId: b.id, demo: b.demo });

/** Remove a business and all of its data. */
export function deleteBusiness(id: string) {
  adb().prepare('DELETE FROM businesses WHERE id = ?').run(id);
  deleteBusinessDb(id);
}

// ---------------------------------------------------------------- sessions

export interface Session {
  userId: string | null;
  businessId: string | null;
  expiresAt: number;
}

export function createSession(opts: { userId?: string | null; businessId?: string | null }, now = Date.now()): string {
  const token = secret();
  adb()
    .prepare('INSERT INTO sessions (token_hash, user_id, business_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(hash(token), opts.userId ?? null, opts.businessId ?? null, now, now + SESSION_TTL);
  return token;
}

export function getSession(token: string, now = Date.now()): Session | undefined {
  const d = adb();
  const s = d
    .prepare('SELECT user_id AS userId, business_id AS businessId, expires_at AS expiresAt FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hash(token), now) as Session | undefined;
  // Sliding expiry, written at most once a day.
  if (s && s.expiresAt - now < SESSION_TTL - DAY) {
    d.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now + SESSION_TTL, hash(token));
  }
  return s;
}

export function setSessionBusiness(token: string, businessId: string) {
  adb().prepare('UPDATE sessions SET business_id = ? WHERE token_hash = ?').run(businessId, hash(token));
}

export function deleteSession(token: string) {
  adb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
}

// ---------------------------------------------------------------- payment links

export function registerPayToken(token: string, businessId: string) {
  adb().prepare('INSERT OR IGNORE INTO pay_tokens (token, business_id) VALUES (?, ?)').run(token, businessId);
}

export function businessForPayToken(token: string): Business | undefined {
  return toBusiness(
    adb().prepare(`SELECT ${BUSINESS_COLS} FROM businesses b WHERE b.id = (SELECT business_id FROM pay_tokens WHERE token = ?)`).get(token),
  );
}

// ---------------------------------------------------------------- email

export interface EmailDomain {
  businessId: string;
  fromEmail: string;
  domain: string;
  resendId: string;
  /** Resend's status: not_started, pending, verified, failed or temporary_failure. */
  status: string;
  records: { record: string; name: string; type: string; value: string; priority?: number; status?: string }[];
  checkedAt: number | null;
}

export function getEmailDomain(businessId: string): EmailDomain | undefined {
  const r = adb()
    .prepare(
      'SELECT business_id AS businessId, from_email AS fromEmail, domain, resend_id AS resendId, status, records, checked_at AS checkedAt FROM email_domains WHERE business_id = ?',
    )
    .get(businessId) as (Omit<EmailDomain, 'records'> & { records: string }) | undefined;
  return r ? { ...r, records: JSON.parse(r.records) } : undefined;
}

export function saveEmailDomain(d: Omit<EmailDomain, 'checkedAt'>, now = Date.now()) {
  adb()
    .prepare(
      `INSERT INTO email_domains (business_id, from_email, domain, resend_id, status, records, created_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(business_id) DO UPDATE SET from_email = excluded.from_email, domain = excluded.domain, resend_id = excluded.resend_id,
         status = excluded.status, records = excluded.records, checked_at = excluded.checked_at`,
    )
    .run(d.businessId, d.fromEmail, d.domain, d.resendId, d.status, JSON.stringify(d.records), now, now);
}

export function removeEmailDomain(businessId: string) {
  adb().prepare('DELETE FROM email_domains WHERE business_id = ?').run(businessId);
}

export function recordSentEmail(providerId: string, businessId: string, now = Date.now()) {
  adb().prepare('INSERT OR IGNORE INTO sent_emails (provider_id, business_id, sent_at) VALUES (?, ?, ?)').run(providerId, businessId, now);
}

/** Notes a bounce or complaint. Returns the business it belongs to, once per email. */
export function recordEmailOutcome(providerId: string, outcome: 'bounced' | 'complained'): string | undefined {
  const r = adb()
    .prepare('UPDATE sent_emails SET outcome = ? WHERE provider_id = ? AND outcome IS NULL RETURNING business_id AS businessId')
    .get(outcome, providerId) as { businessId: string } | undefined;
  return r?.businessId;
}

export function emailStats(businessId: string, sinceMs: number) {
  return adb()
    .prepare(
      `SELECT COUNT(*) AS sent, COALESCE(SUM(outcome = 'bounced'), 0) AS bounced, COALESCE(SUM(outcome = 'complained'), 0) AS complained
       FROM sent_emails WHERE business_id = ? AND sent_at >= ?`,
    )
    .get(businessId, sinceMs) as { sent: number; bounced: number; complained: number };
}

export function pauseBusinessEmail(businessId: string, reason: string, now = Date.now()) {
  adb().prepare('UPDATE businesses SET email_paused_at = ?, email_paused_reason = ? WHERE id = ? AND email_paused_at IS NULL').run(now, reason, businessId);
}

export function resumeBusinessEmail(businessId: string) {
  adb().prepare('UPDATE businesses SET email_paused_at = NULL, email_paused_reason = NULL WHERE id = ?').run(businessId);
}

// ---------------------------------------------------------------- AI usage

/** Counts one AI call for the month unless the business already made `cap`. True if it was counted. */
export function takeAiCall(businessId: string, month: string, cap: number): boolean {
  if (cap < 1) return false;
  const r = adb()
    .prepare(
      `INSERT INTO ai_usage (business_id, month, calls) VALUES (?, ?, 1)
       ON CONFLICT(business_id, month) DO UPDATE SET calls = calls + 1 WHERE calls < ? RETURNING calls`,
    )
    .get(businessId, month, cap);
  return r !== undefined;
}

export function aiCallsThisMonth(businessId: string, month: string): number {
  const r = adb().prepare('SELECT calls FROM ai_usage WHERE business_id = ? AND month = ?').get(businessId, month) as { calls: number } | undefined;
  return r?.calls ?? 0;
}

// ---------------------------------------------------------------- QuickBooks

export interface QuickBooksConnection {
  businessId: string;
  realmId: string;
  companyName: string | null;
  /** Encrypted. */
  accessToken: string;
  accessExpiresAt: number;
  /** Encrypted. */
  refreshToken: string;
  refreshExpiresAt: number;
  connectedAt: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

const QB_COLS = `business_id AS businessId, realm_id AS realmId, company_name AS companyName, access_token AS accessToken,
  access_expires_at AS accessExpiresAt, refresh_token AS refreshToken, refresh_expires_at AS refreshExpiresAt,
  connected_at AS connectedAt, last_sync_at AS lastSyncAt, last_error AS lastError`;

export function getQuickBooks(businessId: string): QuickBooksConnection | undefined {
  return adb().prepare(`SELECT ${QB_COLS} FROM quickbooks_connections WHERE business_id = ?`).get(businessId) as QuickBooksConnection | undefined;
}

/** Live businesses connected to QuickBooks, for the scheduler. */
export function listQuickBooks(): QuickBooksConnection[] {
  return adb()
    .prepare(`SELECT ${QB_COLS} FROM quickbooks_connections q JOIN businesses b ON b.id = q.business_id WHERE b.demo = 0`)
    .all() as unknown as QuickBooksConnection[];
}

export function saveQuickBooks(c: Omit<QuickBooksConnection, 'lastSyncAt' | 'lastError'>) {
  adb()
    .prepare(
      `INSERT INTO quickbooks_connections (business_id, realm_id, company_name, access_token, access_expires_at, refresh_token, refresh_expires_at, connected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(business_id) DO UPDATE SET realm_id = excluded.realm_id, company_name = excluded.company_name, access_token = excluded.access_token,
         access_expires_at = excluded.access_expires_at, refresh_token = excluded.refresh_token, refresh_expires_at = excluded.refresh_expires_at,
         connected_at = excluded.connected_at, last_error = NULL,
         last_sync_at = CASE WHEN quickbooks_connections.realm_id = excluded.realm_id THEN quickbooks_connections.last_sync_at END`,
    )
    .run(c.businessId, c.realmId, c.companyName, c.accessToken, c.accessExpiresAt, c.refreshToken, c.refreshExpiresAt, c.connectedAt);
}

export function updateQuickBooks(
  businessId: string,
  fields: Partial<Record<'company_name' | 'access_token' | 'access_expires_at' | 'refresh_token' | 'refresh_expires_at' | 'last_sync_at' | 'last_error', string | number | null>>,
) {
  const cols = Object.keys(fields) as (keyof typeof fields)[];
  if (!cols.length) return;
  adb()
    .prepare(`UPDATE quickbooks_connections SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE business_id = ?`)
    .run(...cols.map((c) => fields[c] ?? null), businessId);
}

export function removeQuickBooks(businessId: string) {
  adb().prepare('DELETE FROM quickbooks_connections WHERE business_id = ?').run(businessId);
}

// ---------------------------------------------------------------- housekeeping

/** Drop expired demos, sessions and sign-in links. Returns how many demos went. */
export function cleanUp(now = Date.now()): number {
  const d = adb();
  const demos = d.prepare('SELECT id FROM businesses WHERE demo = 1 AND expires_at < ?').all(now) as { id: string }[];
  for (const { id } of demos) deleteBusiness(id);
  d.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  d.prepare('DELETE FROM login_tokens WHERE expires_at < ?').run(now - DAY);
  d.prepare('DELETE FROM sent_emails WHERE sent_at < ?').run(now - 30 * DAY);
  return demos.length;
}
