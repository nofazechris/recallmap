import type { Instrumentation } from 'next';

/** Next.js calls this for errors thrown while rendering pages, layouts and route handlers. */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return; // the reporter uses server-only modules
  const { reportError } = await import('./server/lib/report');
  reportError(err, { route: request.path.split('?')[0], source: 'render' });
};
