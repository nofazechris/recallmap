/**
 * Credential service tests. The CHAIN here is an explicitly-named in-memory test double (MockChain) so the issuance
 * state machine can be exercised deterministically. The real contract is tested separately in contract.test.ts,
 * and nothing in this file claims real blockchain verification.
 */
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import { __setChainForTests, type ChainClient, type OnchainCredential, type Receipt } from '../src/server/chain/client';
import { canonicalize, hashPayload, onchainId } from '../src/server/chain/payload';
import { getDb, type Db } from '../src/server/db';
import { credentials, jobs, quizAttempts, quizQuestions, quizzes, userAchievements } from '../src/server/db/schema';
import { evaluateAchievements } from '../src/server/services/achievements';
import { issueCredential, retryCredential, runConfirm, runIssue, verifyPublic } from '../src/server/services/credentials';
import { runJob, RetryLater } from '../src/server/services/jobs';
import { createTopic } from '../src/server/services/topics';
import { registerUser } from '../src/server/services/users';
import '../src/server/services/register';

class MockChain implements ChainClient {
  chainId = 5042002;
  contract = '0x00000000000000000000000000000000000c0de1' as const;
  issuer = '0x00000000000000000000000000000000000a11ce' as const;
  explorerUrl = 'https://explorer.example';
  store = new Map<Hex, OnchainCredential>();
  txs = new Map<Hex, { id: Hex; hash: Hex; revert: boolean; polls: number }>();
  pollsBeforeMined = 1;
  revertNext = false;
  down = false;
  submitted = 0;

  async issue(id: Hex, payloadHash: Hex) {
    this.submitted++;
    const tx = `0x${this.submitted.toString(16).padStart(64, '0')}` as Hex;
    this.txs.set(tx, { id, hash: payloadHash, revert: this.revertNext, polls: 0 });
    this.revertNext = false;
    return tx;
  }
  async getReceipt(tx: Hex): Promise<Receipt | null> {
    if (this.down) throw new Error('rpc down');
    const t = this.txs.get(tx);
    if (!t) return null;
    if (t.polls++ < this.pollsBeforeMined) return null;
    if (t.revert) return { status: 'reverted', blockNumber: 1n, blockTimestamp: 1_800_000_000 };
    this.store.set(t.id, { payloadHash: t.hash, issuer: this.issuer, issuedAt: 1_800_000_000, revoked: false });
    return { status: 'success', blockNumber: 1n, blockTimestamp: 1_800_000_000 };
  }
  async read(id: Hex) {
    if (this.down) throw new Error('rpc down');
    return this.store.get(id) ?? null;
  }
}

let db: Db;
let A: string, B: string, topicId: string, otherTopic: string;
const chain = new MockChain();

const rejects = async (p: Promise<unknown>, code: string) => {
  try { await p; } catch (e) { expect((e as { code?: string }).code).toBe(code); return; }
  throw new Error(`expected rejection with ${code}`);
};

const attempt = async (userId: string, quizId: string, score: number, minutesAgo: number) => {
  await db.insert(quizAttempts).values({
    userId, quizId, status: 'submitted', score, correctAnswers: Math.round(score / 20), totalQuestions: 5,
    startedAt: new Date(Date.now() - (minutesAgo + 1) * 60_000), submittedAt: new Date(Date.now() - minutesAgo * 60_000),
  });
};

beforeAll(async () => {
  db = await getDb();
  A = (await registerUser(db, { name: 'Cora Credential', email: 'cora@example.com', password: 'correct horse battery' })).id;
  B = (await registerUser(db, { name: 'Dan Other', email: 'dan@example.com', password: 'correct horse battery' })).id;
  await db.execute(sql`update profiles set is_public = true where user_id = ${A}`);
  topicId = (await createTopic(db, A, { title: 'Quantum Mechanics' })).id;
  otherTopic = (await createTopic(db, A, { title: 'Untested Topic' })).id;
  const [quiz] = await db.insert(quizzes).values({ topicId, title: 'Q', status: 'published' }).returning();
  await db.insert(quizQuestions).values(Array.from({ length: 5 }, (_, i) => ({ quizId: quiz.id, questionText: `q${i}`, questionType: 'true_false' as const, options: ['True', 'False'], answerKey: { type: 'true_false' as const, value: true }, position: i })));
  await attempt(A, quiz.id, 92, 300);
  await attempt(A, quiz.id, 96, 120);
  await db.transaction((tx) => evaluateAchievements(tx, A));
  __setChainForTests(chain);
});

