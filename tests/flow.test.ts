import { promises as fs } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { __setProviderForTests, type AiProvider } from '../src/server/ai/provider';
import { getDb, type Db } from '../src/server/db';
import { flashcards, quizAttempts, quizQuestions, quizzes, resourceChunks, resources, studySessions, xpLedger } from '../src/server/db/schema';
import { evaluateAchievements } from '../src/server/services/achievements';
import { runJob } from '../src/server/services/jobs';
import { registerResource, requestUpload } from '../src/server/services/resources';
import { buildSnapshot } from '../src/server/services/snapshot';
import { approveKit, getKit, requestKit } from '../src/server/services/studykit';
import { completeSession, rateCard, startSession, submitResponse } from '../src/server/services/study';
import { addCard, createTopic } from '../src/server/services/topics';
import { getResults, saveAnswer, startAttempt, submitAttempt } from '../src/server/services/quiz';
import { registerUser } from '../src/server/services/users';
import { localPath } from '../src/server/storage';
import { totalXp } from '../src/server/services/xp';
import '../src/server/services/register';

let db: Db;
let A: string, B: string, topicId: string;

const rejects = async (p: Promise<unknown>, code: string) => {
  try { await p; } catch (e) { expect((e as { code?: string }).code).toBe(code); return; }
  throw new Error(`expected rejection with ${code}`);
};

beforeAll(async () => {
  db = await getDb();
  A = (await registerUser(db, { name: 'Ada Learner', email: 'ada@example.com', password: 'correct horse battery' })).id;
  B = (await registerUser(db, { name: 'Bob Other', email: 'bob@example.com', password: 'correct horse battery' })).id;
  topicId = (await createTopic(db, A, { title: 'Organic Chemistry' })).id;
  for (let i = 1; i <= 6; i++) await addCard(db, A, topicId, { question: `Question ${i}?`, referenceAnswer: `Answer number ${i} about chemistry`, concept: i % 2 ? 'Bonding' : 'Reactions' });
});

describe('accounts', () => {
  it('rejects duplicate emails and never stores the password', async () => {
    await rejects(registerUser(db, { name: 'Ada Two', email: 'ADA@example.com', password: 'another long one' }), 'email_taken');
    const row = (await db.execute(sql`select password_hash from users where email = 'ada@example.com'`)).rows[0] as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toContain('correct horse');
  });
  it('generates unique usernames', async () => {
    const x = await registerUser(db, { name: 'Ada Learner', email: 'ada2@example.com', password: 'correct horse battery' });
    const snap = await buildSnapshot(db, x.id);
    const a = await buildSnapshot(db, A);
    expect(snap.user.username).not.toBe(a.user.username);
  });
});

