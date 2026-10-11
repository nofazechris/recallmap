import { authedRoute } from '@/server/http';
import { exportAccount } from '@/server/services/export';

export const GET = authedRoute(async ({ db, userId }) => exportAccount(db, userId));
