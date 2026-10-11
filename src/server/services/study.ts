import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { feedbackOut, type FeedbackOut } from '../ai/schemas';
import { FEEDBACK_SYSTEM, feedbackUser } from '../ai/prompts';
import { aiConfigured, getProvider } from '../ai/provider';
import { grade } from '../../lib/grade';
import type { Db, Tx } from '../db';
import { concepts, flashcardResponses, flashcards, profiles, reviewSchedules, studySessions, topics } from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';
import { dayKey } from '../lib/days';
import { rateLimit } from '../lib/rate-limit';
import { evaluateAchievements, type Unlocked } from './achievements';
import { afterLearning } from './goals';
import { ownedSession, ownedTopic } from './ownership';
import { getRules } from './rules';
import { RATINGS, schedule, type Rating } from './srs';
import { awardXp, type AwardResult } from './xp';

const DECK_SIZE = 20;

export const startInput = z.object({
  mode: z.enum(['due', 'all', 'weak']).default('due'),
  /** Only cards from this concept (by name). */
  concept: z.string().max(80).optional(),
  /** 0 = every card that qualifies. */
  limit: z.number().int().min(0).max(100).default(DECK_SIZE),
});

/** What the client may see of a card *before* it has submitted an answer: never the reference answer. */
export interface DeckCard { id: string; question: string; hint: string | null; concept: string; difficulty: string; isNew: boolean }

/** Approved cards for a topic with their schedule state. */
export async function cardStates(db: Db | Tx, userId: string, topicId: string) {
  return db.select({
    id: flashcards.id, question: flashcards.question, hint: flashcards.hint, difficulty: flashcards.difficulty, conceptId: flashcards.conceptId,
    concept: concepts.name, dueAt: reviewSchedules.dueAt, strength: reviewSchedules.strength, intervalDays: reviewSchedules.intervalDays,
    reviewCount: reviewSchedules.reviewCount,
  }).from(flashcards)
    .leftJoin(reviewSchedules, and(eq(reviewSchedules.flashcardId, flashcards.id), eq(reviewSchedules.userId, userId)))
    .leftJoin(concepts, eq(concepts.id, flashcards.conceptId))
    .where(and(eq(flashcards.topicId, topicId), eq(flashcards.status, 'approved')))
    .orderBy(asc(flashcards.createdAt));
}

/** Same as cardStates, for several topics in one round trip (used by the snapshot). */
export async function cardStatesForTopics(db: Db | Tx, userId: string, topicIds: string[]) {
  if (!topicIds.length) return [];
  return db.select({
    id: flashcards.id, topicId: flashcards.topicId, question: flashcards.question, concept: concepts.name,
    dueAt: reviewSchedules.dueAt, strength: reviewSchedules.strength, sourceResourceId: flashcards.sourceResourceId,
  }).from(flashcards)
    .leftJoin(reviewSchedules, and(eq(reviewSchedules.flashcardId, flashcards.id), eq(reviewSchedules.userId, userId)))
    .leftJoin(concepts, eq(concepts.id, flashcards.conceptId))
    .where(and(inArray(flashcards.topicId, topicIds), eq(flashcards.status, 'approved')))
    .orderBy(asc(flashcards.createdAt));
}

