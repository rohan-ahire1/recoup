import { afterEach, describe, expect, it, vi } from 'vitest';
import { alert } from '../lib/alert';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NTFY_URL;
});

describe('alerts', () => {
  it('do nothing without NTFY_URL', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await alert('x', 'y')).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('send once, then stay quiet about the same problem for 30 minutes', async () => {
    process.env.NTFY_URL = 'https://ntfy.test/topic';
    const f = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', f);
    const t = 1_000_000;
    expect(await alert('server error', 'boom', t)).toBe(true);
    expect(await alert('server error', 'boom', t + 60_000)).toBe(false);
    expect(await alert('server error', 'other', t + 60_000)).toBe(true);
    expect(await alert('server error', 'boom', t + 31 * 60_000)).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
  });
});
