import { z } from 'zod';
import { authedRoute, body } from '@/server/http';
import { deleteTopic, topicInput, updateTopic } from '@/server/services/topics';
import { buildSnapshot } from '@/server/services/snapshot';
import { notFound } from '@/server/lib/errors';

export const GET = authedRoute<{ topicId: string }>(async ({ db, userId, params }) => {
  const topic = (await buildSnapshot(db, userId)).topics.find((t) => t.id === params.topicId);
  if (!topic) throw notFound('Topic not found.');
  return { topic };
});
export const PATCH = authedRoute<{ topicId: string }>(async ({ req, db, userId, params }) => {
  await updateTopic(db, userId, params.topicId, await body(req, topicInput.partial().extend({ archived: z.boolean().optional() })));
  return { ok: true };
});
export const DELETE = authedRoute<{ topicId: string }>(async ({ db, userId, params }) => {
  await deleteTopic(db, userId, params.topicId);
  return { ok: true };
});