export async function startSession(db: Db, userId: string, topicId: string, input: z.infer<typeof startInput>) {
  await ownedTopic(db, userId, topicId);
  const now = new Date();
  const states = await cardStates(db, userId, topicId);
  if (!states.length) throw badRequest('This topic has no flashcards yet. Add material and approve a study kit first.', 'no_cards');

  const isDue = (c: (typeof states)[number]) => !c.dueAt || c.dueAt <= now;
  const weakest = (a: (typeof states)[number], b: (typeof states)[number]) => (a.strength ?? 0) - (b.strength ?? 0);
  const scoped = input.concept ? states.filter((c) => c.concept === input.concept) : states;
  const due = scoped.filter(isDue).sort(weakest);
  const rest = scoped.filter((c) => !isDue(c)).sort(weakest);
  let pool: typeof states;
  if (input.mode === 'due') pool = due;
  else if (input.mode === 'weak') pool = scoped.filter((c) => (c.strength ?? 0) < 70).sort(weakest);
  else pool = [...due, ...rest]; // everything, due first, weakest first

  if (!pool.length) {
    const next = scoped.map((c) => c.dueAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return { empty: true as const, nextDueAt: next?.toISOString() ?? null, total: scoped.length };
  }
  const deck = input.limit === 0 ? pool.slice(0, 100) : pool.slice(0, input.limit);

  // One live session per topic: starting again retires the old one.
  await db.update(studySessions).set({ status: 'abandoned' }).where(and(eq(studySessions.userId, userId), eq(studySessions.topicId, topicId), eq(studySessions.status, 'active')));
  const [s] = await db.insert(studySessions).values({ userId, topicId, mode: input.mode, deck: deck.map((c) => c.id), cardsPresented: 1 }).returning();
  return { empty: false as const, session: s.id, cards: deck.map<DeckCard>(toDeckCard), answered: [] as string[] };
}

const toDeckCard = (c: { id: string; question: string; hint: string | null; concept: string | null; difficulty: string; reviewCount: number | null }): DeckCard => ({
  id: c.id, question: c.question, hint: c.hint, concept: c.concept ?? 'General', difficulty: c.difficulty, isNew: !c.reviewCount,
});

/** Resume an active session after a refresh. Reveals nothing beyond what the learner has already submitted. */
export async function getSession(db: Db, userId: string, sessionId: string) {
  const s = await ownedSession(db, userId, sessionId);
  const states = new Map((await cardStates(db, userId, s.topicId)).map((c) => [c.id, c]));
  const responses = await db.select().from(flashcardResponses).where(eq(flashcardResponses.sessionId, s.id));
  const answered = new Map(responses.map((r) => [r.flashcardId, r]));
  const cards = s.deck.map((id) => states.get(id)).filter((c): c is NonNullable<typeof c> => !!c).map(toDeckCard);
  return {
    session: s.id, topicId: s.topicId, status: s.status, mode: s.mode, cards,
    answered: [...answered.values()].map((r) => ({ flashcardId: r.flashcardId, rated: !!r.selfRating })),
  };
}

/* ───────────── step 1: submit an answer ───────────── */

export const responseInput = z.object({
  flashcardId: z.string().uuid(),
  answer: z.string().max(4000).default(''),
  /** The learner chose "I don't know" — stored as an explicit non-answer. */
  dontKnow: z.boolean().optional(),
});

/**
 * Persists the learner's answer FIRST, and only then returns the reference answer. This is the one place a
 * card's answer leaves the server for a study session, and it needs a stored response to get there.
 */
export async function submitResponse(db: Db, userId: string, sessionId: string, input: z.infer<typeof responseInput>) {
  const s = await ownedSession(db, userId, sessionId);
  if (s.status !== 'active') throw conflict('This session has ended. Start a new one.', 'session_closed');
  if (!s.deck.includes(input.flashcardId)) throw notFound('That card is not part of this session.');
  const answer = input.answer.trim();

  const [profile] = await db.select({ prefs: profiles.prefs }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!answer && !input.dontKnow && profile?.prefs.typeAnswers !== false) throw badRequest('Type your answer before revealing — even a guess helps. Use “I don’t know” if you’re stuck.', 'answer_required');

  const [card] = await db.select().from(flashcards).where(and(eq(flashcards.id, input.flashcardId), eq(flashcards.status, 'approved'))).limit(1);
  if (!card) throw notFound('Card not found.');

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx.insert(flashcardResponses).values({
      sessionId: s.id, flashcardId: card.id, userId, submittedAnswer: answer,
      evaluationMetadata: answer ? null : { skipped: true, dontKnow: !!input.dontKnow },
    }).onConflictDoNothing().returning({ id: flashcardResponses.id });
    if (row) await tx.update(studySessions).set({ answersSubmitted: sql`${studySessions.answersSubmitted} + 1` }).where(eq(studySessions.id, s.id));
    return row;
  });
  // Re-submitting the same card is harmless: the first stored answer stands and the reveal is repeated.
  const [resp] = await db.select().from(flashcardResponses).where(and(eq(flashcardResponses.sessionId, s.id), eq(flashcardResponses.flashcardId, card.id))).limit(1);

  return {
    responseId: resp.id, repeated: !inserted,
    reveal: { referenceAnswer: card.referenceAnswer, explanation: card.explanation, source: (card.sourceMetadata as { page?: number | null }).page ?? null },
    match: grade(resp.submittedAnswer, card.referenceAnswer),
    rated: !!resp.selfRating,
  };
}

