import { authedRoute, body } from '@/server/http';
import { submitAttempt, submitInput } from '@/server/services/quiz';

export const POST = authedRoute<{ attemptId: string }>(async ({ req, db, userId, params }) => {
  const raw = await req.text();
  const parsed = raw ? await body(new Request(req.url, { method: 'POST', body: raw }), submitInput) : {};
  return submitAttempt(db, userId, params.attemptId, parsed);
});
