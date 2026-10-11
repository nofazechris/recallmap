import { randomUUID } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { auth } from '../auth';
import { getDb, type Db } from './db';
import { HttpError, unauthorized } from './lib/errors';
import { errMessage, log } from './lib/log';
import { reportError } from './lib/report';
import { runJob, sweep } from './services/jobs';
import './services/register';

export interface Ctx<P = Record<string, string>> {
  req: Request;
  db: Db;
  params: P;
  requestId: string;
}
export interface AuthedCtx<P = Record<string, string>> extends Ctx<P> {
  userId: string;
}

type RouteArgs = { params: Promise<Record<string, string>> };

/** Wraps a route handler: db handle, request id, uniform JSON errors, no stack traces to clients. */
export function route<P = Record<string, string>>(fn: (c: Ctx<P>) => Promise<unknown>) {
  return async (req: Request, args: RouteArgs) => {
    const requestId = randomUUID().slice(0, 8);
    try {
      const db = await getDb();
      const params = (await args?.params) ?? {};
      const result = await fn({ req, db, params: params as P, requestId });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { 'x-request-id': requestId } });
    } catch (e) {
      return errorResponse(e, requestId, new URL(req.url).pathname);
    }
  };
}

/** Same, but resolves the signed-in user first. Authorization of the specific resource is still up to the service. */
export function authedRoute<P = Record<string, string>>(fn: (c: AuthedCtx<P>) => Promise<unknown>) {
  return route<P>(async (c) => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw unauthorized();
    return fn({ ...c, userId });
  });
}

export function errorResponse(e: unknown, requestId: string, path: string) {
  if (e instanceof HttpError) {
    const headers: Record<string, string> = { 'x-request-id': requestId };
    if (e.status === 429 && typeof e.extra?.retryAfterSec === 'number') headers['retry-after'] = String(e.extra.retryAfterSec);
    return NextResponse.json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status, headers });
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json(
      { error: { code: 'invalid_request', message: `${first?.path.join('.') || 'request'}: ${first?.message ?? 'invalid'}`, issues: e.issues.map((i) => ({ path: i.path, message: i.message })) } },
      { status: 400, headers: { 'x-request-id': requestId } },
    );
  }
  log.error('route_error', { requestId, path, message: errMessage(e) });
  reportError(e, { requestId, route: path, source: 'server' });
  return NextResponse.json({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.', requestId } }, { status: 500, headers: { 'x-request-id': requestId } });
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.'); }
  return schema.parse(raw);
}

export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';

/** Run a queued job once the response has gone out. The durable job row is the source of truth; this is only a fast path. */
export const runAfter = (db: Db, jobId: string) => {
  if (jobId) after(() => runJob(db, jobId).catch((e) => log.error('run_after_failed', { jobId, message: errMessage(e) })));
};

/** Status endpoints nudge the queue so jobs make progress even without a scheduler (local dev, quiet deployments). */
export const sweepSoon = (db: Db) => after(() => sweep(db, 2).then(() => undefined).catch(() => undefined));
