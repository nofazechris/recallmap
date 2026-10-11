import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { chainStatus, getChain } from '../chain/client';
import { canonicalize, hashPayload, onchainId, type CredentialPayload } from '../chain/payload';
import type { Db } from '../db';
import { achievements, credentials, profiles, topics, userAchievements } from '../db/schema';
import { env } from '../config';
import { HttpError, conflict, forbidden, notFound } from '../lib/errors';
import { log } from '../lib/log';
import { rateLimit } from '../lib/rate-limit';
import { evaluateAchievements, masteryStatus } from './achievements';
import { activityRecord } from './community';
import { enqueue, PermanentJobError, RetryLater, registerHandler } from './jobs';
import { notify } from './notifications';
import { requireVerified } from './verification';
import { ownedTopic } from './ownership';
import { escapeHtml } from './users';

/** Only mastery badges can be anchored — the PRD asks for selected achievements, not every session or quiz. */
export const ELIGIBLE = { 'recall-ready': 'recallReady', 'topic-master': 'topicMaster' } as const;
type Code = keyof typeof ELIGIBLE;

const CONFIRM_TIMEOUT_MS = 20 * 60_000;

export const issueInput = z.object({
  achievementCode: z.enum(['recall-ready', 'topic-master']),
  topicId: z.string().uuid(),
  includeTopicName: z.boolean().default(false),
});

/** Create a credential and queue its on-chain issuance. Nothing is marked verified here. */
export async function issueCredential(db: Db, userId: string, input: z.infer<typeof issueInput>) {
  getChain('write'); // fail fast with a clear message if Arc isn't configured
  await requireVerified(db, userId);
  await rateLimit(db, `cred:${userId}`, 10, 3600);
  // Mainnet transactions cost real USDC: a global ceiling stops any abuse (or bug) from draining the issuer wallet.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(credentials).where(sql`${credentials.createdAt} > now() - interval '24 hours'`);
  if (n >= env().ARC_MAX_ISSUANCES_PER_DAY) throw new HttpError(503, 'issuance_limited', 'Credential issuing is temporarily at its daily limit. Please try again tomorrow.');
  const topic = await ownedTopic(db, userId, input.topicId);

  const [ach] = await db.select().from(achievements).where(eq(achievements.code, input.achievementCode)).limit(1);
  if (!ach) throw notFound('Unknown achievement.');
  const [held] = await db.select().from(userAchievements).where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, ach.id))).limit(1);
  if (!held) throw forbidden('You haven’t earned this badge yet.');

  // The topic must itself meet the mastery rule — holding the badge for a different topic isn't enough.
  const { perTopic } = await masteryStatus(db, userId);
  const m = perTopic.get(topic.id);
  const level = ELIGIBLE[input.achievementCode as Code];
  if (!m || !(level === 'recallReady' ? m.readyDone : m.masterDone)) throw forbidden('This topic doesn’t meet the criteria for that badge.');

  const dupe = await db.select({ id: credentials.id }).from(credentials)
    .where(and(eq(credentials.userId, userId), eq(credentials.achievementId, ach.id), eq(credentials.topicId, topic.id), ne(credentials.status, 'failed'))).limit(1);
  if (dupe.length) throw conflict('A credential for this badge and topic already exists.', 'already_issued');

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const id = randomUUID();
  const payload: CredentialPayload = {
    v: 1, type: 'recallmap.achievement', credentialId: id, achievement: ach.code, achievementName: ach.name,
    topic: input.includeTopicName ? topic.title : null,
    holder: profile?.isPublic ? profile.username : null,
    issuedOn: new Date().toISOString().slice(0, 10), nonce: randomBytes(16).toString('hex'),
  };

  const [row] = await db.insert(credentials).values({
    id, userId, achievementId: ach.id, topicId: topic.id, credentialType: ach.code, payload: payload as unknown as Record<string, unknown>,
    credentialPayloadHash: hashPayload(payload), status: 'pending',
  }).returning();
  await db.update(userAchievements).set({ credentialId: id }).where(eq(userAchievements.id, held.id));
  const job = await enqueue(db, { type: 'issue_credential', payload: { credentialId: id }, dedupeKey: `cred:issue:${id}`, maxAttempts: 4 });
  return { credential: row, jobId: job.id };
}