/** Optional AI comparison. Advice only: it never changes a rating or awards anything. */
export async function aiFeedback(db: Db, userId: string, sessionId: string, flashcardId: string): Promise<FeedbackOut> {
  const s = await ownedSession(db, userId, sessionId);
  const [resp] = await db.select().from(flashcardResponses).where(and(eq(flashcardResponses.sessionId, s.id), eq(flashcardResponses.flashcardId, flashcardId))).limit(1);
  if (!resp) throw badRequest('Submit your answer first.', 'answer_required');
  if (!resp.submittedAnswer) throw badRequest('There is no typed answer to compare.', 'nothing_to_compare');
  if (!aiConfigured()) throw badRequest('AI feedback isn’t set up on this server.', 'ai_not_configured');
  await rateLimit(db, `feedback:${userId}`, 60, 3600);
  const [card] = await db.select().from(flashcards).where(eq(flashcards.id, flashcardId)).limit(1);
  if (!card) throw notFound();
  const provider = getProvider();
  const { data } = await provider.generateJson({
    system: FEEDBACK_SYSTEM, user: feedbackUser(card.question, card.referenceAnswer, resp.submittedAnswer),
    schema: feedbackOut, schemaName: 'answer_feedback', schemaDescription: 'Comparison of a learner answer with the reference answer.', maxTokens: 400,
  });
  await db.update(flashcardResponses).set({ evaluationMetadata: { ai: { similarity: data.similarity, model: provider.model, version: 'feedback-v1' } } }).where(eq(flashcardResponses.id, resp.id));
  return data;
}

/* ───────────── step 2: rate recall ───────────── */

export const reviewInput = z.object({ flashcardId: z.string().uuid(), rating: z.enum(['again', 'hard', 'good', 'easy']) });

export interface ReviewResult {
  nextDueAt: string; intervalDays: number; strength: number;
  xp: { review: AwardResult; dailyCommitment: AwardResult | null };
  unlocked: Unlocked[];
  today: { reviews: number; goal: number };
}

export async function rateCard(db: Db, userId: string, sessionId: string, input: z.infer<typeof reviewInput>): Promise<ReviewResult> {
  const s = await ownedSession(db, userId, sessionId);
  if (s.status !== 'active') throw conflict('This session has ended. Start a new one.', 'session_closed');
  if (!RATINGS.includes(input.rating)) throw badRequest('Unknown rating.');

  return db.transaction(async (tx) => {
    const [resp] = await tx.select().from(flashcardResponses)
      .where(and(eq(flashcardResponses.sessionId, s.id), eq(flashcardResponses.flashcardId, input.flashcardId))).limit(1);
    if (!resp) throw badRequest('Submit your answer before rating how well you remembered it.', 'answer_required');
    if (resp.selfRating) throw conflict('You already rated this card.', 'already_rated');

    const rules = await getRules(tx);
    const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    const tz = profile?.timezone ?? 'UTC';
    const now = new Date();
    const [prev] = await tx.select().from(reviewSchedules).where(and(eq(reviewSchedules.userId, userId), eq(reviewSchedules.flashcardId, input.flashcardId))).limit(1);
    const wasDue = !prev || prev.dueAt <= now;

    const next = schedule(prev ?? null, input.rating as Rating, now, rules.srs);
    await tx.insert(reviewSchedules).values({
      userId, flashcardId: input.flashcardId, dueAt: next.dueAt, intervalDays: next.intervalDays, easeFactor: next.easeFactor,
      reviewCount: next.reviewCount, lapses: next.lapses, strength: next.strength, lastReviewedAt: now,
    }).onConflictDoUpdate({
      target: [reviewSchedules.userId, reviewSchedules.flashcardId],
      set: { dueAt: next.dueAt, intervalDays: next.intervalDays, easeFactor: next.easeFactor, reviewCount: next.reviewCount, lapses: next.lapses, strength: next.strength, lastReviewedAt: now, updatedAt: now },
    });
    await tx.update(flashcardResponses).set({ selfRating: input.rating, ratedAt: now }).where(eq(flashcardResponses.id, resp.id));

    const today = dayKey(now, tz);
    // Only a review of a card that was actually due earns XP — drilling cards early does not.
    const review = wasDue
      ? await awardXp(tx, { userId, event: 'review', relatedId: resp.id, period: today, idempotencyKey: `review:${resp.id}` })
      : { awarded: 0, reason: 'ineligible' as const };

    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(flashcardResponses)
      .where(and(eq(flashcardResponses.userId, userId), sql`${flashcardResponses.ratedAt} is not null`,
        sql`to_char(${flashcardResponses.ratedAt} at time zone ${tz}, 'YYYY-MM-DD') = ${today}`));
    const commitment = n >= (profile?.dailyGoal ?? 20)
      ? await awardXp(tx, { userId, event: 'daily_commitment', relatedId: today, period: today, idempotencyKey: `daily_commitment:${today}` })
      : null;

    // Challenges and badges are evaluated when a session is completed — keeps each rating to a handful of queries.
    const unlocked: Unlocked[] = [];
    return {
      nextDueAt: next.dueAt.toISOString(), intervalDays: next.intervalDays, strength: next.strength,
      xp: { review, dailyCommitment: commitment }, unlocked, today: { reviews: n, goal: profile?.dailyGoal ?? 20 },
    };
  });
}

