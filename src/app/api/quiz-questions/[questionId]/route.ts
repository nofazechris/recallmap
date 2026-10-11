import { authedRoute, body } from '@/server/http';
import { editQuestion, questionInput } from '@/server/services/topics';

export const PATCH = authedRoute<{ questionId: string }>(async ({ req, db, userId, params }) => {
  await editQuestion(db, userId, params.questionId, await body(req, questionInput));
  return { ok: true };
});
