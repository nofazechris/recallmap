import { authedRoute } from '@/server/http';
import { previewInvite } from '@/server/services/community';

export const GET = authedRoute<{ code: string }>(async ({ db, params }) => previewInvite(db, params.code));
