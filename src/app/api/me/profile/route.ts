import { authedRoute, body } from '@/server/http';
import { profilePatch, updateProfile } from '@/server/services/users';

export const PATCH = authedRoute(async ({ req, db, userId }) => {
  await updateProfile(db, userId, await body(req, profilePatch));
  return { ok: true };
});
