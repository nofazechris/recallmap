import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../db';
import { achievements, challengeParticipants, credentials, profiles, quizAttempts, quizzes, studySessions, userAchievements } from '../db/schema';
import { dayKey } from '../lib/days';
import { daysInWindow, reviewsByDay, streakInfo } from './activity';
import { masteryProgress, masteryReached, type ScoredAttempt } from './grading';
import { notify } from './notifications';
import { activityRecord } from './community';
import { getRules, type Rules } from './rules';

export interface Unlocked { code: string; name: string }

/** Per-topic list of submitted attempts, the input to mastery checks. */
export async function attemptsByTopic(db: DbOrTx, userId: string, minQuestions: number) {
  const rows = await db.select({ id: quizAttempts.id, at: quizAttempts.submittedAt, score: quizAttempts.score, topicId: quizzes.topicId })
    .from(quizAttempts).innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.status, 'submitted'), sql`${quizAttempts.totalQuestions} >= ${minQuestions}`));
  const by = new Map<string, ScoredAttempt[]>();
  for (const r of rows) {
    if (!r.at || r.score === null) continue;
    (by.get(r.topicId) ?? by.set(r.topicId, []).get(r.topicId)!).push({ id: r.id, at: r.at, score: r.score });
  }
  return by;
}

type TopicMastery = { ready: number; master: number; readyDone: boolean; masterDone: boolean };

/** Pure: mastery state per topic from already-loaded attempts. */
export function masteryFrom(rules: Rules, by: Map<string, ScoredAttempt[]>) {
  const gap = rules.mastery.minIntervalMinutes * 60_000;
  const perTopic = new Map<string, TopicMastery>();
  for (const [topicId, list] of by) {
    perTopic.set(topicId, {
      ready: masteryProgress(list, rules.mastery.recallReady.minScore, gap),
      master: masteryProgress(list, rules.mastery.topicMaster.minScore, gap),
      readyDone: masteryReached(list, rules.mastery.recallReady.minScore, rules.mastery.recallReady.attempts, gap),
      masterDone: masteryReached(list, rules.mastery.topicMaster.minScore, rules.mastery.topicMaster.attempts, gap),
    });
  }
  return perTopic;
}

export async function masteryStatus(db: DbOrTx, userId: string) {
  const rules = await getRules(db);
  const by = await attemptsByTopic(db, userId, rules.mastery.minQuestions);
  return { rules, perTopic: masteryFrom(rules, by) };
}

/**
 * Unlock every achievement whose criteria are now met, from persisted records only.
 * Idempotent: the unique (user, achievement) index means a badge can never be granted twice.
 */
