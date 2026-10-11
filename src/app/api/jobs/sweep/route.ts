import { route } from '@/server/http';
import { env } from '@/server/config';
import { HttpError } from '@/server/lib/errors';
import { sweep } from '@/server/services/jobs';
import { sendDueReminders } from '@/server/services/reminders';

/** Called by your scheduler (e.g. a Vercel cron) to recover stuck jobs and run anything that's due. */
export const POST = route(async ({ req, db }) => {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized', 'Invalid cron credentials.');
  return { ran: await sweep(db, 10), reminders: await sendDueReminders(db) };
});
export const GET = POST;
