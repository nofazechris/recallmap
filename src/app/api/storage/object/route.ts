import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { env } from '@/server/config';
import { verifySig, localPath } from '@/server/storage';

/** Local-disk dev adapter only: serves signed PUT/GET URLs. Production uses S3-compatible presigned URLs instead. */
const deny = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });
const expired = (exp: number) => !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000);

export async function PUT(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get('key') ?? '', exp = Number(q.get('exp')), size = Number(q.get('size')), mime = q.get('mime') ?? '', sig = q.get('sig') ?? '';
  if (!key || expired(exp) || !verifySig(['PUT', key, exp, size, mime], sig)) return deny(403, 'This upload link is invalid or has expired.');
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length !== size || buf.length > env().MAX_UPLOAD_MB * 1024 * 1024) return deny(400, 'The uploaded file size does not match.');
  const file = localPath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get('key') ?? '', exp = Number(q.get('exp')), sig = q.get('sig') ?? '';
  if (!key || expired(exp) || !verifySig(['GET', key, exp], sig)) return deny(403, 'This download link is invalid or has expired.');
  try {
    const data = await fs.readFile(localPath(key));
    const name = (q.get('name') ?? 'download').replace(/["\r\n]/g, '');
    return new NextResponse(new Uint8Array(data), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'private, no-store' } });
  } catch { return deny(404, 'File not found.'); }
}
