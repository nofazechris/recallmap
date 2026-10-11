import { z } from 'zod';
import { authedRoute, body } from '@/server/http';
import { clearRead, dismiss, markAllRead, markRead } from '@/server/services/notifications';

const op = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read'), ids: z.array(z.string().uuid()).max(100) }),
  z.object({ op: z.literal('unread'), ids: z.array(z.string().uuid()).max(100) }),
  z.object({ op: z.literal('dismiss'), ids: z.array(z.string().uuid()).max(100) }),
  z.object({ op: z.literal('read_all') }),
  z.object({ op: z.literal('clear_read') }),
]);

export const POST = authedRoute(async ({ req, db, userId }) => {
  const b = await body(req, op);
  if (b.op === 'read') await markRead(db, userId, b.ids, false);
  else if (b.op === 'unread') await markRead(db, userId, b.ids, true);
  else if (b.op === 'dismiss') await dismiss(db, userId, b.ids);
  else if (b.op === 'read_all') await markAllRead(db, userId);
  else await clearRead(db, userId);
  return { ok: true };
});
