import { authedRoute } from '@/server/http';
import { acceptInvite } from '@/server/services/community';

export const POST = authedRoute<{ code: string }>(async ({ db, userId, params }) => acceptInvite(db, userId, params.code));