export async function retryCredential(db: Db, userId: string, credentialId: string) {
  const [c] = await db.select().from(credentials).where(and(eq(credentials.id, credentialId), eq(credentials.userId, userId))).limit(1);
  if (!c) throw notFound('Credential not found.');
  if (c.status !== 'failed') throw conflict('Only a failed credential can be retried.', 'bad_state');
  getChain('write');
  await db.update(credentials).set({ status: 'pending', error: null, transactionHash: null }).where(eq(credentials.id, c.id));
  return enqueue(db, { type: 'issue_credential', payload: { credentialId: c.id }, dedupeKey: `cred:issue:${c.id}`, maxAttempts: 4 });
}

const fail = async (db: Db, id: string, message: string) => {
  await db.update(credentials).set({ status: 'failed', error: message }).where(eq(credentials.id, id));
  throw new PermanentJobError(message);
};

/** Worker 1: submit the transaction (or notice it already landed) — safe to run more than once. */
export async function runIssue(db: Db, credentialId: string) {
  const [c] = await db.select().from(credentials).where(eq(credentials.id, credentialId)).limit(1);
  if (!c) throw new PermanentJobError('Credential no longer exists.');
  if (c.status === 'verified' || c.status === 'failed') return;
  const chain = getChain('write');
  const oid = onchainId(c.id);
  const hash = hashPayload(c.payload);
  if (hash !== c.credentialPayloadHash) return fail(db, c.id, 'Stored credential data no longer matches its hash.');

  const existing = await chain.read(oid);
  if (existing) {
    if (existing.payloadHash !== hash) return fail(db, c.id, 'A different credential already uses this id on-chain.');
    await db.update(credentials).set({ status: 'submitted', issuerAddress: existing.issuer, chainId: chain.chainId, contractAddress: chain.contract }).where(eq(credentials.id, c.id));
  } else if (!c.transactionHash) {
    const tx = await chain.issue(oid, hash);
    await db.update(credentials).set({ status: 'submitted', transactionHash: tx, issuerAddress: chain.issuer, chainId: chain.chainId, contractAddress: chain.contract, error: null }).where(eq(credentials.id, c.id));
    log.info('credential_submitted', { credentialId: c.id, tx });
  }
  await enqueue(db, { type: 'confirm_credential', payload: { credentialId: c.id }, dedupeKey: `cred:confirm:${c.id}`, maxAttempts: 5, runAfter: new Date(Date.now() + 3000) });
}

/** Worker 2: only marks `verified` after a successful receipt AND a matching on-chain record. */
export async function runConfirm(db: Db, credentialId: string) {
  const [c] = await db.select().from(credentials).where(eq(credentials.id, credentialId)).limit(1);
  if (!c) throw new PermanentJobError('Credential no longer exists.');
  if (c.status === 'verified' || c.status === 'failed') return;
  const chain = getChain('write');
  const hash = hashPayload(c.payload);
  const oid = onchainId(c.id);

  let blockTime: number | null = null;
  if (c.transactionHash) {
    const receipt = await chain.getReceipt(c.transactionHash as `0x${string}`);
    if (!receipt) {
      if (Date.now() - c.createdAt.getTime() > CONFIRM_TIMEOUT_MS) return fail(db, c.id, 'The transaction was never confirmed. You can retry issuing it.');
      throw new RetryLater(6000);
    }
    if (receipt.status !== 'success') return fail(db, c.id, 'The transaction was rejected on-chain.');
    blockTime = receipt.blockTimestamp;
  }

  const onchain = await chain.read(oid);
  if (!onchain) {
    if (Date.now() - c.createdAt.getTime() > CONFIRM_TIMEOUT_MS) return fail(db, c.id, 'The credential never appeared on-chain.');
    throw new RetryLater(6000);
  }
  if (onchain.payloadHash !== hash) return fail(db, c.id, 'The on-chain hash does not match this credential.');
  if (onchain.revoked) return fail(db, c.id, 'This credential has been revoked.');

  const [topic] = c.topicId ? await db.select({ t: topics.title }).from(topics).where(eq(topics.id, c.topicId)).limit(1) : [];
  const [ach] = await db.select().from(achievements).where(eq(achievements.id, c.achievementId)).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(credentials).set({
      status: 'verified', verifiedAt: new Date(), issuedAt: new Date((blockTime ?? onchain.issuedAt) * 1000), onchainCredentialId: oid, error: null,
      issuerAddress: onchain.issuer, chainId: chain.chainId, contractAddress: chain.contract,
    }).where(eq(credentials.id, c.id));
    await notify(tx, c.userId, 'verified', `Your <strong>${escapeHtml(ach?.name ?? 'credential')}</strong>${topic?.t ? ` in ${escapeHtml(topic.t)}` : ''} was verified on Arc.`, '/app/profile');
    await activityRecord(tx, c.userId, { type: 'badge_unlocked', entityType: 'credential', entityId: c.id, metadata: { name: `${ach?.name ?? 'Credential'} (verified)` } });
    await evaluateAchievements(tx, c.userId);
  });
  log.info('credential_verified', { credentialId: c.id });
}

