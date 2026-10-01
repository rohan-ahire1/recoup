/**
 * Links that open the owner's own mail or messaging app with a message ready to send.
 * Nothing is sent by Recoup; the owner presses send in their own app.
 */

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

const enc = encodeURIComponent;

export function gmailLink(d: Draft): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(d.to)}&su=${enc(d.subject)}&body=${enc(d.body)}`;
}

export function outlookLink(d: Draft): string {
  return `https://outlook.office.com/mail/deeplink/compose?to=${enc(d.to)}&subject=${enc(d.subject)}&body=${enc(d.body)}`;
}

export function mailtoLink(d: Draft): string {
  return `mailto:${enc(d.to).replace(/%40/g, '@')}?subject=${enc(d.subject)}&body=${enc(d.body)}`;
}

/** `?&body=` is the form both iOS and Android Messages accept. */
export function smsLink(phone: string, body: string): string {
  return `sms:${phone}?&body=${enc(body)}`;
}

export function copyText(d: { subject?: string | null; body: string }): string {
  return d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body;
}
