import { authedRoute } from '@/server/http';
import { buildSnapshot } from '@/server/services/snapshot';
import { notFound } from '@/server/lib/errors';

export const GET = authedRoute<{ topicId: string }>(async ({ db, userId, params }) => {
  const s = await buildSnapshot(db, userId);
  const t = s.topics.find((x) => x.id === params.topicId);
  if (!t) throw notFound('Topic not found.');
  const avg = t.cards.length ? Math.round(t.cards.reduce((n, c) => n + c.strength, 0) / t.cards.length) : 0;
  return { cards: t.cards.length, due: t.cards.filter((c) => c.due).length, recall: avg, sessions: t.sessions, assessments: t.assessments, mastery: s.mastery[t.id] ?? { ready: 0, master: 0 } };
});
