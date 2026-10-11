import { authedRoute, body } from '@/server/http';
import { requestUpload, uploadRequest } from '@/server/services/resources';

export const POST = authedRoute<{ topicId: string }>(async ({ req, db, userId, params }) => requestUpload(db, userId, params.topicId, await body(req, uploadRequest)));
