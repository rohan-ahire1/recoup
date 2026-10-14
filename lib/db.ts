import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { currentTenant } from './tenant';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_sets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tone TEXT NOT NULL,
  description TEXT,
  builtin INTEGER NOT NULL DEFAULT 0,
  templates TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'business',
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'email',
  tags TEXT NOT NULL DEFAULT '[]',
  template_set_id INTEGER REFERENCES template_sets(id) ON DELETE SET NULL,
  do_not_chase INTEGER NOT NULL DEFAULT 0,
  opted_out_sms INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  pay_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS customers_name ON customers(name COLLATE NOCASE);

-- One reminder sequence per customer, covering all their overdue invoices.
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER,
  paused_at INTEGER,
  promise_date TEXT,
  needs_attention INTEGER NOT NULL DEFAULT 0,
  attention_reason TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cases_customer ON cases(customer_id);
CREATE INDEX IF NOT EXISTS cases_status ON cases(status);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  issued_date TEXT,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  paid_date TEXT,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS installments (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  paid_at INTEGER,
  UNIQUE (case_id, seq)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  action_key TEXT,
  step INTEGER,
  tone TEXT,
  to_addr TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  provider_id TEXT,
  error TEXT,
  reply_kind TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
-- Each step of a case is prepared at most once, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS messages_action ON messages(case_id, action_key) WHERE action_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_customer ON messages(customer_id);
CREATE INDEX IF NOT EXISTS messages_status ON messages(status);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  installment_id INTEGER REFERENCES installments(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT,
  source TEXT NOT NULL,
  external_id TEXT UNIQUE,
  paid_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_customer ON payments(customer_id);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_customer ON events(customer_id);
`;

/**
 * Schema changes go here, one entry per version, never edited once shipped.
 * Each database records how far it got in PRAGMA user_version.
 */
const MIGRATIONS: string[] = [
  SCHEMA,
  `
-- Ids of records synced from QuickBooks, so later syncs update rather than duplicate.
ALTER TABLE customers ADD COLUMN qb_id TEXT;
ALTER TABLE invoices ADD COLUMN qb_id TEXT;
CREATE UNIQUE INDEX customers_qb ON customers(qb_id) WHERE qb_id IS NOT NULL;
CREATE UNIQUE INDEX invoices_qb ON invoices(qb_id) WHERE qb_id IS NOT NULL;
`,
];

export function migrate(d: DatabaseSync, migrations: string[]) {
  const current = Number((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  for (let v = current; v < migrations.length; v++) {
    d.exec('BEGIN');
    try {
      d.exec(migrations[v]);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec('COMMIT');
    } catch (err) {
      d.exec('ROLLBACK');
      throw err;
    }
  }
}

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}

export function openDatabase(file: string, migrations: string[]): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(d, migrations);
  return d;
}

export function businessDbFile(businessId: string): string {
  return path.join(dataDir(), 'tenants', `${businessId}.db`);
}

// Open handles, one per business, most recently used last.
const g = globalThis as unknown as { __recoupDbs?: Map<string, DatabaseSync> };
const open = (g.__recoupDbs ??= new Map());
const MAX_OPEN = 200;

/** The current business's database. */
export function db(): DatabaseSync {
  const { businessId } = currentTenant();
  let d = open.get(businessId);
  if (d) {
    open.delete(businessId);
  } else {
    d = openDatabase(businessDbFile(businessId), MIGRATIONS);
    if (open.size >= MAX_OPEN) closeBusinessDb(open.keys().next().value!);
  }
  open.set(businessId, d);
  return d;
}

export function closeBusinessDb(businessId: string) {
  open.get(businessId)?.close();
  open.delete(businessId);
}

/** Remove a business's data for good. */
export function deleteBusinessDb(businessId: string) {
  closeBusinessDb(businessId);
  const file = businessDbFile(businessId);
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
}

type Param = SQLInputValue;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Param[]) {
  const r = db().prepare(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}
