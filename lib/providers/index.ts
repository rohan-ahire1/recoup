import { resendConfigured } from './email';
import { stripeConfigured } from './payments';
import { twilioConfigured } from './sms';

export { sendSms, verifyTwilioSignature, type SendResult } from './sms';
export { sendEmail } from './email';
export { createCheckoutSession, retrieveCheckoutSession, verifyStripeSignature } from './payments';

export function providerStatus() {
  return {
    sms: twilioConfigured() ? 'twilio' : 'mock',
    email: resendConfigured() ? 'resend' : 'mock',
    payments: stripeConfigured() ? 'stripe' : 'mock',
  } as const;
}

/**
 * Demo controls (fast-forwarding the clock, simulated replies and payments) are
 * on when texts and emails aren't really being sent, so fast-forwarding can't
 * spam real customers. DEMO_MODE=1 or 0 overrides.
 */
export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === '1') return true;
  if (process.env.DEMO_MODE === '0') return false;
  const p = providerStatus();
  return p.sms === 'mock' && p.email === 'mock';
}
