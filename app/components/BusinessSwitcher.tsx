import { switchBusinessAction } from '@/app/account-actions';
import type { Business } from '@/lib/accounts';

/** Shown in the header when someone belongs to more than one business. */
export function BusinessSwitcher({ businesses, currentId }: { businesses: Business[]; currentId: string }) {
  return (
    <details className="relative">
      <summary className="ease flex h-10 cursor-pointer list-none items-center rounded-full px-3 text-sm font-semibold text-muted hover:bg-linen hover:text-ink">
        Switch
      </summary>
      <ul className="absolute right-0 z-50 mt-1 min-w-52 rounded-block bg-paper p-1 shadow-[var(--shadow-lift)] ring-1 ring-edge ring-inset">
        {businesses.map((b) => (
          <li key={b.id}>
            <form action={switchBusinessAction}>
              <input type="hidden" name="businessId" value={b.id} />
              <button
                type="submit"
                aria-current={b.id === currentId ? 'true' : undefined}
                className="ease w-full truncate rounded-control px-3 py-2 text-left text-sm text-ink hover:bg-linen aria-[current=true]:font-semibold"
              >
                {b.name}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
