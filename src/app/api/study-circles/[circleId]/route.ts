import { authedRoute } from '@/server/http';
import { circleDetail } from '@/server/services/community';

export const GET = authedRoute<{ circleId: string }>(async ({ db, userId, params }) => ({ circle: await circleDetail(db, userId, params.circleId) }));
