import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Every business has its own database. The business a piece of code works on is
 * carried in async context, so lib/ code never takes a business id argument and
 * can't be pointed at the wrong one by mistake.
 */
export interface Tenant {
  businessId: string;
  /** Throwaway demo workspace: time travel on, nothing is ever really sent. */
  demo: boolean;
}

const ID = /^[a-z0-9_-]{1,64}$/;

// Shared across Next's server bundles, which can each load this module.
const g = globalThis as unknown as { __recoupTenant?: AsyncLocalStorage<Tenant> };
const store = (g.__recoupTenant ??= new AsyncLocalStorage<Tenant>());

function check(t: Tenant): Tenant {
  if (!ID.test(t.businessId)) throw new Error(`Invalid business id: ${t.businessId}`);
  return t;
}

/** The business this request is for. Throws outside a business, so nothing reads a database by accident. */
export function currentTenant(): Tenant {
  const t = store.getStore();
  if (!t) throw new Error('No business selected for this request');
  return t;
}

export function hasTenant(): boolean {
  return store.getStore() !== undefined;
}

/** Run fn as a business. Use in server actions, route handlers, cron, scripts and tests. */
export function runAsBusiness<T>(t: Tenant, fn: () => T): T {
  return store.run(check(t), fn);
}

/** Switch the rest of this async flow to a business. Use at the top of pages and layouts. */
export function enterBusiness(t: Tenant) {
  store.enterWith(check(t));
}
