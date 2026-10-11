import { authedRoute } from '@/server/http';
import { setFollow } from '@/server/services/community';

export const POST = authedRoute<{ ref: string }>(async ({ db, userId, params }) => { await setFollow(db, userId, params.ref, true); return { ok: true }; });
export const DELETE = authedRoute<{ ref: string }>(async ({ db, userId, params }) => { await setFollow(db, userId, params.ref, false); return { ok: true }; });
