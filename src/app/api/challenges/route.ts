import { authedRoute, body } from '@/server/http';
import { challengeInput, createChallenge, listChallenges } from '@/server/services/community';

export const GET = authedRoute(async ({ db, userId }) => ({ challenges: await listChallenges(db, userId) }));
export const POST = authedRoute(async ({ req, db, userId }) => ({ challenge: await createChallenge(db, userId, await body(req, challengeInput)) }));
