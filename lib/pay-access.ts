import { notFound } from 'next/navigation';
import { businessForPayToken, tenantOf } from './accounts';
import { enterBusiness } from './tenant';

/** Payment pages are public: the link itself says which business they belong to. */
export function enterPayLink(token: string) {
  const business = businessForPayToken(token);
  if (!business) notFound();
  enterBusiness(tenantOf(business));
  return business;
}
