import { advanceAction, resetDemoAction } from '@/app/actions';
import { formatDateTime } from '@/lib/format';
import { getClockOffset, getNow, getSettings } from '@/lib/settings';
import { DAY } from '@/lib/time';
import { SubmitButton } from './SubmitButton';

/** Time travel for the demo. Only rendered in demo mode (no real texts or emails). */
export function DemoStrip() {
  const { timezone } = getSettings();
  const ahead = Math.round(getClockOffset() / DAY);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-1 text-sm sm:px-6 lg:px-10">
      <span className="text-muted">
        <span className="font-semibold text-ink-2">Demo</span> · nothing is really sent · it’s{' '}
        <span className="num text-ink-2">{formatDateTime(getNow(), timezone)}</span>
        {ahead > 0 && <span className="text-marigold-ink"> (+{ahead} days)</span>}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <form action={advanceAction}>
          <input type="hidden" name="days" value="1" />
          <SubmitButton variant="ghost" size="sm" pendingLabel="…">+1 day</SubmitButton>
        </form>
        <form action={advanceAction}>
          <input type="hidden" name="days" value="7" />
          <SubmitButton variant="ghost" size="sm" pendingLabel="…">+7 days</SubmitButton>
        </form>
        <form action={resetDemoAction}>
          <SubmitButton variant="ghost" size="sm" pendingLabel="Resetting…" confirm="Reset the demo? This replaces all data with the sample business.">
            Reset demo
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
