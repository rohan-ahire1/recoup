import Link from 'next/link';
import { notFound } from 'next/navigation';
import { deleteTemplateAction, duplicateTemplateAction, updateTemplateAction } from '@/app/actions';
import { Icon } from '@/app/components/icons';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Chip, Panel } from '@/app/components/ui';
import { preview } from '@/lib/preview';
import { getTemplateSet } from '@/lib/repo';
import { STEPS, TEMPLATE_KEYS, type TemplateKey } from '@/lib/sequence';
import { getSettings } from '@/lib/settings';
import { TEMPLATE_VARIABLES } from '@/lib/templates';

export const dynamic = 'force-dynamic';

function stepTitle(key: TemplateKey) {
  if (key === 'installment') return 'Payment plan reminder · the day before each payment';
  const s = STEPS.find((x) => String(x.step) === key)!;
  return `Day ${s.day} · ${s.label}`;
}

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const set = getTemplateSet(Number(id));
  if (!set) notFound();
  const { businessName, senderName } = getSettings();
  const field = 'mt-1 block w-full rounded-[var(--radius-control)] bg-paper px-3 font-normal ring-1 ring-line ring-inset focus:ring-teal';

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/templates" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <Icon name="arrowLeft" size={16} /> Templates
      </Link>

      {set.builtin ? (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display text-[30px] font-bold">{set.name}</h1>
              <p className="text-muted">{set.description}</p>
            </div>
            <form action={duplicateTemplateAction}>
              <input type="hidden" name="baseId" value={set.id} />
              <SubmitButton variant="primary" icon="copy" pendingLabel="Copying…">Make my own version</SubmitButton>
            </form>
          </div>
          <div className="flex flex-col gap-5">
            {TEMPLATE_KEYS.map((key) => (
              <Panel key={key} className="p-6">
                <h2 className="mb-4 font-semibold">{stepTitle(key)}</h2>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <div>
                    <Chip>Email</Chip>
                    <div className="mt-2 rounded-[4px_16px_16px_16px] bg-linen/60 px-4 py-3 text-sm leading-relaxed">
                      <div className="mb-1 font-semibold">{preview(set.templates[key].subject, businessName, senderName)}</div>
                      <p className="whitespace-pre-wrap text-ink-2">{preview(set.templates[key].email, businessName, senderName)}</p>
                    </div>
                  </div>
                  <div>
                    <Chip>Text</Chip>
                    <p className="mt-2 rounded-[16px_16px_4px_16px] bg-teal-soft px-4 py-3 text-sm leading-relaxed text-ink-2">{preview(set.templates[key].sms, businessName, senderName)}</p>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </>
      ) : (
        <form action={updateTemplateAction} className="flex flex-col gap-5">
          <input type="hidden" name="id" value={set.id} />
          <Panel className="flex flex-col gap-3 p-6 text-sm font-semibold">
            <div className="flex items-center justify-between">
              <h1 className="display text-[26px] font-bold">Edit template</h1>
              {saved && <span className="text-sm font-semibold text-teal">Saved</span>}
            </div>
            <label>Name<input name="name" defaultValue={set.name} required className={`${field} h-11`} /></label>
            <label>Style note<input name="description" defaultValue={set.description ?? ''} placeholder="Shown when picking a tone" className={`${field} h-11`} /></label>
            <p className="font-normal text-muted">
              Placeholders fill in automatically:{' '}
              {TEMPLATE_VARIABLES.map((v) => (
                <code key={v} className="mr-1 inline-block rounded bg-linen px-1.5 py-0.5 text-xs text-ink-2">{`{${v}}`}</code>
              ))}
            </p>
          </Panel>
          {TEMPLATE_KEYS.map((key) => (
            <Panel key={key} className="flex flex-col gap-3 p-6 text-sm font-semibold">
              <h2 className="text-base">{stepTitle(key)}</h2>
              <label>Email subject<input name={`${key}.subject`} defaultValue={set.templates[key].subject} className={`${field} h-11`} /></label>
              <label>Email<textarea name={`${key}.email`} defaultValue={set.templates[key].email} rows={8} className={`${field} py-2 leading-relaxed`} /></label>
              <label>
                Text message <span className="font-normal text-faint">· keep it under 300 characters and end with “Reply STOP to opt out.”</span>
                <textarea name={`${key}.sms`} defaultValue={set.templates[key].sms} rows={3} className={`${field} py-2 leading-relaxed`} />
              </label>
            </Panel>
          ))}
          <div className="sticky bottom-4 flex flex-wrap justify-between gap-2 rounded-[var(--radius-panel)] bg-paper/95 p-3 shadow-[var(--shadow-lift)] backdrop-blur">
            <SubmitButton variant="primary" pendingLabel="Saving…">Save template</SubmitButton>
          </div>
        </form>
      )}
      {!set.builtin && (
        <form action={deleteTemplateAction} className="mt-4">
          <input type="hidden" name="id" value={set.id} />
          <SubmitButton variant="danger" size="sm" icon="trash" confirm="Delete this template? Customers using it switch to the default." pendingLabel="Deleting…">
            Delete template
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
