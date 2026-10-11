import { authedRoute, runAfter } from '@/server/http';
import { retryResource } from '@/server/services/resources';

export const POST = authedRoute<{ resourceId: string }>(async ({ db, userId, params }) => {
  const job = await retryResource(db, userId, params.resourceId);
  if (job.id) runAfter(db, job.id);
  return { jobId: job.id };
});
