/**
 * Tells the operator something went wrong, through ntfy (a push notification
 * to their phone). Off unless NTFY_URL is set. The same alert goes out at most
 * once every 30 minutes, so a broken page can't flood the phone.
 */

const QUIET_MS = 30 * 60_000;
const g = globalThis as unknown as { __recoupAlerts?: Map<string, number> };
const lastSent = (g.__recoupAlerts ??= new Map());

export async function alert(title: string, message: string, now = Date.now()): Promise<boolean> {
  const url = process.env.NTFY_URL;
  if (!url) return false;
  const key = `${title}\n${message.slice(0, 200)}`;
  const last = lastSent.get(key);
  if (last !== undefined && now - last < QUIET_MS) return false;
  lastSent.set(key, now);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Title: `Recoup: ${title}`.replace(/[^\x20-\x7e]/g, ''), Priority: 'high', Tags: 'warning' },
      body: message.slice(0, 2000),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