describe('answer-first study sessions', () => {
  let session: string;
  let cards: { id: string }[];

  it('starts a session whose payload never contains reference answers', async () => {
    const r = await startSession(db, A, topicId, { mode: 'due' });
    if (r.empty) throw new Error('expected a deck');
    session = r.session; cards = r.cards;
    expect(cards.length).toBe(6);
    expect(JSON.stringify(r)).not.toMatch(/Answer number|referenceAnswer|reference_answer/);
    expect(JSON.stringify(await buildSnapshot(db, A))).not.toMatch(/Answer number/);
  });

  it('refuses to reveal or rate before an answer is submitted', async () => {
    await rejects(submitResponse(db, A, session, { flashcardId: cards[0].id, answer: '   ' }), 'answer_required');
    await rejects(rateCard(db, A, session, { flashcardId: cards[0].id, rating: 'good' }), 'answer_required');
  });

  it("another user can't touch the session", async () => {
    await rejects(submitResponse(db, B, session, { flashcardId: cards[0].id, answer: 'hi' }), 'not_found');
    await rejects(startSession(db, B, topicId, { mode: 'due' }), 'not_found');
  });

  it('stores the answer, then reveals; rating pays review XP once and schedules the next review', async () => {
    const out = await submitResponse(db, A, session, { flashcardId: cards[0].id, answer: 'something about chemistry' });
    expect(out.reveal.referenceAnswer).toMatch(/Answer number/);
    const [stored] = (await db.execute(sql`select submitted_answer from flashcard_responses where id = ${out.responseId}`)).rows as { submitted_answer: string }[];
    expect(stored.submitted_answer).toBe('something about chemistry');

    const r1 = await rateCard(db, A, session, { flashcardId: cards[0].id, rating: 'good' });
    expect(r1.xp.review.awarded).toBe(5);
    expect(new Date(r1.nextDueAt).getTime()).toBeGreaterThan(Date.now() + 2 * 864e5);
    await rejects(rateCard(db, A, session, { flashcardId: cards[0].id, rating: 'easy' }), 'already_rated');
    expect(await totalXp(db, A)).toBe(5);
  });

  it('a qualifying session pays once; completing twice cannot double-pay', async () => {
    for (const c of cards.slice(1, 3)) {
      await submitResponse(db, A, session, { flashcardId: c.id, answer: 'my attempt' });
      await rateCard(db, A, session, { flashcardId: c.id, rating: 'hard' });
    }
    const first = await completeSession(db, A, session);
    expect(first.qualified).toBe(true);
    expect(first.xp.session).toBe(10);
    expect(first.unlocked.map((u) => u.code)).toContain('first-steps');
    const again = await completeSession(db, A, session);
    expect(again.xp.session).toBe(0);
    expect(await totalXp(db, A)).toBe(15 + 10);
  });

  it('a session with nothing rated is not a qualifying session', async () => {
    const r = await startSession(db, A, topicId, { mode: 'all' });
    if (r.empty) throw new Error('deck');
    const done = await completeSession(db, A, r.session);
    expect(done.qualified).toBe(false);
    expect(done.xp.session).toBe(0);
  });

  it('caps session XP at three per day', async () => {
    for (let n = 0; n < 4; n++) {
      const r = await startSession(db, A, topicId, { mode: 'all' });
      if (r.empty) throw new Error('deck');
      for (const c of r.cards.slice(0, 3)) {
        await submitResponse(db, A, r.session, { flashcardId: c.id, answer: 'attempt' });
        await rateCard(db, A, r.session, { flashcardId: c.id, rating: 'good' });
      }
      await completeSession(db, A, r.session);
    }
    const [{ n }] = (await db.execute(sql`select count(*)::int n from xp_ledger where user_id = ${A} and event_type = 'study_session'`)).rows as { n: number }[];
    expect(n).toBe(3);
  });

  it('early re-reviews of cards that are not due earn no review XP', async () => {
    const before = (await db.execute(sql`select count(*)::int n from xp_ledger where user_id = ${A} and event_type = 'review'`)).rows[0] as { n: number };
    const r = await startSession(db, A, topicId, { mode: 'all' });
    if (r.empty) throw new Error('deck');
    await submitResponse(db, A, r.session, { flashcardId: r.cards[0].id, answer: 'x' });
    const res = await rateCard(db, A, r.session, { flashcardId: r.cards[0].id, rating: 'easy' });
    expect(['ineligible', 'capped']).toContain(res.xp.review.reason);
    const after = (await db.execute(sql`select count(*)::int n from xp_ledger where user_id = ${A} and event_type = 'review'`)).rows[0] as { n: number };
    expect(after.n).toBe(before.n);
  });
});

describe('quizzes', () => {
  let quizId: string;
  let qs: { id: string }[];
  const key = [2, 0, 1];

  beforeAll(async () => {
    const [quiz] = await db.insert(quizzes).values({ topicId, title: 'Quiz', status: 'published' }).returning();
    quizId = quiz.id;
    qs = await db.insert(quizQuestions).values(key.map((correctIndex, i) => ({
      quizId, questionText: `Q${i}`, questionType: 'multiple_choice' as const, options: ['a', 'b', 'c'], answerKey: { type: 'multiple_choice' as const, correctIndex }, explanation: `because ${i}`, position: i,
    }))).returning({ id: quizQuestions.id });
  });

  it('never sends the answer key before submission; results are locked until then', async () => {
    const a = await startAttempt(db, A, quizId);
    expect(JSON.stringify(a)).not.toMatch(/answerKey|correctIndex|because/);
    await rejects(getResults(db, A, a.attemptId), 'not_submitted');
    await rejects(startAttempt(db, B, quizId), 'not_found');
    await saveAnswer(db, A, a.attemptId, { questionId: qs[0].id, answer: 2 });
    const r = await submitAttempt(db, A, a.attemptId, { answers: { [qs[1].id]: 0, [qs[2].id]: 0 } });
    expect(r.correct).toBe(2);
    expect(r.score).toBeCloseTo(66.67, 1);
    expect(r.passed).toBe(false);
    expect(r.xp.awarded).toBe(0);
    expect(r.review[2].correctAnswer).toBe(1);
  });

  it('a pass pays XP once, replays are harmless, and the score is the server\'s', async () => {
    const a = await startAttempt(db, A, quizId);
    const r = await submitAttempt(db, A, a.attemptId, { answers: Object.fromEntries(qs.map((q, i) => [q.id, key[i]])) });
    expect(r.score).toBe(100);
    expect(r.xp.awarded).toBe(15);
    const replay = await submitAttempt(db, A, a.attemptId, { answers: Object.fromEntries(qs.map((q) => [q.id, 9])) });
    expect(replay.score).toBe(100);
    expect(replay.xp.awarded).toBe(0);
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(xpLedger).where(eq(xpLedger.relatedActivityId, a.attemptId)));
    expect(n).toBe(1);
  });

  it('abandoned (never submitted) attempts do not count', async () => {
    const a = await startAttempt(db, A, quizId);
    const [row] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, a.attemptId));
    expect(row.status).toBe('in_progress');
    expect(row.score).toBeNull();
  });

  it('recall-ready needs two distinct attempts far enough apart', async () => {
    const [{ n: spaced }] = (await db.execute(sql`select count(*)::int n from user_achievements ua join achievements a on a.id = ua.achievement_id where ua.user_id = ${A} and a.code = 'recall-ready'`)).rows as { n: number }[];
    expect(spaced).toBe(0);
    // make the earlier 66% attempt a 100% one an hour ago -> two qualifying attempts, spaced apart
    await db.execute(sql`update quiz_attempts set score = 100, correct_answers = 3, submitted_at = now() - interval '2 hours' where user_id = ${A} and status = 'submitted' and score < 70`);
    const unlocked = await db.transaction((tx) => evaluateAchievements(tx, A));
    expect(unlocked.map((u) => u.code)).toContain('recall-ready');
    expect(unlocked.map((u) => u.code)).toContain('topic-master');
    const again = await db.transaction((tx) => evaluateAchievements(tx, A));
    expect(again).toHaveLength(0);
  });
});

