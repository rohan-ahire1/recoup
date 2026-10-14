import { currentTenant, hasTenant } from '../tenant';
import { resendConfigured } from './email';
import { stripeConfigured } from './payments';
import { twilioConfigured } from './sms';

export { sendSms, verifyTwilioSignature, type SendResult } from './sms';
export { sendEmail } from './email';
export { createCheckoutSession, retrieveCheckoutSession, verifyStripeSignature } from './payments';

export function providerStatus() {
  if (isDemoMode()) return { sms: 'mock', email: 'mock', payments: 'mock' } as const;
  return {
    sms: twilioConfigured() ? 'twilio' : 'mock',
    email: resendConfigured() ? 'resend' : 'mock',
    payments: stripeConfigured() ? 'stripe' : 'mock',
  } as const;
}

/**
 * Demo controls (fast-forwarding the clock, simulated replies and payments) only
 * exist in throwaway demo workspaces, which never send real texts or emails.
 */
export function isDemoMode(): boolean {
  return hasTenant() && currentTenant().demo;
}
