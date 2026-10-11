import { authedRoute } from '@/server/http';
import { feed, followCounts, suggestedPeople } from '@/server/services/community';

export const GET = authedRoute(async ({ db, userId }) => ({
  items: await feed(db, userId), people: await suggestedPeople(db, userId), counts: await followCounts(db, userId),
}));
