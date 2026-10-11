import { authedRoute } from '@/server/http';
import { desc, eq } from 'drizzle-orm';
import { xpLedger } from '@/server/db/schema';
import { totalXp, level } from '@/server/services/xp';

export const GET = authedRoute(async ({ db, userId }) => {
  const total = await totalXp(db, userId);
  const recent = await db.select().from(xpLedger).where(eq(xpLedger.userId, userId)).orderBy(desc(xpLedger.createdAt)).limit(50);
  return { total, level: level(total), recent: recent.map((r) => ({ id: r.id, event: r.eventType, amount: r.amount, at: r.createdAt })) };
});
