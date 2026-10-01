import { sampleUploadCsv } from '@/lib/sample';

export const dynamic = 'force-dynamic';

/** A small file with history, for trying the importer. ?download=1 saves it. */
export async function GET(req: Request) {
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(sampleUploadCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      ...(download ? { 'Content-Disposition': 'attachment; filename="recoup-template.csv"' } : {}),
    },
  });
}
