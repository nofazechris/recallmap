import { z } from 'zod';
import { authedRoute, body } from '@/server/http';
import { createGoal, goalInput, listGoals, archiveGoal } from '@/server/services/goals';
import { profiles } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

const tzOf = async (db: Parameters<Parameters<typeof authedRoute>[0]>[0]['db'], userId: string) =>
  (await db.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId)).limit(1))[0]?.tz ?? 'UTC';

export const GET = authedRoute(async ({ db, userId }) => ({ goals: await listGoals(db, userId, await tzOf(db, userId)) }));
export const POST = authedRoute(async ({ req, db, userId }) => ({ goal: await createGoal(db, userId, await tzOf(db, userId), await body(req, goalInput)) }));
export const DELETE = authedRoute(async ({ req, db, userId }) => {
  const { id } = await body(req, z.object({ id: z.string().uuid() }));
  await archiveGoal(db, userId, id);
  return { ok: true };
});
