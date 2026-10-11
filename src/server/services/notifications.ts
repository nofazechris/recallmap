import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { notifications, profiles } from '../db/schema';

export type NotifType = 'badge' | 'due' | 'social' | 'verified' | 'xp';

/** Creates an in-app notification, honouring the user's notification preferences. `html` must already be escaped. */
export async function notify(db: DbOrTx, userId: string, type: NotifType, html: string, href = '/app') {
  const [p] = await db.select({ prefs: profiles.prefs }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (p) {
    if ((type === 'badge' || type === 'verified') && !p.prefs.notifyBadges) return;
    if (type === 'social' && !p.prefs.notifyCommunity) return;
  }
  await db.insert(notifications).values({ userId, type, html, href });
}

export const markRead = (db: DbOrTx, userId: string, ids: string[], unread = false) =>
  ids.length ? db.update(notifications).set({ unread }).where(and(eq(notifications.userId, userId), inArray(notifications.id, ids))) : Promise.resolve();

export const markAllRead = (db: DbOrTx, userId: string) =>
  db.update(notifications).set({ unread: false }).where(and(eq(notifications.userId, userId), eq(notifications.unread, true)));

export const dismiss = (db: DbOrTx, userId: string, ids: string[]) =>
  ids.length ? db.delete(notifications).where(and(eq(notifications.userId, userId), inArray(notifications.id, ids))) : Promise.resolve();

export const clearRead = (db: DbOrTx, userId: string) =>
  db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.unread, false)));
