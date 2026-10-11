import { authedRoute, body } from '@/server/http';
import { responseInput, submitResponse } from '@/server/services/study';

export const POST = authedRoute<{ sessionId: string }>(async ({ req, db, userId, params }) => submitResponse(db, userId, params.sessionId, await body(req, responseInput)));
