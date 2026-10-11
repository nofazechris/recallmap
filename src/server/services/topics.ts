import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { concepts, flashcards, quizQuestions, quizzes, resources, topics } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { ownedFlashcard, ownedTopic } from './ownership';
import { removeResourceFiles } from './resources';

export const topicInput = z.object({
  title: z.string().trim().min(1, 'Give your topic a name').max(120),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
  goal: z.string().trim().max(300).optional(),
  targetDate: z.string().trim().max(20).optional(),
  visibility: z.enum(['private', 'public']).optional(),
});

export async function createTopic(db: Db, userId: string, input: z.infer<typeof topicInput>) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(topics).where(and(eq(topics.ownerId, userId), isNull(topics.archivedAt)));
  if (row.n >= 100) throw badRequest('You have reached the limit of 100 active topics.', 'topic_limit');
  const [t] = await db.insert(topics).values({
    ownerId: userId, title: input.title, description: input.description ?? '', category: input.category ?? 'General',
    goal: input.goal || null, targetDate: input.targetDate || null, visibility: input.visibility ?? 'private',
  }).returning();
  return t;
}

export async function updateTopic(db: Db, userId: string, topicId: string, patch: Partial<z.infer<typeof topicInput>> & { archived?: boolean }) {
  await ownedTopic(db, userId, topicId, { includeArchived: true });
  const { archived, goal, targetDate, ...rest } = patch;
  await db.update(topics).set({
    ...rest,
    ...(goal !== undefined ? { goal: goal || null } : {}),
    ...(targetDate !== undefined ? { targetDate: targetDate || null } : {}),
    ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
    updatedAt: new Date(),
  }).where(eq(topics.id, topicId));
}

/** Deletes the topic and everything under it, including the stored files. */
export async function deleteTopic(db: Db, userId: string, topicId: string) {
  await ownedTopic(db, userId, topicId, { includeArchived: true });
  const files = await db.select({ key: resources.storageKey }).from(resources).where(eq(resources.topicId, topicId));
  await db.delete(topics).where(eq(topics.id, topicId));
  await removeResourceFiles(files.map((f) => f.key));
}

/* ───────── flashcards (owner editing) ───────── */

export const cardInput = z.object({
  question: z.string().trim().min(1, 'A card needs a question').max(1000),
  referenceAnswer: z.string().trim().min(1, 'A card needs an answer').max(4000),
  explanation: z.string().trim().max(4000).optional(),
  hint: z.string().trim().max(500).nullable().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  concept: z.string().trim().max(80).optional(),
});

export async function ensureConcept(db: Pick<Db, 'insert' | 'select'>, topicId: string, name: string, description = '') {
  const clean = name.trim().slice(0, 80) || 'General';
  const find = () => db.select().from(concepts).where(and(eq(concepts.topicId, topicId), eq(sql`lower(${concepts.name})`, clean.toLowerCase()))).limit(1);
  const [hit] = await find();
  if (hit) return hit;
  const [row] = await db.insert(concepts).values({ topicId, name: clean, description }).onConflictDoNothing().returning();
  if (row) return row;
  const [again] = await find();
  return again;
}

export async function addCard(db: Db, userId: string, topicId: string, input: z.infer<typeof cardInput>) {
  await ownedTopic(db, userId, topicId);
  const concept = await ensureConcept(db, topicId, input.concept ?? 'General');
  const [c] = await db.insert(flashcards).values({
    topicId, conceptId: concept.id, question: input.question, referenceAnswer: input.referenceAnswer,
    explanation: input.explanation ?? '', hint: input.hint ?? null, difficulty: input.difficulty ?? 'medium',
    createdBy: 'user', status: 'approved',
  }).returning();
  return c;
}

export async function editCard(db: Db, userId: string, cardId: string, patch: Partial<z.infer<typeof cardInput>> & { status?: 'draft' | 'approved' }) {
  const card = await ownedFlashcard(db, userId, cardId);
  const { concept, ...rest } = patch;
  const conceptId = concept !== undefined ? (await ensureConcept(db, card.topicId, concept)).id : undefined;
  await db.update(flashcards).set({ ...rest, ...(conceptId ? { conceptId } : {}), userEdited: true, updatedAt: new Date() }).where(eq(flashcards.id, cardId));
}

export async function deleteCard(db: Db, userId: string, cardId: string) {
  const card = await ownedFlashcard(db, userId, cardId);
  await db.delete(flashcards).where(eq(flashcards.id, cardId));
  await pruneConcepts(db, card.topicId);
}

/** Removes concepts nothing refers to any more (after cards/questions are deleted). */
export async function pruneConcepts(db: Db, topicId: string) {
  const res = await db.execute(sql`
    select c.id from concepts c where c.topic_id = ${topicId}
      and not exists (select 1 from flashcards f where f.concept_id = c.id)
      and not exists (select 1 from quiz_questions q where q.concept_id = c.id)`);
  const ids = (res.rows as { id: string }[]).map((r) => r.id);
  if (ids.length) await db.delete(concepts).where(inArray(concepts.id, ids));
}

export const questionInput = z.object({
  questionText: z.string().trim().min(1).max(1000).optional(),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6).optional(),
  correctIndex: z.number().int().min(0).optional(),
  trueFalse: z.boolean().optional(),
  explanation: z.string().trim().max(4000).optional(),
});

/** Owner edits to a quiz question (answer key included — never exposed through the quiz-taking routes). */
export async function editQuestion(db: Db, userId: string, questionId: string, patch: z.infer<typeof questionInput>) {
  const [row] = await db.select({ q: quizQuestions }).from(quizQuestions)
    .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId)).innerJoin(topics, eq(topics.id, quizzes.topicId))
    .where(and(eq(quizQuestions.id, questionId), eq(topics.ownerId, userId))).limit(1);
  if (!row) throw notFound('Question not found.');
  const q = row.q;
  const options = patch.options ?? q.options;
  let answerKey = q.answerKey;
  if (q.questionType === 'multiple_choice') {
    const idx = patch.correctIndex ?? (answerKey.type === 'multiple_choice' ? answerKey.correctIndex : 0);
    if (idx >= options.length) throw badRequest('The correct answer must be one of the options.');
    answerKey = { type: 'multiple_choice', correctIndex: idx };
  } else if (patch.trueFalse !== undefined) {
    answerKey = { type: 'true_false', value: patch.trueFalse };
  }
  await db.update(quizQuestions).set({
    questionText: patch.questionText ?? q.questionText, options: q.questionType === 'multiple_choice' ? options : q.options,
    answerKey, explanation: patch.explanation ?? q.explanation, version: q.version + 1,
  }).where(eq(quizQuestions.id, questionId));
}
