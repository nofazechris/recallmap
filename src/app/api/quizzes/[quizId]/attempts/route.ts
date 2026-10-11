import { authedRoute } from '@/server/http';
import { startAttempt } from '@/server/services/quiz';

export const POST = authedRoute<{ quizId: string }>(async ({ db, userId, params }) => startAttempt(db, userId, params.quizId));
