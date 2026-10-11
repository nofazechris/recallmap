import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config';

export interface UploadTarget { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string }

/**
 * Private object storage. Files are never public: every read or write goes through a
 * short-lived signed URL, or happens server-side (document processing).
 */
export interface Storage {
  kind: 'local' | 's3';
  createUploadTarget(key: string, opts: { mime: string; size: number }): Promise<UploadTarget>;
  createDownloadUrl(key: string, filename: string): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  read(key: string): Promise<Buffer>;
  remove(keys: string[]): Promise<void>;
}

const UPLOAD_TTL_SEC = 5 * 60;
const DOWNLOAD_TTL_SEC = 2 * 60;

/* ───────────── signed-URL helpers (local adapter) ───────────── */

const secret = () => {
  const s = env().AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is required to sign storage URLs.');
  return s;
};
export const sign = (parts: (string | number)[]) => createHmac('sha256', secret()).update(parts.join('\n')).digest('base64url');
export const verifySig = (parts: (string | number)[], sig: string) => {
  const a = Buffer.from(sign(parts));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Resolve a storage key to a path inside the storage root, refusing anything that escapes it. */
export const localPath = (key: string) => {
  const root = path.resolve(env().LOCAL_STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key.');
  return full;
};

const local: Storage = {
  kind: 'local',
  async createUploadTarget(key, { mime, size }) {
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SEC;
    const sig = sign(['PUT', key, exp, size, mime]);
    const q = new URLSearchParams({ key, exp: String(exp), size: String(size), mime, sig });
    return { url: `/api/storage/object?${q}`, method: 'PUT', headers: { 'content-type': mime }, expiresAt: new Date(exp * 1000).toISOString() };
  },
  async createDownloadUrl(key, filename) {
    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SEC;
    const q = new URLSearchParams({ key, exp: String(exp), name: filename, sig: sign(['GET', key, exp]) });
    return `/api/storage/object?${q}`;
  },
  async head(key) {
    try { return { size: (await fs.stat(localPath(key))).size }; } catch { return null; }
  },
  async read(key) { return fs.readFile(localPath(key)); },
  async remove(keys) {
    await Promise.all(keys.map((k) => fs.rm(localPath(k), { force: true }).catch(() => undefined)));
  },
};

async function s3(): Promise<Storage> {
  const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const e = env();
  const client = new S3Client({
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT || undefined,
    forcePathStyle: !!e.S3_ENDPOINT,
    credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
  });
  const Bucket = e.S3_BUCKET!;
  return {
    kind: 's3',
    async createUploadTarget(key, { mime, size }) {
      // Signing ContentLength + ContentType pins the upload to exactly what we validated.
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: mime, ContentLength: size }), { expiresIn: UPLOAD_TTL_SEC });
      return { url, method: 'PUT', headers: { 'content-type': mime }, expiresAt: new Date(Date.now() + UPLOAD_TTL_SEC * 1000).toISOString() };
    },
    async createDownloadUrl(key, filename) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"` }), { expiresIn: DOWNLOAD_TTL_SEC });
    },
    async head(key) {
      try { const r = await client.send(new HeadObjectCommand({ Bucket, Key: key })); return { size: Number(r.ContentLength ?? 0) }; } catch { return null; }
    },
    async read(key) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    async remove(keys) {
      if (!keys.length) return;
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    },
  };
}

let cached: Promise<Storage> | undefined;
/** S3-compatible storage when configured, otherwise the local-disk adapter (development only). */
export const getStorage = (): Promise<Storage> => (cached ??= (async () => {
  const e = env();
  if (e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY) return s3();
  if (e.NODE_ENV === 'production' && !e.RECALLMAP_ALLOW_DEV_ADAPTERS) throw new Error('S3_* storage settings are required in production.');
  return local;
})());
