import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { allow } from '@/lib/rate-limit';
import { importCsv, previewImport } from '@/lib/service';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5_000_000;
const MAX_ROWS = 10_000;

/** POST { csv, dryRun? } as JSON, or a raw text/csv body with ?dryRun=1 */
export async function POST(req: Request) {
  const { businessId } = enterBusiness(await requireBusiness());
  if (!allow(`import:${businessId}`, 60, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many imports at once. Wait a few minutes and try again.' }, { status: 429 });
  }
  if (Number(req.headers.get('content-length')) > MAX_BYTES * 1.1) {
    return NextResponse.json({ error: 'That file is too large (5 MB max).' }, { status: 413 });
  }
  const url = new URL(req.url);
  let csv: string;
  let dryRun = url.searchParams.get('dryRun') === '1';
  if (req.headers.get('content-type')?.includes('application/json')) {
    const body = (await req.json()) as { csv?: string; dryRun?: boolean };
    csv = body.csv ?? '';
    dryRun = dryRun || Boolean(body.dryRun);
  } else {
    csv = await req.text();
  }
  if (!csv.trim()) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });
  if (csv.length > MAX_BYTES) return NextResponse.json({ error: 'That file is too large (5 MB max).' }, { status: 413 });

  let lines = 0;
  for (let i = csv.indexOf('\n'); i !== -1 && lines <= MAX_ROWS; i = csv.indexOf('\n', i + 1)) lines++;
  if (lines > MAX_ROWS) {
    return NextResponse.json({ error: `That file has more than ${MAX_ROWS.toLocaleString('en-US')} rows. Split it into smaller files.` }, { status: 413 });
  }

  if (dryRun) return NextResponse.json(previewImport(csv));
  const result = await importCsv(csv);
  if (result.missingColumns.length) {
    return NextResponse.json({ error: `Missing columns: ${result.missingColumns.join(', ')}`, ...result }, { status: 400 });
  }
  return NextResponse.json(result);
}
