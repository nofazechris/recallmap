import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AiError, aiConfigured, getProvider } from '../ai/provider';
import { generateStudyContent, type SourceChunk } from '../ai/generate-study-content';
import { kitConfig } from '../ai/schemas';
import type { Db } from '../db';
import { conceptEdges, concepts, flashcards, quizQuestions, quizzes, resourceChunks, resources, studyKits, topics } from '../db/schema';
import { HttpError, badRequest, conflict } from '../lib/errors';
import { errMessage, log } from '../lib/log';
import { rateLimit } from '../lib/rate-limit';
import { enqueue, PermanentJobError, registerHandler } from './jobs';
import { notify } from './notifications';
import { ownedKit, ownedTopic } from './ownership';
import { ensureConcept, pruneConcepts } from './topics';
import { escapeHtml } from './users';

export const kitRequest = z.object({
  resourceIds: z.array(z.string().uuid()).max(20).optional(),
  config: kitConfig.partial().optional(),
});

/** Queue a generation. Returns immediately; the client polls the kit's status. */
export async function requestKit(db: Db, userId: string, topicId: string, input: z.infer<typeof kitRequest>) {
  const topic = await ownedTopic(db, userId, topicId);
  if (!aiConfigured()) getProvider(); // throws the friendly "AI isn't set up" error
  await rateLimit(db, `kit:${userId}`, 10, 3600);

  const ready = await db.select({ id: resources.id }).from(resources)
    .where(and(eq(resources.topicId, topic.id), eq(resources.ownerId, userId), eq(resources.processingStatus, 'ready')));
  const chosen = input.resourceIds?.length ? input.resourceIds : ready.map((r) => r.id);
  const readySet = new Set(ready.map((r) => r.id));
  if (!chosen.length) throw badRequest('Add and process a study resource first — there’s nothing to generate from yet.', 'no_resources');
  if (chosen.some((id) => !readySet.has(id))) throw badRequest('Some selected resources aren’t ready yet or don’t belong to this topic.', 'resources_not_ready');

  const config = kitConfig.parse(input.config ?? {});
  const [kit] = await db.insert(studyKits).values({ topicId: topic.id, ownerId: userId, resourceIds: chosen, config, status: 'queued' }).returning();
  const job = await enqueue(db, { type: 'generate_study_kit', payload: { kitId: kit.id }, dedupeKey: `kit:${topic.id}`, maxAttempts: 2 });
  if (!job.created) {
    await db.delete(studyKits).where(eq(studyKits.id, kit.id));
    throw conflict('A study kit is already being generated for this topic. Wait for it to finish.', 'already_generating');
  }
  return { kit, jobId: job.id };
}

async function failKit(db: Db, kitId: string, message: string) {
  await db.update(studyKits).set({ status: 'failed', error: message, completedAt: new Date() }).where(eq(studyKits.id, kitId));
}

