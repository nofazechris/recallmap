import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { notifications, topics } from '../db/schema';
import { appUrl, emailConfigured, sendEmail } from '../lib/email';
import { dayKey, startOfDay } from '../lib/days';
import { log } from '../lib/log';
import { studyDays } from './activity';
import { notify } from './notifications';
import { dueCounts } from './study';
import { escapeHtml } from './users';

export const REMINDER_HOUR = 9;

/**
 * Daily "you have cards due" nudge, sent once per learner per local day at about 9am in THEIR timezone.
 * Safe to run as often as you like (the cron calls it every few minutes): it skips anyone already reminded today,
 * anyone with nothing due, and anyone who has already studied today. Honours the "Daily review reminder" setting.
 */
export async function sendDueReminders(db: Db, now = new Date(), limit = 200): Promise<number> {
  const candidates = (await db.execute(sql`
    select p.user_id as id, p.timezone as tz, u.email as email, (u.email_verified_at is not null) as verified
    from profiles p join users u on u.id = p.user_id
    where p.onboarded and coalesce((p.prefs->>'remindDaily')::boolean, true)
      and extract(hour from (${now}::timestamptz at time zone p.timezone))::int = ${REMINDER_HOUR}
    limit ${limit}`)).rows as { id: string; tz: string; email: string; verified: boolean }[];

  let sent = 0;
  for (const c of candidates) {
    try {
      const today = dayKey(now, c.tz);
      const [already] = await db.select({ id: notifications.id }).from(notifications)
        .where(and(eq(notifications.userId, c.id), eq(notifications.type, 'due'), gte(notifications.createdAt, startOfDay(today, c.tz)))).limit(1);
      if (already) continue;
      if ((await studyDays(db, c.id, c.tz)).has(today)) continue;

      const due = await dueCounts(db, c.id, now);
      const total = [...due.values()].reduce((n, x) => n + x, 0);
      if (!total) continue;
      const [topId] = [...due.entries()].sort((a, b) => b[1] - a[1])[0];
      const [t] = await db.select({ title: topics.title }).from(topics).where(eq(topics.id, topId)).limit(1);

      await notify(db, c.id, 'due', `<strong>${total} ${total === 1 ? 'card is' : 'cards are'} due</strong> for review — start with ${escapeHtml(t?.title ?? 'your topics')}.`, `/study/${topId}`);
      if (emailConfigured() && c.verified) {
        await sendEmail({ to: c.email, subject: `${total} ${total === 1 ? 'card is' : 'cards are'} due for review`, text: `You have ${total} ${total === 1 ? 'card' : 'cards'} due. A few minutes keeps them fresh:\n\n${appUrl()}/study/${topId}\n\nTurn these reminders off any time in Settings → Notifications.` }).catch(() => undefined);
      }
      sent++;
    } catch (e) {
      log.warn('reminder_failed', { userId: c.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return sent;
}
