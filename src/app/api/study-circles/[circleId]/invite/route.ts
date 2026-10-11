import { authedRoute } from '@/server/http';
import { rotateInvite } from '@/server/services/community';

/** Creates a new invite link for a circle you own (the previous link stops working). */
export const POST = authedRoute<{ circleId: string }>(async ({ db, userId, params }) => rotateInvite(db, userId, params.circleId));
