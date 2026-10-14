import { requireBusiness } from '@/lib/auth';
import { handleInboundSms } from '@/lib/service';
import { verifyTwilioSignature } from '@/lib/providers';
import { twilioConfigured } from '@/lib/providers/sms';
import { baseUrl } from '@/lib/templates';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const twiml = (status = 200) =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });

/** Set this as the "A message comes in" webhook on your Twilio number or messaging service. */
export async function POST(req: Request) {
  enterBusiness(await requireBusiness());
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  if (twilioConfigured()) {
    const url = `${baseUrl()}/api/webhooks/twilio`;
    if (!verifyTwilioSignature(url, params, req.headers.get('x-twilio-signature'))) return twiml(403);
  }

  if (params.From && params.Body !== undefined) await handleInboundSms(params.From, params.Body);
  return twiml();
}
