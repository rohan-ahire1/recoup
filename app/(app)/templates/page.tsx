import Link from 'next/link';
import { createTemplateWithAIAction, duplicateTemplateAction, setDefaultTemplateAction } from '@/app/actions';
import { AutoSubmitForm } from '@/app/components/AutoSubmit';
import { Icon } from '@/app/components/icons';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Chip, FIELD, PageTitle, Panel, PremiumTeaser } from '@/app/components/ui';
import { aiEnabled } from '@/lib/ai';
import { requireBusiness } from '@/lib/auth';
import { preview } from '@/lib/preview';
import { listTemplateSets, type TemplateSet } from '@/lib/repo';
import { getSettings } from '@/lib/settings';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Each card spans four rows of the parent grid (subgrid) so previews and buttons line up across a row. */
function SetCard({ set, isDefault, businessName, senderName }: { set: TemplateSet; isDefault: boolean; businessName: string; senderName: string }) {
  return (
    <Panel as="article" className="row-span-4 grid grid-rows-subgrid gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="display text-section font-bold">{set.name}</h3>
          <p className="text-muted">{set.description ?? 'Your own template'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone={set.builtin ? 'linen' : 'outline'}>{set.builtin ? 'Built in' : 'Yours'}</Chip>
          {isDefault && <span className="text-xs font-semibold text-teal">Default</span>}
        </div>
      </div>
      <div className="rounded-block rounded-tl-tail bg-linen/60 px-4 py-3 text-sm leading-relaxed text-ink-2">
        <div className="mb-1 font-semibold text-ink">{preview(set.templates['1'].subject, businessName, senderName)}</div>
        <p className="line-clamp-5 whitespace-pre-wrap">{preview(set.templates['1'].email, businessName, senderName)}</p>
      </div>
      <p className="text-[13px] text-faint">Day 1 email shown. Includes all 4 steps and plan reminders, by email and text.</p>
      {/* Stacked, with the ghost button pulled left so both labels share one edge. */}
      <div className="flex flex-col items-start gap-1 self-end">
        <Link href={`/templates/${set.id}`} className="ease inline-flex h-9 items-center gap-1.5 rounded-control bg-linen px-3 text-sm font-semibold hover:bg-linen-2">
          {set.builtin ? 'Read every step' : <><Icon name="edit" size={15} /> Edit</>}
        </Link>
        {set.builtin && (
          <form action={duplicateTemplateAction}>
            <input type="hidden" name="baseId" value={set.id} />
            <SubmitButton size="sm" variant="ghost" icon="copy" className="-ml-3" pendingLabel="Copying…">Make my own version</SubmitButton>
          </form>
        )}
      </div>
    </Panel>
  );
}

export default async function TemplatesPage() {
  enterBusiness(await requireBusiness());
  const sets = listTemplateSets();
  const { defaultTemplateSet, businessName, senderName } = getSettings();
  const builtin = sets.filter((s) => s.builtin);
  const mine = sets.filter((s) => !s.builtin);
  const ai = aiEnabled();

  return (
    <>
      <PageTitle title="Templates" sub="How your reminders sound. Pick a tone per customer, or let Recoup choose from how they’ve paid before." />

      <Panel className="mb-8 p-6">
        <AutoSubmitForm action={setDefaultTemplateAction} className="flex flex-col gap-3">
          <div className="font-semibold">For customers without their own tone, use</div>
          <div className="flex flex-wrap gap-2">
            <label className="ease flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 ring-1 ring-line ring-inset has-[:checked]:bg-ink has-[:checked]:text-sand has-[:checked]:ring-ink">
              <input type="radio" name="id" value="auto" defaultChecked={defaultTemplateSet === 'auto'} className="sr-only" />
              <Icon name="sparkle" size={16} /> Auto: Friendly for good payers, Firm for chronic late ones
            </label>
            {sets.map((s) => (
              <label key={s.id} className="ease flex cursor-pointer items-center rounded-full px-4 py-2 ring-1 ring-line ring-inset has-[:checked]:bg-ink has-[:checked]:text-sand has-[:checked]:ring-ink">
                <input type="radio" name="id" value={s.id} defaultChecked={defaultTemplateSet === s.id} className="sr-only" />
                {s.name}
              </label>
            ))}
          </div>
        </AutoSubmitForm>
      </Panel>

      <h2 className="display mb-4 text-section font-bold">Tones</h2>
      <div className="mb-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {builtin.map((s) => (
          <SetCard key={s.id} set={s} isDefault={defaultTemplateSet === s.id} businessName={businessName} senderName={senderName} />
        ))}
      </div>

      <h2 className="display mb-4 text-section font-bold">Your templates</h2>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {mine.map((s) => (
          <SetCard key={s.id} set={s} isDefault={defaultTemplateSet === s.id} businessName={businessName} senderName={senderName} />
        ))}
        <Panel className="row-span-4 flex flex-col gap-4 p-6">
          <h3 className="display text-section font-bold">Write a new one</h3>
          {ai ? (
            <form action={createTemplateWithAIAction} className="flex flex-col gap-3 text-sm font-semibold">
              <label>
                Name
                <input name="name" required placeholder="Neighborly" className={`mt-1 h-11 ${FIELD}`} />
              </label>
              <label>
                Describe the style
                <textarea name="description" required rows={3} placeholder="Short and warm, like a note from a neighbor. First names, no corporate phrases." className={`mt-1 py-2 ${FIELD}`} />
              </label>
              <SubmitButton variant="primary" icon="sparkle" pendingLabel="Writing every step…">Write it with AI</SubmitButton>
            </form>
          ) : (
            <PremiumTeaser title="Describe a style, get every step" detail="AI writes all four reminders and plan notes, by email and text." />
          )}
          <p className="text-sm text-muted">Or start from a tone above with <span className="font-semibold text-ink">Make my own version</span> and edit the words yourself.</p>
        </Panel>
      </div>
    </>
  );
}
