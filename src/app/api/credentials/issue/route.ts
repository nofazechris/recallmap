import { authedRoute, body, runAfter } from '@/server/http';
import { issueCredential, issueInput } from '@/server/services/credentials';

export const POST = authedRoute(async ({ req, db, userId }) => {
  const { credential, jobId } = await issueCredential(db, userId, await body(req, issueInput));
  runAfter(db, jobId);
  return { credential: { id: credential.id, status: credential.status } };
});
