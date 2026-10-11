import { z } from 'zod';
import { authedRoute, body } from '@/server/http';
import { aiFeedback } from '@/server/services/study';

export const POST = authedRoute<{ sessionId: string }>(async ({ req, db, userId, params }) => {
  const { flashcardId } = await body(req, z.object({ flashcardId: z.string().uuid() }));
  return aiFeedback(db, userId, params.sessionId, flashcardId);
});
