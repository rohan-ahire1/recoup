/**
 * Fixed-window counters in memory. Recoup runs as one process, so this is
 * enough to stop someone hammering sign-in or payment pages.
 */
const g = globalThis as unknown as { __recoupLimits?: Map<string, { count: number; resetAt: number }> };
const hits = (g.__recoupLimits ??= new Map());

/** True if this attempt is allowed. */
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || h.resetAt <= now) {
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  h.count++;
  return h.count <= max;
}
