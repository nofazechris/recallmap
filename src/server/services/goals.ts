import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Tx } from '../db';
import { challengeParticipants, challenges, flashcardResponses, learningGoals, quizAttempts, quizzes, studySessions } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { dayKey, startOfDay, weekKey, addDays } from '../lib/days';
import { studyDays } from './activity';
import { activityRecord } from './community';
import { notify } from './notifications';
import { awardXp } from './xp';

export const goalInput = z.object({
  goalType: z.enum(['reviews', 'sessions', 'quizzes']),
  targetValue: z.number().int().min(1).max(1000),
  period: z.enum(['daily', 'weekly']),
  topicId: z.string().uuid().optional(),
});

export async function createGoal(db: Db, userId: string, tz: string, input: z.infer<typeof goalInput>) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(learningGoals).where(and(eq(learningGoals.userId, userId), eq(learningGoals.status, 'active')));
  if (n >= 10) throw badRequest('You can keep up to 10 active goals.', 'goal_limit');
  const [g] = await db.insert(learningGoals).values({ ...input, userId, startsAt: startOfDay(dayKey(new Date(), tz), tz) }).returning();
  return g;
}

export async function archiveGoal(db: Db, userId: string, goalId: string) {
  const r = await db.update(learningGoals).set({ status: 'archived' }).where(and(eq(learningGoals.id, goalId), eq(learningGoals.userId, userId))).returning({ id: learningGoals.id });
  if (!r.length) throw notFound('Goal not found.');
}

/** The current window for a goal in the learner's timezone: today, or this ISO week (Mon–Sun). */
export function goalWindow(period: 'daily' | 'weekly', tz: string, now = new Date()) {
  const today = dayKey(now, tz);
  if (period === 'daily') return { from: startOfDay(today, tz), to: startOfDay(addDays(today, 1), tz), label: today };
  const [y, m, d] = today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  return { from: startOfDay(monday, tz), to: startOfDay(addDays(monday, 7), tz), label: weekKey(today) };
}

export async function goalProgress(db: Db | Tx, userId: string, g: { goalType: string; topicId: string | null }, win: { from: Date; to: Date }): Promise<number> {
  if (g.goalType === 'reviews') {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(flashcardResponses)
      .innerJoin(sql`flashcards f`, sql`f.id = ${flashcardResponses.flashcardId}`)
      .where(and(eq(flashcardResponses.userId, userId), gte(flashcardResponses.ratedAt, win.from), lte(flashcardResponses.ratedAt, win.to),
        g.topicId ? sql`f.topic_id = ${g.topicId}` : undefined));
    return r.n;
  }
  if (g.goalType === 'sessions') {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(studySessions)
      .where(and(eq(studySessions.userId, userId), eq(studySessions.qualified, true), gte(studySessions.completedAt, win.from), lte(studySessions.completedAt, win.to),
        g.topicId ? eq(studySessions.topicId, g.topicId) : undefined));
    return r.n;
  }
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(quizAttempts).innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.status, 'submitted'), gte(quizAttempts.submittedAt, win.from), lte(quizAttempts.submittedAt, win.to),
      g.topicId ? eq(quizzes.topicId, g.topicId) : undefined));
  return r.n;
}

export async function listGoals(db: Db, userId: string, tz: string) {
  const goals = await db.select().from(learningGoals).where(and(eq(learningGoals.userId, userId), eq(learningGoals.status, 'active')));
  return Promise.all(goals.map(async (g) => {
    const win = goalWindow(g.period, tz);
    const progress = await goalProgress(db, userId, g, win);
    return { ...g, progress, windowEnds: win.to.toISOString(), done: progress >= g.targetValue };
  }));
}

/**
 * Called inside the same transaction as any qualifying learning event. Pays weekly-goal XP (once per goal per
 * week) and advances challenges — all from persisted records.
 */
export async function afterLearning(tx: Tx, userId: string, tz: string, now = new Date()) {
  const goals = await tx.select().from(learningGoals).where(and(eq(learningGoals.userId, userId), eq(learningGoals.status, 'active'), eq(learningGoals.period, 'weekly')));
  for (const g of goals) {
    const win = goalWindow('weekly', tz, now);
    if ((await goalProgress(tx, userId, g, win)) >= g.targetValue) {
      const r = await awardXp(tx, { userId, event: 'weekly_goal', relatedId: g.id, period: win.label, idempotencyKey: `weekly_goal:${g.id}:${win.label}` });
      if (r.awarded) await notify(tx, userId, 'xp', `Weekly goal complete — <strong>+${r.awarded} XP</strong>.`, '/app');
    }
  }

  const mine = await tx.select({ c: challenges, p: challengeParticipants }).from(challengeParticipants)
    .innerJoin(challenges, eq(challenges.id, challengeParticipants.challengeId))
    .where(and(eq(challengeParticipants.userId, userId), eq(challengeParticipants.status, 'joined'), eq(challenges.status, 'active')));
  if (!mine.length) return;
  const days = await studyDays(tx, userId, tz);
  for (const { c, p } of mine) {
    if (c.endsAt < now) continue;
    let progress = 0;
    if (c.rules.metric === 'study_days') {
      const from = dayKey(c.startsAt, tz), to = dayKey(now, tz);
      progress = [...days].filter((d) => d >= from && d <= to).length;
    } else {
      const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(flashcardResponses)
        .where(and(eq(flashcardResponses.userId, userId), gte(flashcardResponses.ratedAt, c.startsAt), lte(flashcardResponses.ratedAt, c.endsAt)));
      progress = r.n;
    }
    const done = progress >= c.rules.target;
    await tx.update(challengeParticipants).set({ progress, ...(done ? { status: 'completed' as const, completedAt: now } : {}) })
      .where(and(eq(challengeParticipants.challengeId, c.id), eq(challengeParticipants.userId, userId)));
    if (done && p.status !== 'completed') {
      const r = await awardXp(tx, { userId, event: 'challenge', relatedId: c.id, period: dayKey(now, tz), idempotencyKey: `challenge:${c.id}` });
      await notify(tx, userId, 'xp', `Challenge complete: <strong>${c.title.replace(/[<>&]/g, '')}</strong>${r.awarded ? ` — +${r.awarded} XP` : ''}.`, '/app/community');
      await activityRecord(tx, userId, { type: 'challenge_completed', entityType: 'challenge', entityId: c.id, metadata: { title: c.title } });
    }
  }
}
