import { authedRoute } from '@/server/http';
import { sendVerification } from '@/server/services/verification';

export const POST = authedRoute(async ({ db, userId }) => ({ ok: true, ...(await sendVerification(db, userId)) }));