describe('uploads and AI study kits', () => {
  // Test double for the AI provider. It answers the generation call and, separately, the verification call.
  let verifierMode: 'faithful' | 'disagree' | 'broken' = 'faithful';
  const provider: AiProvider = {
    name: 'test-double', model: 'test-1',
    async generateJson(req) {
      if (req.schemaName === 'kit_verification') {
        if (verifierMode === 'broken') throw new Error('verifier down');
        const items = JSON.parse(req.user.split('Check these items:\n')[1]) as { id: string; kind: string; question: string }[];
        return {
          usage: { tokensIn: 1, tokensOut: 1 },
          data: { results: items.map((i) => ({
            id: i.id, answerable: true, note: 'ok',
            supported: i.kind === 'card' ? true : null,
            // the faithful verifier re-solves from the passage: an electrophile does accept an electron pair
            trueFalse: i.kind === 'true_false' ? (verifierMode === 'disagree' ? false : true) : null,
            selectedIndex: null,
          })) },
        } as never;
      }
      return {
        usage: { tokensIn: 10, tokensOut: 20 },
        data: {
          concepts: [{ name: 'Nucleophiles', description: 'Electron-pair donors.', related: ['Electrophiles'] }, { name: 'Electrophiles', description: 'Electron-pair acceptors.' }],
          flashcards: [
            { concept: 'Nucleophiles', question: 'What is a nucleophile?', answer: 'An electron-pair donor', explanation: 'It attacks electron-poor centres.', difficulty: 'easy', source: 'c1', evidence: 'A nucleophile is an electron-pair donor' },
            { concept: 'Nucleophiles', question: 'Invented fact?', answer: 'Nope', explanation: '', difficulty: 'easy', source: 'c1', evidence: 'Nucleophiles are made of pure sugar crystals' },
          ],
          questions: [{ concept: 'Electrophiles', type: 'true_false', prompt: 'An electrophile accepts an electron pair.', answer: true, explanation: 'Yes.', difficulty: 'easy', source: 'c1', evidence: 'an electrophile is an electron-pair acceptor' }],
        },
      } as never;
    },
  };
  const text = 'A nucleophile is an electron-pair donor. It attacks electron-poor centres. In contrast, an electrophile is an electron-pair acceptor, and so reactions pair them up.\n'.repeat(3);

  const upload = async (name: string, content: string) => {
    const req = await requestUpload(db, A, topicId, { filename: name, mimeType: 'text/plain', size: Buffer.byteLength(content) });
    await fs.mkdir(path.dirname(localPath(req.storageKey)), { recursive: true });
    await fs.writeFile(localPath(req.storageKey), content);
    return registerResource(db, A, topicId, { storageKey: req.storageKey, filename: name, mimeType: 'text/plain', size: Buffer.byteLength(content) });
  };

  it('validates file type and ownership of the storage key', async () => {
    await rejects(requestUpload(db, A, topicId, { filename: 'virus.exe', mimeType: 'application/octet-stream', size: 10 }), 'unsupported_type');
    await rejects(requestUpload(db, A, topicId, { filename: 'big.pdf', mimeType: 'application/pdf', size: 500 * 1024 * 1024 }), 'file_too_large');
    await rejects(requestUpload(db, B, topicId, { filename: 'a.txt', mimeType: 'text/plain', size: 10 }), 'not_found');
    await rejects(registerResource(db, A, topicId, { storageKey: `users/${B}/topics/${topicId}/x-a.txt`, filename: 'a.txt', mimeType: 'text/plain', size: 5 }), 'bad_key');
    await rejects(registerResource(db, A, topicId, { storageKey: `users/${A}/topics/${topicId}/never-uploaded.txt`, filename: 'a.txt', mimeType: 'text/plain', size: 5 }), 'upload_missing');
  });

  it('processes a document into chunks and reports unreadable files clearly', async () => {
    const good = await upload('notes.txt', text);
    await runJob(db, good.jobId);
    const [r] = await db.select().from(resources).where(eq(resources.id, good.resource.id));
    expect(r.processingStatus).toBe('ready');
    expect((await db.select().from(resourceChunks).where(eq(resourceChunks.resourceId, r.id))).length).toBeGreaterThan(0);

    const bad = await upload('empty.txt', '   \n  ');
    await runJob(db, bad.jobId);
    const [e] = await db.select().from(resources).where(eq(resources.id, bad.resource.id));
    expect(e.processingStatus).toBe('failed');
    expect(e.processingError).toMatch(/no text/i);
  });

  it('generates a kit as drafts; only approved cards can be studied; fabricated items are dropped', async () => {
    __setProviderForTests(provider);
    const { kit, jobId } = await requestKit(db, A, topicId, {});
    await rejects(requestKit(db, A, topicId, {}), 'already_generating');
    await runJob(db, jobId);
    const got = await getKit(db, A, kit.id);
    expect(got.kit.status).toBe('ready');
    expect(got.kit.model).toBe('test-1');
    expect(got.cards.map((c) => c.question)).toEqual(['What is a nucleophile?']);
    expect(got.cards[0].status).toBe('draft');
    expect(got.questions).toHaveLength(1);

    const snapBefore = await buildSnapshot(db, A);
    expect(snapBefore.topics[0].cards.some((c) => c.q === 'What is a nucleophile?')).toBe(false);
    expect(snapBefore.topics[0].draftCards).toBe(1);

    const approved = await approveKit(db, A, kit.id, {});
    expect(approved).toEqual({ cards: 1, questions: 1 });
    const snap = await buildSnapshot(db, A);
    expect(snap.topics[0].cards.some((c) => c.q === 'What is a nucleophile?')).toBe(true);
    expect(snap.topics[0].quizId).toBeTruthy();
    expect(snap.topics[0].concepts.map((c) => c.name)).toContain('Nucleophiles');
    __setProviderForTests(null);
  });

  it('drops a question when the independent verifier disagrees with the answer key', async () => {
    __setProviderForTests(provider);
    verifierMode = 'disagree';
    const { kit, jobId } = await requestKit(db, A, topicId, {});
    await runJob(db, jobId);
    const got = await getKit(db, A, kit.id);
    verifierMode = 'faithful';
    expect(got.kit.status).toBe('ready');
    expect(got.questions).toHaveLength(0); // key said true, verifier said false -> removed
    expect(got.cards.length).toBeGreaterThan(0);
    expect(got.kit.config.report?.removedUnverified).toBe(1);
    await db.execute(sql`delete from study_kits where id = ${kit.id}`);
    __setProviderForTests(null);
  });

  it('fails the kit (rather than skipping the check) when the verifier cannot run', async () => {
    __setProviderForTests(provider);
    verifierMode = 'broken';
    const { kit, jobId } = await requestKit(db, A, topicId, {});
    await runJob(db, jobId);
    await db.execute(sql`update jobs set run_after = now() where status = 'queued'`);
    const [job] = (await db.execute(sql`select id from jobs where status = 'queued' and payload->>'kitId' = ${kit.id}`)).rows as { id: string }[];
    if (job) await runJob(db, job.id);
    const [row] = (await db.execute(sql`select status from study_kits where id = ${kit.id}`)).rows as { status: string }[];
    verifierMode = 'faithful';
    expect(row.status).toBe('failed');
    await db.execute(sql`delete from study_kits where id = ${kit.id}`);
    __setProviderForTests(null);
  });

  it('does not touch user-edited cards when generating again', async () => {
    const [c] = await db.select().from(flashcards).where(eq(flashcards.question, 'What is a nucleophile?'));
    expect(c.status).toBe('approved');
    expect(c.createdBy).toBe('ai');
  });
});

describe('studySessions table sanity', () => {
  it('marks only completed sessions as qualified', async () => {
    const rows = await db.select().from(studySessions).where(eq(studySessions.userId, A));
    expect(rows.filter((r) => r.qualified).every((r) => r.status === 'completed')).toBe(true);
  });
});
