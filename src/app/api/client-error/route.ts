import { z } from 'zod';
import { body, clientIp, route } from '@/server/http';
import { rateLimit } from '@/server/lib/rate-limit';
import { reportError } from '@/server/lib/report';

const input = z.object({ message: z.string().max(500), digest: z.string().max(80).optional(), path: z.string().max(200).optional() });

/** Receives errors caught by the app's browser-side error boundaries. Rate limited; only a message and a path are accepted. */
export const POST = route(async ({ req, db, requestId }) => {
  await rateLimit(db, `client-error:${clientIp(req)}`, 20, 3600);
  const b = await body(req, input);
  reportError(new Error(b.message), { requestId, route: (b.path ?? '').split('?')[0], source: 'browser' });
  return { ok: true };
});
