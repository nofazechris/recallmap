import { authedRoute } from '@/server/http';
import { completeSession } from '@/server/services/study';

export const POST = authedRoute<{ sessionId: string }>(async ({ db, userId, params }) => completeSession(db, userId, params.sessionId));
