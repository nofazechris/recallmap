import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content-Security-Policy with a fresh nonce per request (Next.js reads the nonce from the request header and
 * stamps it onto its own scripts). Enforced in production; development needs eval/websockets for hot reload.
 *
 * What the browser is allowed to talk to: this site, the file-storage origin (direct uploads), Google Fonts,
 * and — if configured — the error-reporting endpoint. Nothing else.
 */
const origin = (u?: string) => { try { return u ? new URL(u).origin : ''; } catch { return ''; } };

/**
 * CSP_MODE: "report-only" (default in production: the browser logs any violation in its console but blocks nothing),
 * "enforce" (blocks violations — switch to this once a real browser shows no violations), or "off" (default in development).
 */
const mode = () => (process.env.CSP_MODE as 'enforce' | 'report-only' | 'off' | undefined) ?? (process.env.NODE_ENV === 'production' ? 'report-only' : 'off');

export function proxy(req: NextRequest) {
  const prod = process.env.NODE_ENV === 'production';
  if (mode() === 'off') return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const storage = origin(process.env.S3_ENDPOINT);

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${prod ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${storage}${prod ? '' : ' ws: wss:'}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(prod ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const header = mode() === 'report-only' ? 'content-security-policy-report-only' : 'content-security-policy';
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set(header, csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set(header, csp);
  return res;
}

export const config = {
  // Pages only: skip API routes and static assets.
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.svg).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }] }],
};
