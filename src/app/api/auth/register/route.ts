import { route, body } from '@/server/http';
import { clientIp } from '@/server/http';
import { rateLimit } from '@/server/lib/rate-limit';
import { registerInput, registerUser } from '@/server/services/users';
import { sendVerification } from '@/server/services/verification';

export const POST = route(async ({ req, db }) => {
  await rateLimit(db, `register:${clientIp(req)}`, 10, 3600);
  const input = await body(req, registerInput);
  const { id } = await registerUser(db, input);
  // Best effort: a failed email must never block sign-up (the user can resend from the app).
  await sendVerification(db, id).catch(() => undefined);
  return { ok: true, id };
});
