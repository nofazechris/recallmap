import { and, asc, eq } from 'drizzle-orm';
import { authedRoute, body } from '@/server/http';
import { concepts, flashcards } from '@/server/db/schema';
import { ownedTopic } from '@/server/services/ownership';
import { addCard, cardInput } from '@/server/services/topics';

/** Owner view for editing: includes reference answers. The study flow never uses this route. */
export const GET = authedRoute<{ topicId: string }>(async ({ db, userId, params }) => {
  await ownedTopic(db, userId, params.topicId);
  const rows = await db.select({ c: flashcards, concept: concepts.name }).from(flashcards).leftJoin(concepts, eq(concepts.id, flashcards.conceptId))
    .where(and(eq(flashcards.topicId, params.topicId))).orderBy(asc(flashcards.createdAt));
  return { cards: rows.map(({ c, concept }) => ({ id: c.id, question: c.question, referenceAnswer: c.referenceAnswer, explanation: c.explanation, hint: c.hint, difficulty: c.difficulty, status: c.status, createdBy: c.createdBy, concept: concept ?? 'General' })) };
});
export const POST = authedRoute<{ topicId: string }>(async ({ req, db, userId, params }) => ({ card: await addCard(db, userId, params.topicId, await body(req, cardInput)) }));
