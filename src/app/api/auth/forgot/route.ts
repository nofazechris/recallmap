import { body, clientIp, route } from '@/server/http';
import { forgotInput, requestReset } from '@/server/services/password';

export const POST = route(async ({ req, db }) => ({ ok: true, ...(await requestReset(db, clientIp(req), await body(req, forgotInput))) }));