/** Worker: build the kit and save it as drafts for the learner to review. */
export async function runKit(db: Db, kitId: string) {
  const [kit] = await db.select().from(studyKits).where(eq(studyKits.id, kitId)).limit(1);
  if (!kit) throw new PermanentJobError('Study kit no longer exists.');
  const [topic] = await db.select().from(topics).where(eq(topics.id, kit.topicId)).limit(1);
  if (!topic) throw new PermanentJobError('Topic no longer exists.');
  await db.update(studyKits).set({ status: 'generating', error: null }).where(eq(studyKits.id, kitId));

  try {
    const rows = await db.select({ id: resourceChunks.id, resourceId: resourceChunks.resourceId, page: resourceChunks.pageNumber, text: resourceChunks.content })
      .from(resourceChunks).innerJoin(resources, eq(resources.id, resourceChunks.resourceId))
      .where(and(inArray(resourceChunks.resourceId, kit.resourceIds), eq(resources.ownerId, kit.ownerId)))
      .orderBy(asc(resourceChunks.resourceId), asc(resourceChunks.chunkIndex));
    if (!rows.length) throw new PermanentJobError('The selected resources have no readable text.');
    const chunks: SourceChunk[] = rows;

    const gen = await generateStudyContent({ topic: topic.title, goal: topic.goal, config: kit.config as never, chunks });
    const { kit: out } = gen;
    if (out.cards.length === 0 && out.questions.length === 0) {
      throw new PermanentJobError('We couldn’t build study content we’re confident is correct from this material — nothing survived the accuracy checks against your text. Try a longer or clearer document.');
    }

    await db.transaction(async (tx) => {
      const byName = new Map<string, string>();
      const concept = async (name: string, desc = '') => {
        const key = name.toLowerCase();
        if (!byName.has(key)) byName.set(key, (await ensureConcept(tx as unknown as Db, topic.id, name, desc)).id);
        return byName.get(key)!;
      };
      for (const c of out.concepts) await concept(c.name, c.description);
      for (const c of out.concepts) {
        const from = await concept(c.name);
        for (const r of c.related) {
          const to = byName.get(r.toLowerCase());
          if (to && to !== from) await tx.insert(conceptEdges).values({ topicId: topic.id, fromConceptId: from, toConceptId: to }).onConflictDoNothing();
        }
      }

      const meta = (p: { resourceId: string; page: number | null; id: string; chunkId?: string }) => ({ resourceId: p.resourceId, page: p.page, passage: p.id, chunkId: p.chunkId });
      for (const c of out.cards) {
        await tx.insert(flashcards).values({
          topicId: topic.id, studyKitId: kit.id, sourceResourceId: c.passage.resourceId, conceptId: await concept(c.concept),
          question: c.question, referenceAnswer: c.answer, explanation: c.explanation, hint: c.hint ?? null, difficulty: c.difficulty,
          sourceMetadata: meta(c.passage), generationVersion: gen.promptVersion, createdBy: 'ai', status: 'draft',
        });
      }
      if (out.questions.length) {
        const [quiz] = await tx.insert(quizzes).values({
          topicId: topic.id, studyKitId: kit.id, title: `${topic.title} — quiz`, description: 'Generated from your material', status: 'draft', generationVersion: gen.promptVersion,
        }).returning();
        let pos = 0;
        for (const q of out.questions) {
          await tx.insert(quizQuestions).values({
            quizId: quiz.id, conceptId: await concept(q.concept), questionText: q.prompt, questionType: q.type, options: q.options,
            answerKey: q.type === 'multiple_choice' ? { type: 'multiple_choice', correctIndex: q.correctIndex! } : { type: 'true_false', value: q.answer! },
            explanation: q.explanation, sourceMetadata: meta(q.passage), position: pos++,
          });
        }
      }
      await tx.update(studyKits).set({
        config: { ...(kit.config as { cards: number; questions: number; difficulty: string }), report: { generated: { cards: out.cards.length + gen.verify.droppedCards, questions: out.questions.length + gen.verify.droppedQuestions }, removedUnsupported: gen.structuralDrops.cards + gen.structuralDrops.questions, removedUnverified: gen.verify.droppedCards + gen.verify.droppedQuestions } },
        status: 'ready', completedAt: new Date(), provider: gen.provider, model: gen.model, promptVersion: gen.promptVersion,
        tokensIn: gen.usage.tokensIn, tokensOut: gen.usage.tokensOut, error: null,
      }).where(eq(studyKits.id, kitId));
    });

    await notify(db, kit.ownerId, 'xp', `Study kit ready for <strong>${escapeHtml(topic.title)}</strong> — ${out.cards.length} flashcards, ${out.questions.length} questions to review.`, `/app/topics/${topic.id}`);
    log.info('kit_ready', { kitId, cards: out.cards.length, questions: out.questions.length, dropped: out.dropped, tokensIn: gen.usage.tokensIn, tokensOut: gen.usage.tokensOut });
  } catch (e) {
    const retryable = e instanceof AiError && e.retryable;
    const message = e instanceof PermanentJobError || e instanceof AiError || e instanceof HttpError ? e.message : 'Something went wrong while generating. Please try again.';
    log.warn('kit_failed', { kitId, message: errMessage(e), retryable });
    await failKit(db, kitId, message);
    if (retryable) throw e;
    throw e instanceof PermanentJobError ? e : new PermanentJobError(message);
  }
}
registerHandler('generate_study_kit', async (db, payload) => runKit(db, String(payload.kitId)));

/* ───────── review: the learner approves, edits or discards ───────── */

