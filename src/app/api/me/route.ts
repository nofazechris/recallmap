import { authedRoute, sweepSoon } from '@/server/http';
import { HttpError, unauthorized } from '@/server/lib/errors';
import { buildSnapshot } from '@/server/services/snapshot';
import { deleteAccount } from '@/server/services/users';
import { getStorage } from '@/server/storage';
import { resources } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET = authedRoute(async ({ db, userId }) => {
  sweepSoon(db); // keeps background jobs (e.g. credential confirmation) moving while the app is open
  // A valid session for an account that no longer exists is simply signed out.
  return buildSnapshot(db, userId).catch((e) => { throw e instanceof HttpError && e.status === 404 ? unauthorized() : e; });
});

/** Account deletion: stored files first, then the user row, which cascades through everything they own. */
export const DELETE = authedRoute(async ({ db, userId }) => {
  const files = await db.select({ key: resources.storageKey }).from(resources).where(eq(resources.ownerId, userId));
  await deleteAccount(db, userId);
  await (await getStorage()).remove(files.map((f) => f.key)).catch(() => undefined);
  return { ok: true };
});
