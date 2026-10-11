import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '../db';
import { flashcards, quizAttempts, quizzes, resources, studyKits, studySessions, topics } from '../db/schema';
import { notFound } from '../lib/errors';

const uuid = z.string().uuid();
/** A malformed id is simply "not found" — the same answer as for someone else's resource, so nothing leaks. */
const check = (id: string) => { if (!uuid.safeParse(id).success) throw notFound(); return id; };

export async function ownedTopic(db: DbOrTx, userId: string, topicId: string, opts: { includeArchived?: boolean } = {}) {
  const [t] = await db.select().from(topics)
    .where(and(eq(topics.id, check(topicId)), eq(topics.ownerId, userId), opts.includeArchived ? undefined : isNull(topics.archivedAt))).limit(1);
  if (!t) throw notFound('Topic not found.');
  return t;
}

export async function ownedResource(db: DbOrTx, userId: string, resourceId: string) {
  const [r] = await db.select().from(resources).where(and(eq(resources.id, check(resourceId)), eq(resources.ownerId, userId))).limit(1);
  if (!r) throw notFound('Resource not found.');
  return r;
}

export async function ownedFlashcard(db: DbOrTx, userId: string, cardId: string) {
  const [row] = await db.select({ card: flashcards }).from(flashcards)
    .innerJoin(topics, eq(topics.id, flashcards.topicId)).where(and(eq(flashcards.id, check(cardId)), eq(topics.ownerId, userId))).limit(1);
  if (!row) throw notFound('Flashcard not found.');
  return row.card;
}

export async function ownedQuiz(db: DbOrTx, userId: string, quizId: string) {
  const [row] = await db.select({ quiz: quizzes }).from(quizzes)
    .innerJoin(topics, eq(topics.id, quizzes.topicId)).where(and(eq(quizzes.id, check(quizId)), eq(topics.ownerId, userId))).limit(1);
  if (!row) throw notFound('Quiz not found.');
  return row.quiz;
}

export async function ownedKit(db: DbOrTx, userId: string, kitId: string) {
  const [k] = await db.select().from(studyKits).where(and(eq(studyKits.id, check(kitId)), eq(studyKits.ownerId, userId))).limit(1);
  if (!k) throw notFound('Study kit not found.');
  return k;
}

export async function ownedSession(db: DbOrTx, userId: string, sessionId: string) {
  const [s] = await db.select().from(studySessions).where(and(eq(studySessions.id, check(sessionId)), eq(studySessions.userId, userId))).limit(1);
  if (!s) throw notFound('Study session not found.');
  return s;
}

export async function ownedAttempt(db: DbOrTx, userId: string, attemptId: string) {
  const [a] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.id, check(attemptId)), eq(quizAttempts.userId, userId))).limit(1);
  if (!a) throw notFound('Quiz attempt not found.');
  return a;
}
