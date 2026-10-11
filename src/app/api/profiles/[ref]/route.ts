import { authedRoute } from '@/server/http';
import { publicProfile } from '@/server/services/community';

export const GET = authedRoute<{ ref: string }>(async ({ db, userId, params }) => ({ profile: await publicProfile(db, userId, params.ref) }));
