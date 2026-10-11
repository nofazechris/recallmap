import { authedRoute } from '@/server/http';
import { buildSnapshot } from '@/server/services/snapshot';
import { streakInfo } from '@/server/services/activity';
import { sql } from 'drizzle-orm';

export const GET = authedRoute(async ({ db, userId }) => {
  const s = await buildSnapshot(db, userId);
  const st = await streakInfo(db, userId, s.user.timezone);
  const [stats] = (await db.execute(sql`
    select
      (select count(*)::int from study_sessions where user_id = ${userId} and qualified) as sessions,
      (select count(*)::int from flashcard_responses where user_id = ${userId} and rated_at is not null) as cards_reviewed,
      (select count(*)::int from quiz_attempts where user_id = ${userId} and status = 'submitted') as quiz_attempts,
      (select coalesce(round(avg(score)::numeric, 1), 0)::float from quiz_attempts where user_id = ${userId} and status = 'submitted') as avg_quiz_score`)).rows as Record<string, number>[];
  const cardsDue = s.topics.reduce((n, t) => n + t.cards.filter((c) => c.due).length, 0);
  return {
    totalXp: s.user.xp, currentStreak: st.current, longestStreak: st.longest, studyDays: st.days.size,
    cardsDue, achievementsUnlocked: Object.keys(s.earned).length, mastery: s.mastery, ...stats,
  };
});
