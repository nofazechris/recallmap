import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../config';
import type { Db } from '../db';
import { resourceChunks, resources } from '../db/schema';
import { badRequest, conflict } from '../lib/errors';
import { errMessage, log } from '../lib/log';
import { rateLimit } from '../lib/rate-limit';
import { getStorage } from '../storage';
import { chunk, detectKind, extract, ExtractionError } from './extraction';
import { enqueue, PermanentJobError, registerHandler } from './jobs';
import { ownedResource, ownedTopic } from './ownership';

export const uploadRequest = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().max(120).default(''),
  size: z.number().int().positive(),
});

const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').slice(0, 120);
const keyPrefix = (userId: string, topicId: string) => `users/${userId}/topics/${topicId}/`;
const maxBytes = () => env().MAX_UPLOAD_MB * 1024 * 1024;

/** Step 1: validate the file and hand back a short-lived signed upload URL. Nothing is stored yet. */
export async function requestUpload(db: Db, userId: string, topicId: string, input: z.infer<typeof uploadRequest>) {
  await ownedTopic(db, userId, topicId);
  await rateLimit(db, `upload:${userId}`, 30, 3600);
  const kind = detectKind(input.filename, input.mimeType);
  if (!kind) throw badRequest('Unsupported file type. Upload a PDF, TXT, Markdown or DOCX file.', 'unsupported_type');
  if (input.size > maxBytes()) throw badRequest(`That file is too large. The limit is ${env().MAX_UPLOAD_MB} MB.`, 'file_too_large');

  const mime = input.mimeType || (kind === 'pdf' ? 'application/pdf' : 'text/plain');
  const storageKey = `${keyPrefix(userId, topicId)}${randomUUID()}-${safeName(input.filename)}`;
  const target = await (await getStorage()).createUploadTarget(storageKey, { mime, size: input.size });
  return { storageKey, upload: target, kind };
}

export const registerInput = z.object({
  storageKey: z.string().min(1).max(500),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().max(120).default(''),
  size: z.number().int().positive(),
});

/** Step 2: confirm the object really exists, belongs to this user and topic, and queue processing. */
export async function registerResource(db: Db, userId: string, topicId: string, input: z.infer<typeof registerInput>) {
  await ownedTopic(db, userId, topicId);
  if (!input.storageKey.startsWith(keyPrefix(userId, topicId)) || input.storageKey.includes('..')) throw badRequest('That upload does not belong to this topic.', 'bad_key');
  const kind = detectKind(input.filename, input.mimeType);
  if (!kind) throw badRequest('Unsupported file type.', 'unsupported_type');

  const head = await (await getStorage()).head(input.storageKey);
  if (!head) throw badRequest('We could not find the uploaded file. Please try uploading again.', 'upload_missing');
  if (head.size > maxBytes()) { await (await getStorage()).remove([input.storageKey]); throw badRequest(`That file is too large. The limit is ${env().MAX_UPLOAD_MB} MB.`, 'file_too_large'); }
  const [dupe] = await db.select({ id: resources.id }).from(resources).where(eq(resources.storageKey, input.storageKey)).limit(1);
  if (dupe) throw conflict('This upload was already added.', 'already_registered');

  const [r] = await db.insert(resources).values({
    topicId, ownerId: userId, originalFilename: input.filename, mimeType: input.mimeType || 'application/octet-stream',
    fileSize: head.size, storageKey: input.storageKey, processingStatus: 'uploaded',
  }).returning();
  const job = await enqueue(db, { type: 'process_resource', payload: { resourceId: r.id }, dedupeKey: `process:${r.id}` });
  return { resource: r, jobId: job.id };
}

/** Retry a failed (or stuck) resource. */
export async function retryResource(db: Db, userId: string, resourceId: string) {
  const r = await ownedResource(db, userId, resourceId);
  if (r.processingStatus === 'ready') throw conflict('This file has already been processed.', 'already_ready');
  await db.update(resources).set({ processingStatus: 'uploaded', processingError: null }).where(eq(resources.id, r.id));
  return enqueue(db, { type: 'process_resource', payload: { resourceId: r.id }, dedupeKey: `process:${r.id}` });
}

export async function deleteResource(db: Db, userId: string, resourceId: string) {
  const r = await ownedResource(db, userId, resourceId);
  await db.delete(resources).where(eq(resources.id, r.id));
  await removeResourceFiles([r.storageKey]);
}

export async function removeResourceFiles(keys: string[]) {
  if (!keys.length) return;
  try { await (await getStorage()).remove(keys); } catch (e) { log.warn('storage_remove_failed', { message: errMessage(e) }); }
}

/** Worker: read the stored bytes, extract and clean the text, store chunks, set the status. */
export async function processResource(db: Db, resourceId: string) {
  const [r] = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
  if (!r) throw new PermanentJobError('Resource no longer exists.');
  if (r.processingStatus === 'ready') return;
  await db.update(resources).set({ processingStatus: 'processing', processingError: null }).where(eq(resources.id, r.id));

  try {
    const kind = detectKind(r.originalFilename, r.mimeType);
    if (!kind) throw new ExtractionError('unsupported', 'Unsupported file type.');
    const buf = await (await getStorage()).read(r.storageKey).catch(() => { throw new ExtractionError('unreadable', 'The stored file could not be read. Please upload it again.'); });
    const ex = await extract(kind, buf);
    const chunks = chunk(ex.pages);
    if (!chunks.length) throw new ExtractionError('empty', 'No text was found in this file.');
    const chars = chunks.reduce((n, c) => n + c.content.length, 0);

    await db.transaction(async (tx) => {
      await tx.delete(resourceChunks).where(eq(resourceChunks.resourceId, r.id));
      for (let i = 0; i < chunks.length; i += 100) {
        await tx.insert(resourceChunks).values(chunks.slice(i, i + 100).map((c) => ({
          resourceId: r.id, chunkIndex: c.index, content: c.content, pageNumber: c.pageNumber, contentHash: c.hash,
        })));
      }
      await tx.update(resources).set({ processingStatus: 'ready', processedAt: new Date(), pageCount: ex.pageCount, charCount: chars, processingError: null }).where(eq(resources.id, r.id));
    });
    log.info('resource_ready', { resourceId: r.id, chunks: chunks.length, chars });
  } catch (e) {
    if (e instanceof ExtractionError) {
      await db.update(resources).set({ processingStatus: 'failed', processingError: e.message, processedAt: new Date() }).where(eq(resources.id, r.id));
      throw new PermanentJobError(e.message); // a bad document won't get better on retry
    }
    await db.update(resources).set({ processingStatus: 'failed', processingError: 'Something went wrong while processing this file. You can retry.', processedAt: new Date() }).where(eq(resources.id, r.id));
    throw e;
  }
}

registerHandler('process_resource', async (db, payload) => processResource(db, String(payload.resourceId)));

export async function listResources(db: Db, userId: string, topicId: string) {
  await ownedTopic(db, userId, topicId);
  return db.select().from(resources).where(and(eq(resources.topicId, topicId), eq(resources.ownerId, userId))).orderBy(asc(resources.createdAt));
}

export async function chunkCounts(db: Db, resourceIds: string[]) {
  if (!resourceIds.length) return new Map<string, number>();
  const rows = await db.execute(sql`select resource_id, count(*)::int n from resource_chunks where resource_id in (${sql.join(resourceIds.map((i) => sql`${i}::uuid`), sql`, `)}) group by resource_id`);
  return new Map((rows.rows as { resource_id: string; n: number }[]).map((x) => [x.resource_id, x.n]));
}
