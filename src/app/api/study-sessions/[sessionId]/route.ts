import { authedRoute } from '@/server/http';
import { getSession } from '@/server/services/study';

export const GET = authedRoute<{ sessionId: string }>(async ({ db, userId, params }) => getSession(db, userId, params.sessionId));
