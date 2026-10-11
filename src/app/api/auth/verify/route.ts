import { body, route } from '@/server/http';
import { confirmEmail, confirmInput } from '@/server/services/verification';

export const POST = route(async ({ req, db }) => {
  await confirmEmail(db, await body(req, confirmInput));
  return { ok: true };
});