/* ───────────── step 3: finish ───────────── */

export async function completeSession(db: Db, userId: string, sessionId: string) {
  const s = await ownedSession(db, userId, sessionId);
  return db.transaction(async (tx) => {
    const rules = await getRules(tx);
    const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    const tz = profile?.timezone ?? 'UTC';
    const now = new Date();

    const rated = await tx.select().from(flashcardResponses).where(and(eq(flashcardResponses.sessionId, s.id), sql`${flashcardResponses.selfRating} is not null`));
    const needed = Math.min(rules.xp.minAnswersForSession, s.deck.length);
    const qualified = rated.length >= Math.max(1, needed);

    if (s.status === 'active') {
      await tx.update(studySessions).set({ status: 'completed', completedAt: now, qualified }).where(eq(studySessions.id, s.id));
    }
    const session = s.status === 'active' ? qualified : s.qualified;
    // Idempotent: completing twice cannot pay twice (unique key per session).
    const xp = session
      ? await awardXp(tx, { userId, event: 'study_session', relatedId: s.id, period: dayKey(s.completedAt ?? now, tz), idempotencyKey: `session:${s.id}` })
      : ({ awarded: 0, reason: 'ineligible' } as AwardResult);
    if (rated.length) await afterLearning(tx, userId, tz, now);
    const unlocked = await evaluateAchievements(tx, userId, now);

    const by = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const r of rated) by[r.selfRating as Rating]++;
    const [topic] = await tx.select({ title: topics.title }).from(topics).where(eq(topics.id, s.topicId)).limit(1);
    const reviewXp = await tx.execute(sql`select coalesce(sum(amount),0)::int as n from xp_ledger where user_id = ${userId} and related_activity_id in (select id::text from flashcard_responses where session_id = ${s.id})`);

    const states = await cardStates(tx, userId, s.topicId);
    const soon = states.filter((c) => s.deck.includes(c.id) && c.dueAt && c.dueAt.getTime() - now.getTime() < 864e5 * 2).length;
    return {
      topicTitle: topic?.title ?? '', reviewed: rated.length, ratings: by, qualified: session,
      xp: { session: xp.awarded, reviews: (reviewXp.rows[0] as { n: number }).n, sessionReason: xp.reason }, unlocked, soon,
    };
  });
}

/** Cards currently due for a user across all topics (new cards count as due). */
export async function dueCounts(db: Db | Tx, userId: string, now = new Date()) {
  const rows = await db.select({ topicId: flashcards.topicId, n: sql<number>`count(*)::int` }).from(flashcards)
    .innerJoin(topics, and(eq(topics.id, flashcards.topicId), eq(topics.ownerId, userId)))
    .leftJoin(reviewSchedules, and(eq(reviewSchedules.flashcardId, flashcards.id), eq(reviewSchedules.userId, userId)))
    .where(and(eq(flashcards.status, 'approved'), sql`(${reviewSchedules.dueAt} is null or ${reviewSchedules.dueAt} <= ${now})`))
    .groupBy(flashcards.topicId);
  return new Map(rows.map((r) => [r.topicId, r.n]));
}

