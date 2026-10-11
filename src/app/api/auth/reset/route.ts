import { body, clientIp, route } from '@/server/http';
import { resetInput, resetPassword } from '@/server/services/password';

export const POST = route(async ({ req, db }) => {
  await resetPassword(db, clientIp(req), await body(req, resetInput));
  return { ok: true };
});
