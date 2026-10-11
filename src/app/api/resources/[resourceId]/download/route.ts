import { authedRoute } from '@/server/http';
import { ownedResource } from '@/server/services/ownership';
import { getStorage } from '@/server/storage';

export const GET = authedRoute<{ resourceId: string }>(async ({ db, userId, params }) => {
  const r = await ownedResource(db, userId, params.resourceId);
  return { url: await (await getStorage()).createDownloadUrl(r.storageKey, r.originalFilename) };
});
