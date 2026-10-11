import { authedRoute, body } from '@/server/http';
import { circleInput, createCircle, listCircles } from '@/server/services/community';

export const GET = authedRoute(async ({ db, userId }) => ({ circles: await listCircles(db, userId) }));
export const POST = authedRoute(async ({ req, db, userId }) => ({ circle: await createCircle(db, userId, await body(req, circleInput)) }));
