import { authedRoute } from '@/server/http';
import { regenerateCard } from '@/server/services/regenerate';

export const POST = authedRoute<{ cardId: string }>(async ({ db, userId, params }) => ({ card: await regenerateCard(db, userId, params.cardId) }));
