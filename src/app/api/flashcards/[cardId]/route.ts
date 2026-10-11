import { z } from 'zod';
import { authedRoute, body } from '@/server/http';
import { cardInput, deleteCard, editCard } from '@/server/services/topics';

export const PATCH = authedRoute<{ cardId: string }>(async ({ req, db, userId, params }) => {
  await editCard(db, userId, params.cardId, await body(req, cardInput.partial().extend({ status: z.enum(['draft', 'approved']).optional() })));
  return { ok: true };
});
export const DELETE = authedRoute<{ cardId: string }>(async ({ db, userId, params }) => {
  await deleteCard(db, userId, params.cardId);
  return { ok: true };
});
