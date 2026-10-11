import { authedRoute, sweepSoon } from '@/server/http';
import { deleteResource } from '@/server/services/resources';
import { ownedResource } from '@/server/services/ownership';

export const GET = authedRoute<{ resourceId: string }>(async ({ db, userId, params }) => {
  sweepSoon(db);
  const r = await ownedResource(db, userId, params.resourceId);
  return { resource: { id: r.id, name: r.originalFilename, status: r.processingStatus, error: r.processingError, pages: r.pageCount, chars: r.charCount } };
});
export const DELETE = authedRoute<{ resourceId: string }>(async ({ db, userId, params }) => {
  await deleteResource(db, userId, params.resourceId);
  return { ok: true };
});
