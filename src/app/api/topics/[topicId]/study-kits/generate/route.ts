import { authedRoute, body, runAfter } from '@/server/http';
import { kitRequest, requestKit } from '@/server/services/studykit';

export const POST = authedRoute<{ topicId: string }>(async ({ req, db, userId, params }) => {
  const { kit, jobId } = await requestKit(db, userId, params.topicId, await body(req, kitRequest));
  runAfter(db, jobId);
  return { kitId: kit.id, jobId, status: kit.status };
});
