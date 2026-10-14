import { enterBusiness, type Tenant } from './tenant';

/** Until accounts land, every request belongs to one business. */
export function defaultTenant(): Tenant {
  return { businessId: process.env.DEFAULT_BUSINESS_ID || 'default', demo: false };
}

/**
 * The signed-in business for this request. Call it first in every page, layout,
 * server action and route handler that reads business data.
 */
export async function requireBusiness(): Promise<Tenant> {
  const t = defaultTenant();
  enterBusiness(t);
  return t;
}
