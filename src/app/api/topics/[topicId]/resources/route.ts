import { authedRoute, body, runAfter } from '@/server/http';
import { listResources, registerInput, registerResource } from '@/server/services/resources';

export const GET = authedRoute<{ topicId: string }>(async ({ db, userId, params }) => ({ resources: await listResources(db, userId, params.topicId) }));
export const POST = authedRoute<{ topicId: string }>(async ({ req, db, userId, params }) => {
  const { resource, jobId } = await registerResource(db, userId, params.topicId, await body(req, registerInput));
  runAfter(db, jobId);
  return { resource, jobId };
});
