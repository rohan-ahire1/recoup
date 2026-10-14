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
}

const BUSINESS_COLS = 'b.id, b.name, b.demo, b.plan, b.created_at AS createdAt, b.expires_at AS expiresAt';
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

// ---------------------------------------------------------------- housekeeping

/** Drop expired demos, sessions and sign-in links. Returns how many demos went. */
export function cleanUp(now = Date.now()): number {
  const d = adb();
  const demos = d.prepare('SELECT id FROM businesses WHERE demo = 1 AND expires_at < ?').all(now) as { id: string }[];
  for (const { id } of demos) deleteBusiness(id);
  d.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  d.prepare('DELETE FROM login_tokens WHERE expires_at < ?').run(now - DAY);
  return demos.length;
}
