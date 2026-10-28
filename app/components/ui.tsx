import Link from 'next/link';
import { CASE_LABELS, initials } from '@/lib/format';
import { RELIABILITY_LABELS, type Reliability } from '@/lib/history';
import type { CustomerState } from '@/lib/service';
import { Icon, type IconName } from './icons';
import { StickyBar } from './StickyBar';

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
  lift = false,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside' | 'article';
  lift?: boolean;
  id?: string;
}) {
  return <Tag id={id} className={`rounded-panel bg-paper ring-1 ring-edge ring-inset ${lift ? 'shadow-[var(--shadow-lift)]' : ''} ${className}`}>{children}</Tag>;
}

/** Every field you type into or pick from. One place, so borders and focus never drift. */
export const FIELD = 'block w-full rounded-control bg-paper px-3 font-normal ring-1 ring-field ring-inset placeholder:text-faint focus:ring-teal';

/**
 * Headline money: the figure big, the currency sign smaller and quieter.
 * Inherits colour, so it works on paper and on teal. Long amounts shrink to fit
 * their column (e.g. $12,480.50 in the customer sidebar); short ones stay at 56px.
 */
export function BigMoney({ value, className = '' }: { value: string; className?: string }) {
  const m = /^(-?)([^\d-]+)(.*)$/.exec(value);
  const glyphs = (m ? m[1].length + m[3].length : value.length) + 0.5;
  const fit = `min(var(--text-money), ${(100 / (0.62 * glyphs)).toFixed(1)}cqi)`;
  return (
    <div className={`@container ${className}`}>
      <span className="display num flex items-start text-money font-bold" style={{ fontSize: fit }}>
        {m ? (
          <>
            {m[1]}
            <span className="mt-[0.12em] mr-0.5 text-[0.5em] font-semibold opacity-70" aria-hidden="true">{m[2]}</span>
            <span className="sr-only">{m[2]}</span>
            {m[3]}
          </>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-title font-bold text-balance">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BUTTON = {
  primary: 'bg-ink text-sand hover:bg-ink-2',
  teal: 'bg-teal text-paper hover:bg-teal-strong',
  quiet: 'bg-linen text-ink hover:bg-linen-2',
  outline: 'bg-paper text-ink ring-1 ring-line ring-inset hover:bg-linen/60',
  danger: 'bg-paper text-rust ring-1 ring-line ring-inset hover:bg-rust-soft',
  ghost: 'bg-transparent text-muted hover:bg-linen hover:text-ink',
} as const;

export type ButtonVariant = keyof typeof BUTTON;

export function buttonClass(variant: ButtonVariant = 'quiet', size: 'sm' | 'md' | 'lg' = 'md') {
  const sizes = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 text-[15px] gap-2', lg: 'h-[52px] px-5 text-base gap-2' };
  return `ease inline-flex items-center justify-center rounded-control font-semibold active:scale-[0.98] disabled:active:scale-100 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-55 ${sizes[size]} ${BUTTON[variant]}`;
}

export function ButtonLink({
  href,
  children,
  variant = 'quiet',
  size = 'md',
  icon,
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  className?: string;
}) {
  return (
    <Link href={href} className={`${buttonClass(variant, size)} ${className}`}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </Link>
  );
}

export function Chip({ children, tone = 'linen' }: { children: React.ReactNode; tone?: 'linen' | 'outline' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] whitespace-nowrap ${
        tone === 'linen' ? 'bg-linen text-ink-2' : 'text-muted ring-1 ring-line ring-inset'
      }`}
    >
      {children}
    </span>
  );
}

const STATE_STYLE: Record<CustomerState, string> = {
  active: 'bg-teal-soft text-teal-strong',
  needs_you: 'bg-marigold text-ink',
  promised: 'bg-marigold-wash text-marigold-ink',
  disputed: 'bg-rust-soft text-rust',
  paused: 'bg-linen text-muted',
  plan: 'bg-teal-soft text-teal-strong',
  unreachable: 'bg-linen text-muted',
  resolved: 'bg-linen text-muted',
  clear: 'bg-linen text-muted',
  not_chasing: 'bg-linen text-muted',
  not_due: 'bg-linen text-muted',
};

export function StatePill({ state }: { state: CustomerState }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap ${STATE_STYLE[state]}`}>
      {CASE_LABELS[state]}
    </span>
  );
}

export function ReliabilityDot({ reliability }: { reliability: Reliability }) {
  const color = { new: 'bg-linen-2', reliable: 'bg-teal', sometimes_late: 'bg-marigold', often_late: 'bg-rust' }[reliability];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-muted">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      {RELIABILITY_LABELS[reliability]}
    </span>
  );
}

