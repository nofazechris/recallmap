import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { rateLimits } from '../db/schema';
import { tooMany } from './errors';

/** Fixed-window limiter backed by the database, so it holds across serverless instances. */
export async function rateLimit(db: DbOrTx, key: string, limit: number, windowSec: number) {
  const window = Math.floor(Date.now() / (windowSec * 1000));
  const [row] = await db.insert(rateLimits).values({ key, window, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.window], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  if (row.count > limit) throw tooMany(windowSec - (Math.floor(Date.now() / 1000) % windowSec));
}
