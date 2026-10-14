import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updateCustomerAction } from '@/app/actions';
import { Icon } from '@/app/components/icons';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Avatar, FIELD, Panel } from '@/app/components/ui';
import { requireBusiness } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import { getCustomer } from '@/lib/repo';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  enterBusiness(await requireBusiness());
  const { id } = await params;
  const customer = getCustomer(Number(id));
  if (!customer) notFound();
  const field = `mt-1 h-11 ${FIELD}`;
  const pill = 'flex h-10 cursor-pointer items-center rounded-full px-4 font-normal ring-1 ring-line ring-inset has-[:checked]:bg-ink has-[:checked]:text-sand has-[:checked]:ring-ink';

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/customers/${customer.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <Icon name="arrowLeft" size={16} /> {customer.name}
      </Link>
      <Panel className="p-6 sm:p-7">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={customer.name} type={customer.type} size={52} />
          <h1 className="display text-title font-bold">Edit details</h1>
        </div>
        <form action={updateCustomerAction} className="grid gap-4 text-sm font-semibold sm:grid-cols-2">
          <input type="hidden" name="customerId" value={customer.id} />
          <label className="sm:col-span-2">Name<input name="name" defaultValue={customer.name} required className={field} /></label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5">This customer is</legend>
            <div className="flex gap-2">
              {(['business', 'individual'] as const).map((v) => (
                <label key={v} className={pill}>
                  <input type="radio" name="type" value={v} defaultChecked={customer.type === v} className="sr-only" />
                  {v === 'business' ? 'A business' : 'An individual'}
                </label>
              ))}
            </div>
          </fieldset>
          <label>Contact person<input name="contactName" defaultValue={customer.contactName ?? ''} placeholder="Who you deal with" className={field} /></label>
          <label>Email<input name="email" type="email" defaultValue={customer.email ?? ''} className={field} /></label>
          <label>Phone<input name="phone" type="tel" defaultValue={customer.phone ? formatPhone(customer.phone) : ''} className={field} /></label>
          <fieldset>
            <legend className="mb-1.5">Remind them by</legend>
            <div className="flex gap-2">
              {(['email', 'sms'] as const).map((v) => (
                <label key={v} className={pill}>
                  <input type="radio" name="preferredChannel" value={v} defaultChecked={customer.preferredChannel === v} className="sr-only" />
                  {v === 'email' ? 'Email' : 'Text'}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="sm:col-span-2">
            Tags <span className="font-normal text-faint">· separate with commas</span>
            <input name="tags" defaultValue={customer.tags.join(', ')} placeholder="Café, VIP" className={field} />
          </label>
          <label className="sm:col-span-2">
            Notes <span className="font-normal text-faint">· only you see these</span>
            <textarea name="notes" defaultValue={customer.notes ?? ''} rows={3} className={`${field} h-auto py-2`} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <SubmitButton variant="primary" pendingLabel="Saving…">Save details</SubmitButton>
            <Link href={`/customers/${customer.id}`} className="ease inline-flex h-11 items-center rounded-control px-4 text-muted hover:bg-linen hover:text-ink">Cancel</Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
