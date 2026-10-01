import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyStripeSignature } from '../lib/providers/payments';
import { verifyTwilioSignature } from '../lib/providers/sms';

afterEach(() => vi.unstubAllEnvs());

describe('Stripe webhook signatures', () => {
  const secret = 'whsec_test';
  const body = '{"type":"checkout.session.completed"}';
  const sign = (t: number, payload = body) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

  it('accepts a valid, fresh signature', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
    expect(verifyStripeSignature(body, sign(Math.floor(Date.now() / 1000)))).toBe(true);
  });

  it('rejects tampered bodies, stale timestamps, and missing config', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
    const now = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(body.replace('completed', 'expired'), sign(now))).toBe(false);
    expect(verifyStripeSignature(body, sign(now - 3600))).toBe(false);
    expect(verifyStripeSignature(body, null)).toBe(false);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect(verifyStripeSignature(body, sign(now))).toBe(false);
  });
});

describe('Twilio webhook signatures', () => {
  const url = 'https://example.com/api/webhooks/twilio';
  const params = { From: '+13125550142', Body: 'STOP', To: '+13125550000' };
  const sign = (token: string, p: Record<string, string> = params) =>
    createHmac('sha1', token)
      .update(url + Object.keys(p).sort().map((k) => k + p[k]).join(''))
      .digest('base64');

  it('accepts a valid signature and rejects anything else', () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok');
    expect(verifyTwilioSignature(url, params, sign('tok'))).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, Body: 'hi' }, sign('tok'))).toBe(false);
    expect(verifyTwilioSignature(url, params, sign('other'))).toBe(false);
    expect(verifyTwilioSignature(url, params, null)).toBe(false);
  });
});
