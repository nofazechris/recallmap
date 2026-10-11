import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { validateKit, type Passage } from '../ai/generate-study-content';
import { KIT_SYSTEM } from '../ai/prompts';
import { getProvider } from '../ai/provider';
import { flashcardOut, type StudyKitOut } from '../ai/schemas';
import { verifyKit } from '../ai/verify';
import type { Db } from '../db';
import { concepts, flashcards, resourceChunks, reviewSchedules } from '../db/schema';
import { HttpError, conflict } from '../lib/errors';
import { rateLimit } from '../lib/rate-limit';
import { ownedFlashcard } from './ownership';

const regenOut = z.object({ flashcard: flashcardOut });

/**
 * Replace ONE AI-written card with a fresh, verified one from the same source passage.
 * Never touches cards you wrote or edited, and refuses if the new card can't pass the same accuracy checks.
 */
export async function regenerateCard(db: Db, userId: string, cardId: string) {
  const card = await ownedFlashcard(db, userId, cardId);
  if (card.createdBy !== 'ai') throw conflict('Only AI-written cards can be regenerated.', 'not_ai_card');
  if (card.userEdited) throw conflict('You edited this card, so it won’t be overwritten.', 'user_edited');
  await rateLimit(db, `regen:${userId}`, 30, 3600);

  const meta = card.sourceMetadata as { chunkId?: string; page?: number | null; resourceId?: string };
  let chunk = meta.chunkId ? (await db.select().from(resourceChunks).where(eq(resourceChunks.id, meta.chunkId)).limit(1))[0] : undefined;
  if (!chunk && card.sourceResourceId) {
    const rows = await db.select().from(resourceChunks).where(eq(resourceChunks.resourceId, card.sourceResourceId)).orderBy(asc(resourceChunks.chunkIndex));
    chunk = rows.find((r) => r.pageNumber === meta.page) ?? rows[0];
  }
  if (!chunk) throw new HttpError(409, 'source_missing', 'The source passage for this card is no longer available.');

  const passage: Passage = { id: 'c1', chunkId: chunk.id, resourceId: chunk.resourceId, page: chunk.pageNumber, text: chunk.content };
  const [concept] = card.conceptId ? await db.select({ n: concepts.name }).from(concepts).where(eq(concepts.id, card.conceptId)).limit(1) : [];
  const provider = getProvider();
  const { data } = await provider.generateJson({
    system: KIT_SYSTEM,
    user: `Write exactly ONE new flashcard about the concept "${concept?.n ?? 'General'}", using only this passage. It must test something DIFFERENT from this existing question: "${card.question}".

<source>
<passage id="c1">
${passage.text}
</passage>
</source>`,
    schema: regenOut, schemaName: 'single_flashcard', schemaDescription: 'One replacement flashcard grounded in the passage.', maxTokens: 1500,
  });

  const out: StudyKitOut = { concepts: [], flashcards: [{ ...data.flashcard, source: 'c1', concept: concept?.n ?? data.flashcard.concept }], questions: [] };
  const checked = validateKit(out, [passage], { cards: 1, questions: 0, difficulty: 'mixed' });
  const verified = checked.cards.length ? await verifyKit(checked, [passage]) : null;
  const next = verified?.kit.cards[0];
  if (!next) throw new HttpError(422, 'regen_unverified', 'We couldn’t produce a replacement we could confirm against your text. Try again, or edit the card yourself.');

  await db.transaction(async (tx) => {
    await tx.update(flashcards).set({
      question: next.question, referenceAnswer: next.answer, explanation: next.explanation, hint: next.hint ?? null, difficulty: next.difficulty,
      sourceMetadata: { resourceId: passage.resourceId, page: passage.page, passage: 'c1', chunkId: chunk!.id }, updatedAt: new Date(),
    }).where(and(eq(flashcards.id, card.id), eq(flashcards.userEdited, false)));
    // The content changed, so any review history for the old wording no longer applies.
    await tx.delete(reviewSchedules).where(eq(reviewSchedules.flashcardId, card.id));
  });
  return { id: card.id, question: next.question, referenceAnswer: next.answer, explanation: next.explanation, difficulty: next.difficulty };
}
