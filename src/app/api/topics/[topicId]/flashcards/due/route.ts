import { authedRoute } from '@/server/http';
import { buildSnapshot } from '@/server/services/snapshot';
import { notFound } from '@/server/lib/errors';

export const GET = authedRoute<{ topicId: string }>(async ({ db, userId, params }) => {
  const t = (await buildSnapshot(db, userId)).topics.find((x) => x.id === params.topicId);
  if (!t) throw notFound('Topic not found.');
  const due = t.cards.filter((c) => c.due);
  return { due: due.length, total: t.cards.length, cards: due.map((c) => ({ id: c.id, concept: c.concept, question: c.q })) };
});
