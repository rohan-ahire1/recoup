import { enterPayLink } from '@/lib/pay-access';
import { allow } from '@/lib/rate-limit';
import { getCustomerByToken } from '@/lib/repo';
import { unsubscribeEmail } from '@/lib/service';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">${esc(title)}</h1>${body}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** The confirm page. It never opts anyone out: mail scanners follow links. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  enterPayLink(token);
  const customer = getCustomerByToken(token);
  if (!customer) return page('Not found', '', 404);
  if (!allow(`unsubscribe:${token}`, 20, 60 * 60_000)) return page('Too many tries', '<p>Please wait a little and try again.</p>', 429);
  const business = esc(getSettings().businessName.replace(/\.$/, ''));
  if (customer.optedOutEmail) return page('You’re unsubscribed', `<p>${business} won’t send you more reminder emails.</p>`);
  return page(
    'Unsubscribe from reminder emails?',
    `<p>You’ll stop getting payment reminder emails from ${business}.</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit" style="font:inherit;padding:.6rem 1.2rem;cursor:pointer">Unsubscribe</button></form>`,
  );
}

/** One-click unsubscribe (RFC 8058), and the button on the confirm page. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  enterPayLink(token);
  const customer = getCustomerByToken(token);
  if (!customer) return page('Not found', '', 404);
  if (!allow(`unsubscribe:${token}`, 20, 60 * 60_000)) return page('Too many tries', '<p>Please wait a little and try again.</p>', 429);
  const body = new URLSearchParams(await req.text());
  if (body.get('List-Unsubscribe') !== 'One-Click') return page('Bad request', '', 400);
  unsubscribeEmail(customer.id);
  return page('You’re unsubscribed', `<p>${esc(getSettings().businessName.replace(/\.$/, ''))} won’t send you more reminder emails.</p>`);
}