export async function evaluateAchievements(tx: Tx, userId: string, now = new Date()): Promise<Unlocked[]> {
  const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile) return [];
  const tz = profile.timezone;
  const today = dayKey(now, tz);
  const rules = await getRules(tx);

  const have = new Set((await tx.select({ code: achievements.code }).from(userAchievements)
    .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId)).where(eq(userAchievements.userId, userId))).map((r) => r.code));
  const all = await tx.select().from(achievements).where(eq(achievements.isActive, true));
  const missing = all.filter((a) => !have.has(a.code));
  if (!missing.length) return [];

  const streak = await streakInfo(tx, userId, tz, now);
  const reviews = await reviewsByDay(tx, userId, tz, 60);
  const goalDays = [...reviews].filter(([, n]) => n >= profile.dailyGoal).map(([d]) => d);
  const { perTopic } = await masteryStatus(tx, userId);
  const [{ q }] = await tx.select({ q: sql<number>`count(*)::int` }).from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.qualified, true)));
  const [{ ch }] = await tx.select({ ch: sql<number>`count(*)::int` }).from(challengeParticipants).where(and(eq(challengeParticipants.userId, userId), eq(challengeParticipants.status, 'completed')));
  const [{ cv }] = await tx.select({ cv: sql<number>`count(*)::int` }).from(credentials).where(and(eq(credentials.userId, userId), eq(credentials.status, 'verified')));

  const met = (code: string): boolean => {
    switch (code) {
      case 'first-steps': return q > 0;
      case 'consistent-learner': return daysInWindow(streak.days, today, rules.streak.consistentLearner.window) >= rules.streak.consistentLearner.days;
      case 'week-of-focus': return streak.current >= rules.streak.weekOfFocus.days || streak.longest >= rules.streak.weekOfFocus.days;
      case 'recall-ready': return [...perTopic.values()].some((t) => t.readyDone);
      case 'topic-master': return [...perTopic.values()].some((t) => t.masterDone);
      case 'goal-getter': return daysInWindow(goalDays, today, rules.streak.goalGetter.window) >= rules.streak.goalGetter.days;
      case 'challenge-finisher': return ch > 0;
      case 'verified-achievement': return cv > 0;
      default: return false;
    }
  };

  const unlocked: Unlocked[] = [];
  for (const a of missing) {
    if (!met(a.code)) continue;
    const [row] = await tx.insert(userAchievements).values({ userId, achievementId: a.id }).onConflictDoNothing().returning({ id: userAchievements.id });
    if (!row) continue;
    unlocked.push({ code: a.code, name: a.name });
    await notify(tx, userId, 'badge', `You earned <strong>${a.name}</strong> — ${a.description.charAt(0).toLowerCase()}${a.description.slice(1)}`, '/app/achievements');
    await activityRecord(tx, userId, { type: 'badge_unlocked', entityType: 'achievement', entityId: a.code, metadata: { name: a.name, icon: a.icon } });
  }
  return unlocked;
}

/** Pure: progress toward each achievement from already-loaded activity (no queries). */
export function progressFrom(i: {
  rules: Rules; today: string; days: Set<string>; currentStreak: number; goalDays: string[]; perTopic: Map<string, TopicMastery>; qualifiedSessions: number;
}) {
  const clamp = (n: number, max: number) => Math.min(n, max);
  const pct = (n: number, max: number) => Math.round((clamp(n, max) / max) * 100);
  const { rules } = i;
  const bestReady = Math.max(0, ...[...i.perTopic.values()].map((t) => t.ready));
  const bestMaster = Math.max(0, ...[...i.perTopic.values()].map((t) => t.master));
  const cl = rules.streak.consistentLearner, gg = rules.streak.goalGetter, wf = rules.streak.weekOfFocus;
  const dl = daysInWindow(i.days, i.today, cl.window);
  const gd = daysInWindow(i.goalDays, i.today, gg.window);
  const out: Record<string, { pct: number; meta: string }> = {
    'first-steps': { pct: i.qualifiedSessions > 0 ? 100 : 0, meta: i.qualifiedSessions > 0 ? 'Done' : 'Finish a study session' },
    'consistent-learner': { pct: pct(dl, cl.days), meta: `${clamp(dl, cl.days)} of ${cl.days} study days` },
    'week-of-focus': { pct: pct(i.currentStreak, wf.days), meta: `${clamp(i.currentStreak, wf.days)} of ${wf.days} days in a row` },
    'recall-ready': { pct: pct(bestReady, rules.mastery.recallReady.attempts), meta: `${clamp(bestReady, rules.mastery.recallReady.attempts)} of ${rules.mastery.recallReady.attempts} assessments at ${rules.mastery.recallReady.minScore}%+` },
    'topic-master': { pct: pct(bestMaster, rules.mastery.topicMaster.attempts), meta: `${clamp(bestMaster, rules.mastery.topicMaster.attempts)} of ${rules.mastery.topicMaster.attempts} assessments at ${rules.mastery.topicMaster.minScore}%+` },
    'goal-getter': { pct: pct(gd, gg.days), meta: `${clamp(gd, gg.days)} of ${gg.days} goal days this week` },
  };
  return out;
}
