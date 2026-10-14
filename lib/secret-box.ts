import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encrypts secrets we must keep (QuickBooks tokens) with AES-256-GCM, so a
 * copied database alone doesn't hand them over. TOKEN_ENCRYPTION_KEY is 32
 * random bytes in base64: `openssl rand -base64 32`.
 */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  const k = raw ? Buffer.from(raw, 'base64') : null;
  if (!k || k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes in base64');
  return k;
}

export function secretBoxReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function open(sealed: string): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Not a sealed secret');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}