describe('canonical payload hashing', () => {
  it('is independent of key order and whitespace', () => {
    const a = { v: 1, type: 'x', credentialId: 'c', achievement: 'a', achievementName: 'A', topic: null, holder: 'h', issuedOn: '2026-01-01', nonce: 'n' };
    const b = { nonce: 'n', issuedOn: '2026-01-01', holder: 'h', topic: null, achievementName: 'A', achievement: 'a', credentialId: 'c', type: 'x', v: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(hashPayload(a)).toBe(hashPayload(b));
    expect(hashPayload({ ...a, holder: 'someone-else' })).not.toBe(hashPayload(a));
    expect(onchainId('1')).not.toBe(onchainId('2'));
  });
});

describe('credential issuance (mock chain)', () => {
  let id: string;

  it('only issues for badges the learner earned in a topic that meets the rule', async () => {
    await rejects(issueCredential(db, A, { achievementCode: 'recall-ready', topicId: otherTopic, includeTopicName: false }), 'forbidden');
    await rejects(issueCredential(db, B, { achievementCode: 'recall-ready', topicId: topicId, includeTopicName: false }), 'not_found');
    const { credential } = await issueCredential(db, A, { achievementCode: 'recall-ready', topicId, includeTopicName: false });
    id = credential.id;
    expect(credential.status).toBe('pending');
    await rejects(issueCredential(db, A, { achievementCode: 'recall-ready', topicId, includeTopicName: false }), 'already_issued');
  });

  it('keeps private learning data out of the anchored payload', async () => {
    const [row] = await db.select().from(credentials).where(eq(credentials.id, id));
    const text = canonicalize(row.payload);
    expect(Object.keys(row.payload).sort()).toEqual(['achievement', 'achievementName', 'credentialId', 'holder', 'issuedOn', 'nonce', 'topic', 'type', 'v']);
    expect(row.payload.topic).toBeNull(); // topic name is opt-in
    expect(text).not.toMatch(/@example\.com|Quantum|score|answer/i);
    expect(row.payload.holder).toBeTruthy(); // public profile
  });

  it('is never "verified" until the receipt AND the on-chain record check out', async () => {
    await runIssue(db, id);
    let [row] = await db.select().from(credentials).where(eq(credentials.id, id));
    expect(row.status).toBe('submitted');
    expect(row.transactionHash).toBeTruthy();

    // not mined yet -> waits, still not verified
    await expect(runConfirm(db, id)).rejects.toBeInstanceOf(RetryLater);
    [row] = await db.select().from(credentials).where(eq(credentials.id, id));
    expect(row.status).toBe('submitted');

    await runConfirm(db, id); // mined now
    [row] = await db.select().from(credentials).where(eq(credentials.id, id));
    expect(row.status).toBe('verified');
    expect(row.verifiedAt).toBeTruthy();
    expect(row.onchainCredentialId).toBe(onchainId(id));
    const unlocked = await db.select().from(userAchievements).where(eq(userAchievements.userId, A));
    expect(unlocked.length).toBeGreaterThan(2); // includes verified-achievement
  });

  it('re-running issuance is safe (no second transaction)', async () => {
    const before = chain.submitted;
    await runIssue(db, id);
    expect(chain.submitted).toBe(before);
  });
});

describe('public verification reads the chain, not the database', () => {
  let id: string;
  beforeAll(async () => { [{ id }] = await db.select({ id: credentials.id }).from(credentials).where(eq(credentials.userId, A)); });

  it('is valid when the on-chain fingerprint matches', async () => {
    const r = await verifyPublic(db, id);
    expect(r.valid).toBe(true);
    expect(r.mode).toBe('checked');
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.chain.txUrl).toContain('https://explorer.example/tx/');
  });

  it('is NOT valid if the chain disagrees, even though the database says verified', async () => {
    const [c] = await db.select().from(credentials).where(eq(credentials.id, id));
    expect(c.status).toBe('verified');
    const oid = onchainId(id);
    const saved = chain.store.get(oid)!;
    chain.store.set(oid, { ...saved, payloadHash: `0x${'ab'.repeat(32)}` });
    expect((await verifyPublic(db, id)).valid).toBe(false);
    chain.store.set(oid, { ...saved, revoked: true });
    expect((await verifyPublic(db, id)).valid).toBe(false);
    chain.store.delete(oid);
    expect((await verifyPublic(db, id)).valid).toBe(false);
    chain.store.set(oid, saved);
    expect((await verifyPublic(db, id)).valid).toBe(true);
  });

  it('is NOT valid if the stored payload was tampered with', async () => {
    const [c] = await db.select().from(credentials).where(eq(credentials.id, id));
    await db.update(credentials).set({ payload: { ...c.payload, holder: 'impostor' } }).where(eq(credentials.id, id));
    expect((await verifyPublic(db, id)).valid).toBe(false);
    await db.update(credentials).set({ payload: c.payload }).where(eq(credentials.id, id));
    expect((await verifyPublic(db, id)).valid).toBe(true);
  });

  it('never reports valid when the chain cannot be reached', async () => {
    chain.down = true;
    const r = await verifyPublic(db, id);
    chain.down = false;
    expect(r.valid).toBe(false);
    expect(r.mode).toBe('unavailable');
  });

  it('unknown ids are simply not found', async () => {
    await rejects(verifyPublic(db, '00000000-0000-4000-8000-000000000000'), 'not_found');
    await rejects(verifyPublic(db, 'nope'), 'not_found');
  });
});

