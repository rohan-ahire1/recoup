import type { Instrumentation } from 'next';

/** Any unexpected server error (a 500) sends an alert. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { alert } = await import('./lib/alert');
  const e = err as Error & { digest?: string };
  await alert('server error', `${request.method} ${request.path} (${context.routeType})\n${e.message ?? String(err)}${e.digest ? `\ndigest ${e.digest}` : ''}`);
};
