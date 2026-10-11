import { env } from '../config';
import { log } from './log';

/**
 * Error reporting. Always writes a structured log line; when SENTRY_DSN is set it also sends the error to Sentry
 * over its plain HTTP API (no SDK needed). Only the error, a route and a request id leave the server — never
 * cookies, request bodies, answers, documents or email addresses.
 */
export interface ReportContext { requestId?: string; route?: string; source?: 'server' | 'render' | 'browser' }

let sender: ((url: string, init: RequestInit) => Promise<unknown>) | null = null;
/** Test seam only. */
export const __setReportSenderForTests = (s: typeof sender) => { sender = s; };

export const parseDsn = (dsn: string) => {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+/, '');
    if (!u.username || !project) return null;
    return { key: u.username, host: u.host, project, protocol: u.protocol };
  } catch { return null; }
};

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

export function reportError(err: unknown, ctx: ReportContext = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  log.error('reported_error', { source: ctx.source ?? 'server', route: ctx.route, requestId: ctx.requestId, message: clip(e.message, 300) });

  const dsn = env().SENTRY_DSN ? parseDsn(env().SENTRY_DSN!) : null;
  if (!dsn) return;
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: env().NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    exception: { values: [{ type: clip(e.name, 80), value: clip(e.message, 500) }] },
    tags: { source: ctx.source ?? 'server', route: clip(ctx.route, 120), requestId: ctx.requestId },
    extra: { stack: clip(e.stack, 4000) },
  };
  const url = `${dsn.protocol}//${dsn.host}/api/${dsn.project}/store/?sentry_version=7&sentry_key=${dsn.key}`;
  const init: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event), signal: AbortSignal.timeout(5000) };
  // Fire and forget: reporting must never slow down or break a request.
  void (sender ? sender(url, init) : fetch(url, init)).catch(() => undefined);
}
