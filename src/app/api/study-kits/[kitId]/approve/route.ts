import { authedRoute, body } from '@/server/http';
import { approveInput, approveKit } from '@/server/services/studykit';

export const POST = authedRoute<{ kitId: string }>(async ({ req, db, userId, params }) => approveKit(db, userId, params.kitId, await body(req, approveInput)));
