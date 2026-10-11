import { authedRoute } from '@/server/http';
import { buildSnapshot } from '@/server/services/snapshot';

export const GET = authedRoute(async ({ db, userId }) => {
  const s = await buildSnapshot(db, userId);
  return { earned: s.earned, badges: s.badges, credentials: s.credentials };
});
