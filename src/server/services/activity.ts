import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { addDays, currentStreak, dayKey, longestStreak } from '../lib/days';

/** Days (in the learner's own timezone) with at least one rated review. Rows come back as 'YYYY-MM-DD'. */
export async function reviewsByDay(db: DbOrTx, userId: string, tz: string, sinceDays = 400): Promise<Map<string, number>> {
  const res = await db.execute(sql`
    select to_char(rated_at at time zone ${tz}, 'YYYY-MM-DD') as d, count(*)::int as n
    from flashcard_responses
    where user_id = ${userId} and rated_at is not null and rated_at > now() - make_interval(days => ${sinceDays})
    group by 1`);
  return new Map((res.rows as { d: string; n: number }[]).map((r) => [r.d, r.n]));
}

/**
 * A "study day" is a local calendar day with real learning on it: a rated flashcard review, or a
 * submitted quiz. Merely opening the app never counts.
 */
export async function studyDays(db: DbOrTx, userId: string, tz: string): Promise<Set<string>> {
  const res = await db.execute(sql`
    select distinct to_char(ts at time zone ${tz}, 'YYYY-MM-DD') as d from (
      select rated_at as ts from flashcard_responses where user_id = ${userId} and rated_at is not null
      union all
      select submitted_at as ts from quiz_attempts where user_id = ${userId} and status = 'submitted' and submitted_at is not null
    ) x where ts is not null`);
  return new Set((res.rows as { d: string }[]).map((r) => r.d));
}

export interface StreakInfo { current: number; longest: number; studiedToday: boolean; days: Set<string> }
export async function streakInfo(db: DbOrTx, userId: string, tz: string, now = new Date()): Promise<StreakInfo> {
  const days = await studyDays(db, userId, tz);
  const today = dayKey(now, tz);
  return { current: currentStreak(days, today), longest: longestStreak(days), studiedToday: days.has(today), days };
}

/** Days within the last `window` days (inclusive of today) that appear in `days`. */
export const daysInWindow = (days: Iterable<string>, today: string, window: number) => {
  const from = addDays(today, -(window - 1));
  let n = 0;
  for (const d of days) if (d >= from && d <= today) n++;
  return n;
};
