import { authedRoute, body } from '@/server/http';
import { startInput, startSession } from '@/server/services/study';

export const POST = authedRoute<{ topicId: string }>(async ({ req, db, userId, params }) => startSession(db, userId, params.topicId, await body(req, startInput)));
