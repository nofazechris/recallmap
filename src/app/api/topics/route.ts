import { authedRoute, body } from '@/server/http';
import { createTopic, topicInput } from '@/server/services/topics';
import { buildSnapshot } from '@/server/services/snapshot';

export const GET = authedRoute(async ({ db, userId }) => ({ topics: (await buildSnapshot(db, userId)).topics }));
export const POST = authedRoute(async ({ req, db, userId }) => ({ topic: await createTopic(db, userId, await body(req, topicInput)) }));
