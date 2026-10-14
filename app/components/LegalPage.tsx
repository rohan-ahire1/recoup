import { PublicShell } from './PublicShell';

export const supportEmail = () => process.env.SUPPORT_EMAIL || null;

/** A short, plain policy page. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <PublicShell wide>
      <article className="max-w-2xl [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_p]:text-muted [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted">
        <h1 className="display text-title font-bold">{title}</h1>
        <p className="text-sm text-faint">Last updated {updated}</p>
        {children}
      </article>
    </PublicShell>
  );
}

export function Contact() {
  const email = supportEmail();
  return email ? <a className="font-semibold text-teal underline" href={`mailto:${email}`}>{email}</a> : <>a reply to any email from Recoup</>;
}