describe('failure handling', () => {
  it('a reverted transaction fails the credential, and a retry can succeed', async () => {
    // new topic that qualifies for topic-master as well
    const t2 = (await createTopic(db, A, { title: 'Second Topic' })).id;
    const [quiz] = await db.insert(quizzes).values({ topicId: t2, title: 'Q2', status: 'published' }).returning();
    await attempt(A, quiz.id, 95, 400);
    await attempt(A, quiz.id, 97, 200);
    chain.revertNext = true;
    chain.pollsBeforeMined = 0;
    const { credential } = await issueCredential(db, A, { achievementCode: 'topic-master', topicId: t2, includeTopicName: true });
    await runIssue(db, credential.id);
    await expect(runConfirm(db, credential.id)).rejects.toThrow(/rejected on-chain/);
    let [row] = await db.select().from(credentials).where(eq(credentials.id, credential.id));
    expect(row.status).toBe('failed');
    expect(row.error).toMatch(/rejected/);

    const job = await retryCredential(db, A, credential.id);
    await runJob(db, job.id);
    const mine = and(eq(jobs.type, 'confirm_credential'), eq(jobs.status, 'queued'), sql`${jobs.payload}->>'credentialId' = ${credential.id}`);
    await db.update(jobs).set({ runAfter: new Date() }).where(mine);
    const [confirm] = await db.select().from(jobs).where(mine);
    await runJob(db, confirm.id);
    [row] = await db.select().from(credentials).where(eq(credentials.id, credential.id));
    expect(row.status).toBe('verified');
    expect((row.payload as { topic: string }).topic).toBe('Second Topic');
  });

  it('refuses to issue at all when Arc is not configured (no pretend verification)', async () => {
    __setChainForTests(null);
    await rejects(issueCredential(db, A, { achievementCode: 'recall-ready', topicId, includeTopicName: false }), 'arc_not_configured');
    __setChainForTests(chain);
  });
});
