import { authedRoute } from '@/server/http';
import { getResults } from '@/server/services/quiz';

export const GET = authedRoute<{ attemptId: string }>(async ({ db, userId, params }) => getResults(db, userId, params.attemptId));
