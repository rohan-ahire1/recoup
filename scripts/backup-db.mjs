// Consistent copies of every Recoup database: accounts.db and each business's
// tenants/<id>.db, written with VACUUM INTO (safe while the app is running).
// Usage: node scripts/backup-db.mjs <data dir> <backup dir> [days to keep]
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [dataDir, backupRoot, keepArg] = process.argv.slice(2);
if (!dataDir || !backupRoot) {
  console.error('Usage: node scripts/backup-db.mjs <data dir> <backup dir> [days to keep]');
  process.exit(2);
}
const keepDays = Number(keepArg) || 14;
const stamp = new Date().toISOString().slice(0, 10);
const dest = path.join(backupRoot, stamp);
const tmp = `${dest}.partial`;
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, 'tenants'), { recursive: true, mode: 0o700 });

const files = [path.join(dataDir, 'accounts.db')];
const tenantsDir = path.join(dataDir, 'tenants');
if (fs.existsSync(tenantsDir)) {
  for (const f of fs.readdirSync(tenantsDir)) if (f.endsWith('.db')) files.push(path.join(tenantsDir, f));
}

let copied = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const out = path.join(tmp, path.relative(dataDir, file));
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    db.prepare('VACUUM INTO ?').run(out);
  } finally {
    db.close();
  }
  // Prove the copy opens and is intact.
  const check = new DatabaseSync(out, { readOnly: true });
  const { integrity_check: ok } = check.prepare('PRAGMA integrity_check').get();
  check.close();
  if (ok !== 'ok') throw new Error(`Backup of ${file} failed its integrity check: ${ok}`);
  fs.chmodSync(out, 0o600);
  copied++;
}

fs.rmSync(dest, { recursive: true, force: true });
fs.renameSync(tmp, dest);

// Keep the last N days.
const cutoff = Date.now() - keepDays * 86_400_000;
for (const d of fs.readdirSync(backupRoot)) {
  const t = Date.parse(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && t < cutoff) fs.rmSync(path.join(backupRoot, d), { recursive: true, force: true });
}
console.log(`Backed up ${copied} database(s) to ${dest}`);
