/**
 * Verifies the configured file storage end to end, exactly the way the app uses it:
 *   signed upload URL → upload → size check → server read → signed download URL → delete,
 * and (for S3/R2) that the bucket's CORS rule lets your browser upload from your app's origin.
 *
 *   npm run storage:check
 */
import { getStorage } from '../src/server/storage';
import { env } from '../src/server/config';

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { console.error(`  ✗ ${m}`); process.exitCode = 1; };

const e = env();
const storage = await getStorage();
console.log(`Storage adapter: ${storage.kind}${storage.kind === 'local' ? '  (local disk — development only)' : `  (bucket "${e.S3_BUCKET}")`}`);
if (storage.kind === 'local') {
  console.log('  No S3_* settings found in .env.local, so uploads would go to local disk. Add S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to test real storage.');
  process.exit(0);
}

const key = `healthcheck/${Date.now()}-recallmap.txt`;
const body = `RecallMap storage check ${new Date().toISOString()}`;
const size = Buffer.byteLength(body);
const origin = e.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

try {
  const target = await storage.createUploadTarget(key, { mime: 'text/plain', size });
  ok('created a signed upload URL');

  // 1) a server-side PUT (no CORS involved) proves the credentials, endpoint and bucket are right
  const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body });
  if (!put.ok) throw new Error(`upload was rejected (${put.status}): ${(await put.text()).slice(0, 200)}`);
  ok('uploaded a test file through the signed URL');

  const head = await storage.head(key);
  head && head.size === size ? ok(`bucket reports the right size (${size} bytes)`) : bad(`head returned ${JSON.stringify(head)}`);

  const read = (await storage.read(key)).toString('utf8');
  read === body ? ok('read the file back with the server credentials') : bad('file contents did not match');

  const dl = await fetch(await storage.createDownloadUrl(key, 'check.txt'));
  dl.ok && (await dl.text()) === body ? ok('signed download URL works') : bad(`download failed (${dl.status})`);

  // 2) what the BROWSER needs: the bucket must allow cross-origin PUT from the app's origin
  const pre = await fetch(target.url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });
  const allow = pre.headers.get('access-control-allow-origin');
  if (allow === origin || allow === '*') ok(`CORS allows uploads from ${origin}`);
  else bad(`CORS does not allow ${origin} yet (got ${allow ?? 'no header'}). Add a CORS rule on the bucket — see README step 2. Browser uploads will fail until you do.`);
} catch (err) {
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  bad(`${err instanceof Error ? err.message : String(err)}${cause ? ` (${cause.code ?? ''} ${cause.message ?? ''})` : ''}`);
} finally {
  await storage.remove([key]).then(() => ok('cleaned up the test file')).catch(() => bad('could not delete the test file'));
}
console.log(process.exitCode ? '\nStorage is NOT ready — fix the ✗ items above and re-run.' : '\nStorage is ready.');
