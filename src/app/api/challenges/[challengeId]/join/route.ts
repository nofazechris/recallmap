import { authedRoute } from '@/server/http';
import { joinChallenge } from '@/server/services/community';

export const POST = authedRoute<{ challengeId: string }>(async ({ db, userId, params }) => { await joinChallenge(db, userId, params.challengeId, true); return { ok: true }; });
export const DELETE = authedRoute<{ challengeId: string }>(async ({ db, userId, params }) => { await joinChallenge(db, userId, params.challengeId, false); return { ok: true }; });
