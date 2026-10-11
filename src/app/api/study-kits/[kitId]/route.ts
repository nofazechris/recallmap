import { authedRoute, sweepSoon } from '@/server/http';
import { discardKit, getKit } from '@/server/services/studykit';

export const GET = authedRoute<{ kitId: string }>(async ({ db, userId, params }) => {
  sweepSoon(db);
  return getKit(db, userId, params.kitId);
});
export const DELETE = authedRoute<{ kitId: string }>(async ({ db, userId, params }) => {
  await discardKit(db, userId, params.kitId);
  return { ok: true };
});
