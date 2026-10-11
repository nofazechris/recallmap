import { authedRoute } from '@/server/http';
import { setMembership } from '@/server/services/community';

export const POST = authedRoute<{ circleId: string }>(async ({ db, userId, params }) => { await setMembership(db, userId, params.circleId, true); return { ok: true }; });
export const DELETE = authedRoute<{ circleId: string }>(async ({ db, userId, params }) => { await setMembership(db, userId, params.circleId, false); return { ok: true }; });
