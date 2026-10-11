import { authedRoute, body } from '@/server/http';
import { rateCard, reviewInput } from '@/server/services/study';

export const POST = authedRoute<{ sessionId: string }>(async ({ req, db, userId, params }) => rateCard(db, userId, params.sessionId, await body(req, reviewInput)));
