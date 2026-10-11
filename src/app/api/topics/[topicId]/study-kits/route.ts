import { authedRoute, sweepSoon } from '@/server/http';
import { listKits } from '@/server/services/studykit';

export const GET = authedRoute<{ topicId: string }>(async ({ db, userId, params }) => {
  sweepSoon(db);
  return { kits: await listKits(db, userId, params.topicId) };
});
