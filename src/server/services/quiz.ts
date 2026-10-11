import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { profiles, quizAnswers, quizAttempts, quizQuestions, quizzes, topics } from '../db/schema';
import { badRequest, conflict } from '../lib/errors';
import { dayKey } from '../lib/days';
import { rateLimit } from '../lib/rate-limit';
import { evaluateAchievements } from './achievements';
import { activityRecord } from './community';
import { gradeAttempt, type Submitted } from './grading';
import { afterLearning } from './goals';
import { notify } from './notifications';
import { ownedAttempt, ownedQuiz } from './ownership';
import { getRules } from './rules';
import { escapeHtml } from './users';
import { awardXp, type AwardResult } from './xp';

/** A question as the learner sees it while taking the quiz — the answer key never appears here. */
export interface TakeQuestion { id: string; text: string; type: 'multiple_choice' | 'true_false'; options: string[] }

const STALE_AFTER_MS = 24 * 3600_000;
const answerSchema = z.union([z.number().int().min(0).max(9), z.boolean(), z.null()]);

export async function startAttempt(db: Db, userId: string, quizId: string) {
  const quiz = await ownedQuiz(db, userId, quizId);
  if (quiz.status !== 'published') throw badRequest('This quiz hasn’t been approved yet. Review and save the study kit first.', 'quiz_not_ready');
  await rateLimit(db, `quiz:${userId}`, 40, 3600);

  const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.position));
  if (!questions.length) throw badRequest('This quiz has no questions.', 'empty_quiz');

  // Anything left open for a day is abandoned: it never counts as a completed quiz.
  await db.update(quizAttempts).set({ status: 'abandoned' })
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.status, 'in_progress'), lt(quizAttempts.startedAt, new Date(Date.now() - STALE_AFTER_MS))));

  const [open] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.status, 'in_progress'))).limit(1);
  const attempt = open ?? (await db.insert(quizAttempts).values({
    userId, quizId: quiz.id, totalQuestions: questions.length, questionSnapshot: questions.map((q) => ({ id: q.id, version: q.version })),
  }).returning())[0];

  const saved = await db.select({ questionId: quizAnswers.questionId, a: quizAnswers.submittedAnswer }).from(quizAnswers).where(eq(quizAnswers.attemptId, attempt.id));
  const order = new Map(attempt.questionSnapshot.map((s, i) => [s.id, i]));
  const view: TakeQuestion[] = questions.filter((q) => order.has(q.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((q) => ({ id: q.id, text: q.questionText, type: q.questionType, options: q.options }));
  return { attemptId: attempt.id, title: quiz.title, topicId: quiz.topicId, questions: view, saved: Object.fromEntries(saved.map((s) => [s.questionId, s.a])) };
}

export const saveInput = z.object({ questionId: z.string().uuid(), answer: answerSchema });

export async function saveAnswer(db: Db, userId: string, attemptId: string, input: z.infer<typeof saveInput>) {
  const a = await ownedAttempt(db, userId, attemptId);
  if (a.status !== 'in_progress') throw conflict('This attempt is already finished.', 'attempt_closed');
  if (!a.questionSnapshot.some((s) => s.id === input.questionId)) throw badRequest('That question is not part of this quiz attempt.');
  await db.insert(quizAnswers).values({ attemptId: a.id, questionId: input.questionId, submittedAnswer: input.answer })
    .onConflictDoUpdate({ target: [quizAnswers.attemptId, quizAnswers.questionId], set: { submittedAnswer: input.answer } });
}

export const submitInput = z.object({ answers: z.record(z.string().uuid(), answerSchema).optional() });

export interface QuizResult {
  attemptId: string; score: number; correct: number; total: number; passed: boolean;
  xp: AwardResult; unlocked: { code: string; name: string }[];
  review: { id: string; text: string; options: string[]; submitted: Submitted; correctAnswer: number | boolean; isCorrect: boolean; explanation: string }[];
}

/** Grades on the server, inside one transaction. Submitting twice returns the stored result and pays nothing more. */
export async function submitAttempt(db: Db, userId: string, attemptId: string, input: z.infer<typeof submitInput>): Promise<QuizResult> {
  await ownedAttempt(db, userId, attemptId);
  const done = await db.transaction(async (tx) => {
    const [a] = await tx.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId)).for('update');
    if (a.status === 'submitted') return { replay: true as const, a };
    if (a.status === 'abandoned') throw conflict('This attempt expired. Start a new one.', 'attempt_closed');

    const ids = a.questionSnapshot.map((s) => s.id);
    const qs = await tx.select().from(quizQuestions).where(inArray(quizQuestions.id, ids));
    const byId = new Map(qs.map((q) => [q.id, q]));
    if (a.questionSnapshot.some((s) => byId.get(s.id)?.version !== s.version)) {
      await tx.update(quizAttempts).set({ status: 'abandoned' }).where(eq(quizAttempts.id, a.id));
      throw conflict('This quiz was edited while you were taking it. Please start again.', 'quiz_changed');
    }

    for (const [qid, ans] of Object.entries(input.answers ?? {})) {
      if (!byId.has(qid)) continue;
      await tx.insert(quizAnswers).values({ attemptId: a.id, questionId: qid, submittedAnswer: ans })
        .onConflictDoUpdate({ target: [quizAnswers.attemptId, quizAnswers.questionId], set: { submittedAnswer: ans } });
    }
    const stored = await tx.select().from(quizAnswers).where(eq(quizAnswers.attemptId, a.id));
    const answers = new Map<string, Submitted>(stored.map((s) => [s.questionId, s.submittedAnswer]));

    const ordered = a.questionSnapshot.map((s) => byId.get(s.id)!);
    const g = gradeAttempt(ordered.map((q) => ({ id: q.id, answerKey: q.answerKey })), answers);
    if (g.score === null) throw badRequest('This quiz has no gradable questions.');

    for (const p of g.perQuestion) {
      await tx.insert(quizAnswers).values({ attemptId: a.id, questionId: p.questionId, submittedAnswer: answers.get(p.questionId) ?? null, isCorrect: p.isCorrect, pointsAwarded: p.points })
        .onConflictDoUpdate({ target: [quizAnswers.attemptId, quizAnswers.questionId], set: { isCorrect: p.isCorrect, pointsAwarded: p.points } });
    }
    const now = new Date();
    const [row] = await tx.update(quizAttempts).set({ status: 'submitted', submittedAt: now, score: g.score, correctAnswers: g.correct, totalQuestions: g.total })
      .where(and(eq(quizAttempts.id, a.id), eq(quizAttempts.status, 'in_progress'))).returning();
    if (!row) return { replay: true as const, a };

    const rules = await getRules(tx);
    const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    const tz = profile?.timezone ?? 'UTC';
    const [quiz] = await tx.select().from(quizzes).where(eq(quizzes.id, a.quizId)).limit(1);
    const [topic] = await tx.select({ title: topics.title }).from(topics).where(eq(topics.id, quiz.topicId)).limit(1);
    const passed = g.score >= rules.xp.quiz.minScore;

    // XP only for a quiz completed at or above the pass mark; the key makes a replay harmless.
    const xp: AwardResult = passed
      ? await awardXp(tx, { userId, event: 'quiz_completed', relatedId: a.id, period: dayKey(now, tz), idempotencyKey: `quiz:${a.id}` })
      : { awarded: 0, reason: 'ineligible' };
    const title = escapeHtml(topic?.title ?? 'your topic');
    await notify(tx, userId, 'xp', `Quiz ${passed ? 'passed' : 'completed'} — <strong>${Math.round(g.score)}%</strong> on ${title}${xp.awarded ? `, +${xp.awarded} XP` : ''}.`, `/app/topics/${quiz.topicId}`);
    if (passed) await activityRecord(tx, userId, { type: 'quiz_passed', entityType: 'quiz_attempt', entityId: a.id, metadata: { score: g.score, topicTitle: topic?.title } });
    await afterLearning(tx, userId, tz, now);
    const unlocked = await evaluateAchievements(tx, userId, now);
    return { replay: false as const, a: row, xp, unlocked, passed };
  });

  const results = await getResults(db, userId, attemptId);
  if (done.replay) return { ...results, xp: { awarded: 0, reason: 'duplicate' }, unlocked: [] };
  return { ...results, xp: done.xp, unlocked: done.unlocked };
}

