import { currentTenant, hasTenant } from '../tenant';
import { resendConfigured } from './email';

export type { SendResult } from './email';

export function providerStatus() {
  return { email: !isDemoMode() && resendConfigured() ? 'resend' : 'mock' } as const;
}

/**
 * Demo controls (fast-forwarding the clock, simulated replies and payments) only
 * exist in throwaway demo workspaces, which never send real email.
 */
export function isDemoMode(): boolean {
  return hasTenant() && currentTenant().demo;
}