const AVATAR_TONES = ['bg-marigold-soft text-marigold-ink', 'bg-teal-soft text-teal-strong', 'bg-linen-2 text-ink-2', 'bg-rust-soft text-rust'];

export function Avatar({ name, type, size = 44 }: { name: string; type: 'business' | 'individual'; size?: number }) {
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={`display inline-flex shrink-0 items-center justify-center font-bold ${tone} ${type === 'business' ? 'rounded-[30%]' : 'rounded-full'}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** Dots for each paid invoice: teal on time, marigold late, ringed = still open. */
export function TrackDots({ lateness, open = 0 }: { lateness: number[]; open?: number }) {
  const shown = lateness.slice(-18);
  return (
    <div className="flex flex-wrap items-center gap-1" role="img" aria-label={`${lateness.filter((d) => d <= 2).length} of ${lateness.length} paid on time`}>
      {shown.map((d, i) => (
        <span
          key={i}
          title={d <= 2 ? 'Paid on time' : `Paid ${d} days late`}
          className={`h-3.5 w-3.5 rounded-full ${d <= 2 ? 'bg-teal' : 'bg-marigold'}`}
        />
      ))}
      {Array.from({ length: open }, (_, i) => (
        <span key={`o${i}`} title="Still open" className="h-3.5 w-3.5 rounded-full ring-2 ring-marigold ring-inset" />
      ))}
    </div>
  );
}

export function PremiumBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-marigold-soft px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-marigold-ink">
      <Icon name="sparkle" size={13} />
      Premium · soon
    </span>
  );
}

/** Where an AI feature will live. Hidden entirely once AI is configured (the feature renders instead). */
export function PremiumTeaser({ title, detail }: { title: string; detail: string }) {
  return (
    // Sized by its own width, not the page's: in a narrow card the badge drops under the text instead of squeezing it.
    <div className="@container rounded-block border-[1.5px] border-dashed border-linen-2 px-4 py-3">
      <div className="flex items-start gap-3 @md:items-center">
        <Icon name="sparkle" className="mt-0.5 shrink-0 text-marigold-ink @md:mt-0" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2 @md:flex-row @md:items-center @md:justify-between @md:gap-4">
          <div className="text-sm">
            <div className="font-semibold">{title}</div>
            <div className="text-muted">{detail}</div>
          </div>
          <PremiumBadge />
        </div>
      </div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-panel border-[1.5px] border-dashed border-linen-2 px-6 py-12 text-center">
      <p className="display text-section font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Why automatic email is held back right now, from `sendingBlocked`. Renders nothing when it isn't. */
export function SendingHold({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <p className="rounded-block bg-marigold-soft px-4 py-3 text-sm text-ink">
      <span className="font-semibold">Automatic email is on hold.</span> {reason} New reminders wait in To send for you to send yourself.
    </p>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className="display num mt-0.5 text-heading font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-faint">{sub}</div>}
    </div>
  );
}

/**
 * The pinned top of a list page: title, totals, actions and filters. It spans the
 * page's side padding with a sand backdrop so rows scroll cleanly underneath.
 */
export function ListToolbar({ children, flush = true }: { children: React.ReactNode; flush?: boolean }) {
  return (
    <StickyBar
      varName="--toolbar-h"
      className={`sticky-toolbar -mx-4 -mt-6 bg-sand/95 px-4 pt-6 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 ${flush ? 'pb-0' : 'pb-4'}`}
    >
      {children}
    </StickyBar>
  );
}
