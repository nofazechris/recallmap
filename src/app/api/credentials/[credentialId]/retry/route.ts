import { authedRoute, runAfter } from '@/server/http';
import { retryCredential } from '@/server/services/credentials';

export const POST = authedRoute<{ credentialId: string }>(async ({ db, userId, params }) => {
  const job = await retryCredential(db, userId, params.credentialId);
  if (job.id) runAfter(db, job.id);
  return { ok: true };
});