/** Only available once the attempt is submitted — this is the single place answer keys leave the server. */
export async function getResults(db: Db, userId: string, attemptId: string): Promise<QuizResult> {
  const a = await ownedAttempt(db, userId, attemptId);
  if (a.status !== 'submitted') throw conflict('Submit the quiz to see its results.', 'not_submitted');
  const rules = await getRules(db);
  const qs = await db.select().from(quizQuestions).where(inArray(quizQuestions.id, a.questionSnapshot.map((s) => s.id)));
  const byId = new Map(qs.map((q) => [q.id, q]));
  const stored = new Map((await db.select().from(quizAnswers).where(eq(quizAnswers.attemptId, a.id))).map((s) => [s.questionId, s]));
  const review = a.questionSnapshot.map((s) => {
    const q = byId.get(s.id)!;
    const ans = stored.get(q.id);
    return {
      id: q.id, text: q.questionText, options: q.options, submitted: (ans?.submittedAnswer ?? null) as Submitted,
      correctAnswer: q.answerKey.type === 'multiple_choice' ? q.answerKey.correctIndex : q.answerKey.value,
      isCorrect: !!ans?.isCorrect, explanation: q.explanation,
    };
  });
  return {
    attemptId: a.id, score: a.score ?? 0, correct: a.correctAnswers, total: a.totalQuestions, passed: (a.score ?? 0) >= rules.xp.quiz.minScore,
    xp: { awarded: 0, reason: 'duplicate' }, unlocked: [], review,
  };
}

void sql;
