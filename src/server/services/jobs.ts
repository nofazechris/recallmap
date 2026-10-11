import { and, eq, lte, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { jobs } from '../db/schema';
import { errMessage, log } from '../lib/log';

export type JobType = 'process_resource' | 'generate_study_kit' | 'issue_credential' | 'confirm_credential';
type Payload = Record<string, unknown>;
type Handler = (db: Db, payload: Payload, job: { id: string; attempts: number }) => Promise<void>;

/** Raised by a handler to say "don't retry, this can never succeed" (the message is already user-safe). */
export class PermanentJobError extends Error {}

/** Raised by a handler that is simply waiting (e.g. for a block): re-queue after `delayMs` without using up an attempt. */
export class RetryLater extends Error {
  constructor(public delayMs: number) { super('retry later'); }
}

const handlers = new Map<JobType, Handler>();
export const registerHandler = (type: JobType, h: Handler) => { handlers.set(type, h); };

const STUCK_AFTER_MS = 5 * 60_000;
const backoffMs = (attempt: number) => Math.min(15 * 60_000, 5_000 * 4 ** (attempt - 1));

/**
 * Jobs live in Postgres, not in memory, so work survives restarts and serverless cold starts.
 * `dedupeKey` allows only one queued/running job per key (one generation per topic, one process per resource).
 */
export async function enqueue(db: Db, input: { type: JobType; payload: Payload; dedupeKey?: string; runAfter?: Date; maxAttempts?: number }) {
  const [row] = await db.insert(jobs).values({
    type: input.type, payload: input.payload, dedupeKey: input.dedupeKey ?? null,
    runAfter: input.runAfter ?? new Date(), maxAttempts: input.maxAttempts ?? 3,
  }).onConflictDoNothing().returning({ id: jobs.id });
  if (row) return { id: row.id, created: true };
  const [live] = await db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.dedupeKey, input.dedupeKey ?? ''), sql`${jobs.status} in ('queued','running')`)).limit(1);
  return { id: live?.id ?? '', created: false };
}

/** Atomically claim one queued job. Returns null if someone else got it first. */
async function claim(db: Db, id: string) {
  const [row] = await db.update(jobs)
    .set({ status: 'running', lockedAt: new Date(), attempts: sql`${jobs.attempts} + 1` })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'queued'), lte(jobs.runAfter, new Date())))
    .returning();
  return row ?? null;
}

export async function runJob(db: Db, id: string): Promise<void> {
  const job = await claim(db, id);
  if (!job) return;
  const h = handlers.get(job.type);
  const started = Date.now();
  try {
    if (!h) throw new PermanentJobError(`No handler for ${job.type}`);
    await h(db, job.payload, { id: job.id, attempts: job.attempts });
    await db.update(jobs).set({ status: 'succeeded', finishedAt: new Date(), lockedAt: null, lastError: null }).where(eq(jobs.id, id));
    log.info('job_done', { jobId: id, type: job.type, ms: Date.now() - started });
  } catch (e) {
    if (e instanceof RetryLater) {
      await db.update(jobs).set({ status: 'queued', lockedAt: null, attempts: sql`${jobs.attempts} - 1`, runAfter: new Date(Date.now() + e.delayMs) }).where(eq(jobs.id, id));
      return;
    }
    const permanent = e instanceof PermanentJobError || job.attempts >= job.maxAttempts;
    log.warn('job_failed', { jobId: id, type: job.type, attempt: job.attempts, permanent, message: errMessage(e) });
    await db.update(jobs).set(permanent
      ? { status: 'failed', finishedAt: new Date(), lockedAt: null, lastError: errMessage(e).slice(0, 500) }
      : { status: 'queued', lockedAt: null, lastError: errMessage(e).slice(0, 500), runAfter: new Date(Date.now() + backoffMs(job.attempts)) },
    ).where(eq(jobs.id, id));
  }
}

/**
 * Recovery sweep: re-queue jobs whose worker died mid-run, then run whatever is due.
 * Called from the scheduler endpoint and, opportunistically, when clients poll for status.
 */
export async function sweep(db: Db, limit = 5): Promise<number> {
  await db.update(jobs).set({ status: 'queued', lockedAt: null })
    .where(and(eq(jobs.status, 'running'), lte(jobs.lockedAt, new Date(Date.now() - STUCK_AFTER_MS))));
  const due = await db.select({ id: jobs.id }).from(jobs)
    .where(and(eq(jobs.status, 'queued'), lte(jobs.runAfter, new Date()))).orderBy(jobs.runAfter).limit(limit);
  for (const j of due) await runJob(db, j.id);
  return due.length;
}
