import { authedRoute, body } from '@/server/http';
import { saveAnswer, saveInput } from '@/server/services/quiz';

export const POST = authedRoute<{ attemptId: string }>(async ({ req, db, userId, params }) => {
  await saveAnswer(db, userId, params.attemptId, await body(req, saveInput));
  return { ok: true };
});