registerHandler('issue_credential', async (db, p) => runIssue(db, String(p.credentialId)));
registerHandler('confirm_credential', async (db, p) => runConfirm(db, String(p.credentialId)));

/* ───────────── public verification ───────────── */

export interface VerifyResult {
  valid: boolean;
  /** 'checked' = we read the chain; 'unavailable' = we could not (never reported as valid). */
  mode: 'checked' | 'unavailable';
  status: string;
  checks: { key: string; label: string; ok: boolean }[];
  credential: { id: string; achievement: string; achievementName: string; topic: string | null; holder: string | null; issuedOn: string };
  chain: { chainId: number | null; contract: string | null; txHash: string | null; txUrl: string | null; onchainId: string };
  canonicalPayload: string;
  payloadHash: string;
  message: string;
}

/** Reads the actual contract. The database status is shown, but never trusted on its own. */
export async function verifyPublic(db: Db, credentialId: string): Promise<VerifyResult> {
  if (!z.string().uuid().safeParse(credentialId).success) throw notFound('Credential not found.');
  const [c] = await db.select().from(credentials).where(eq(credentials.id, credentialId)).limit(1);
  if (!c || c.status === 'pending') throw notFound('Credential not found.');

  const payload = c.payload as unknown as CredentialPayload;
  const hash = hashPayload(payload);
  const checks: VerifyResult['checks'] = [{ key: 'payload', label: 'Credential data matches its fingerprint', ok: hash === c.credentialPayloadHash }];
  const oid = onchainId(c.id);
  const base = {
    credential: { id: c.id, achievement: payload.achievement, achievementName: payload.achievementName, topic: payload.topic, holder: payload.holder, issuedOn: payload.issuedOn },
    canonicalPayload: canonicalize(payload), payloadHash: hash,
  };

  let mode: VerifyResult['mode'] = 'checked';
  let chainInfo: VerifyResult['chain'] = { chainId: c.chainId, contract: c.contractAddress, txHash: c.transactionHash, txUrl: null, onchainId: oid };
  if (!chainStatus().read) {
    mode = 'unavailable';
  } else {
    try {
      const chain = getChain('read');
      chainInfo = { chainId: chain.chainId, contract: chain.contract, txHash: c.transactionHash, txUrl: chain.explorerUrl && c.transactionHash ? `${chain.explorerUrl.replace(/\/$/, '')}/tx/${c.transactionHash}` : null, onchainId: oid };
      const onchain = await chain.read(oid);
      checks.push({ key: 'exists', label: 'Recorded on the Arc contract', ok: !!onchain });
      checks.push({ key: 'hash', label: 'On-chain fingerprint matches the credential', ok: !!onchain && onchain.payloadHash === hash });
      checks.push({ key: 'issuer', label: 'Issued by RecallMap’s authorised issuer', ok: !!onchain && (!c.issuerAddress || onchain.issuer.toLowerCase() === c.issuerAddress.toLowerCase()) });
      checks.push({ key: 'revoked', label: 'Not revoked', ok: !!onchain && !onchain.revoked });
    } catch (e) {
      log.warn('verify_chain_unreachable', { credentialId, message: e instanceof Error ? e.message : String(e) });
      mode = 'unavailable';
    }
  }

  const valid = mode === 'checked' && checks.every((k) => k.ok);
  return {
    ...base, valid, mode, status: c.status, checks, chain: chainInfo,
    message: valid ? 'This credential is genuine: its fingerprint is recorded on Arc and matches.'
      : mode === 'unavailable' ? 'We couldn’t reach Arc just now, so this credential could not be verified. Try again shortly.'
      : 'This credential could not be verified against the Arc contract.',
  };
}