export async function getKit(db: Db, userId: string, kitId: string) {
  const kit = await ownedKit(db, userId, kitId);
  const cards = await db.select().from(flashcards).where(eq(flashcards.studyKitId, kit.id)).orderBy(asc(flashcards.createdAt));
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.studyKitId, kit.id)).limit(1);
  const questions = quiz ? await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.position)) : [];
  const names = new Map((await db.select({ id: concepts.id, name: concepts.name }).from(concepts).where(eq(concepts.topicId, kit.topicId))).map((c) => [c.id, c.name]));
  return { kit, quiz: quiz ?? null, cards: cards.map((c) => ({ ...c, concept: names.get(c.conceptId ?? '') ?? 'General' })), questions: questions.map((q) => ({ ...q, concept: names.get(q.conceptId ?? '') ?? 'General' })) };
}

export async function listKits(db: Db, userId: string, topicId: string) {
  await ownedTopic(db, userId, topicId);
  return db.select().from(studyKits).where(and(eq(studyKits.topicId, topicId), eq(studyKits.ownerId, userId))).orderBy(desc(studyKits.createdAt)).limit(20);
}

export const approveInput = z.object({
  cardIds: z.array(z.string().uuid()).optional(),
  questionIds: z.array(z.string().uuid()).optional(),
});

/** Keep the chosen drafts (all by default), drop the rest, and publish the quiz. */
export async function approveKit(db: Db, userId: string, kitId: string, input: z.infer<typeof approveInput>) {
  const kit = await ownedKit(db, userId, kitId);
  if (kit.status !== 'ready') throw conflict(kit.status === 'approved' ? 'This kit has already been saved.' : 'This kit isn’t ready to approve yet.', 'bad_state');
  const result = await db.transaction(async (tx) => {
    const drafts = await tx.select({ id: flashcards.id }).from(flashcards).where(and(eq(flashcards.studyKitId, kit.id), eq(flashcards.status, 'draft')));
    const keep = new Set(input.cardIds ?? drafts.map((d) => d.id));
    const keepIds = drafts.map((d) => d.id).filter((id) => keep.has(id));
    const dropIds = drafts.map((d) => d.id).filter((id) => !keep.has(id));
    if (keepIds.length) await tx.update(flashcards).set({ status: 'approved', updatedAt: new Date() }).where(inArray(flashcards.id, keepIds));
    if (dropIds.length) await tx.delete(flashcards).where(inArray(flashcards.id, dropIds));

    const [quiz] = await tx.select().from(quizzes).where(eq(quizzes.studyKitId, kit.id)).limit(1);
    let keptQuestions = 0;
    if (quiz) {
      const qs = await tx.select({ id: quizQuestions.id }).from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id));
      const qKeep = new Set(input.questionIds ?? qs.map((q) => q.id));
      const qDrop = qs.map((q) => q.id).filter((id) => !qKeep.has(id));
      if (qDrop.length) await tx.delete(quizQuestions).where(inArray(quizQuestions.id, qDrop));
      keptQuestions = qs.length - qDrop.length;
      if (keptQuestions > 0) await tx.update(quizzes).set({ status: 'published', updatedAt: new Date() }).where(eq(quizzes.id, quiz.id));
      else await tx.delete(quizzes).where(eq(quizzes.id, quiz.id));
    }
    await tx.update(studyKits).set({ status: 'approved' }).where(eq(studyKits.id, kit.id));
    return { cards: keepIds.length, questions: keptQuestions };
  });
  await pruneConcepts(db, kit.topicId);
  return result;
}

/** Throw the whole draft kit away. */
export async function discardKit(db: Db, userId: string, kitId: string) {
  const kit = await ownedKit(db, userId, kitId);
  if (kit.status === 'approved') throw conflict('This kit was already saved. Delete cards individually instead.', 'bad_state');
  await db.transaction(async (tx) => {
    await tx.delete(flashcards).where(and(eq(flashcards.studyKitId, kit.id), eq(flashcards.status, 'draft')));
    await tx.delete(quizzes).where(and(eq(quizzes.studyKitId, kit.id), eq(quizzes.status, 'draft')));
    await tx.delete(studyKits).where(eq(studyKits.id, kit.id));
  });
  await pruneConcepts(db, kit.topicId);
}

export const kitCount = async (db: Db, topicId: string) => {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(studyKits).where(eq(studyKits.topicId, topicId));
  return r.n;
};
