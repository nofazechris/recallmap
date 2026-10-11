import { afterEach, describe, expect, it, vi } from 'vitest';
import { __setReportSenderForTests, parseDsn, reportError } from '../src/server/lib/report';

afterEach(() => { __setReportSenderForTests(null); delete process.env.SENTRY_DSN; });

describe('error reporting', () => {
  it('parses a Sentry DSN and rejects junk', () => {
    expect(parseDsn('https://abc123@o4500.ingest.sentry.io/99')).toEqual({ key: 'abc123', host: 'o4500.ingest.sentry.io', project: '99', protocol: 'https:' });
    expect(parseDsn('not a dsn')).toBeNull();
    expect(parseDsn('https://o4500.ingest.sentry.io/99')).toBeNull(); // no public key
  });

  it('does nothing outbound without a DSN', () => {
    const send = vi.fn(async () => undefined);
    __setReportSenderForTests(send);
    reportError(new Error('boom'), { route: '/api/x' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends only the error, route and request id — never cookies, bodies or user data', async () => {
    process.env.SENTRY_DSN = 'https://abc123@o4500.ingest.sentry.io/99';
    // env() caches on first use, so read it through a fresh module instance
    vi.resetModules();
    const mod = await import('../src/server/lib/report');
    const send = vi.fn(async () => undefined);
    mod.__setReportSenderForTests(send);
    mod.reportError(new Error('database exploded'), { route: '/api/topics?token=secret', requestId: 'r1', source: 'server' });
    expect(send).toHaveBeenCalledOnce();
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://o4500.ingest.sentry.io/api/99/store/?sentry_version=7&sentry_key=abc123');
    const event = JSON.parse(String(init.body));
    expect(event.exception.values[0].value).toBe('database exploded');
    expect(event.tags.requestId).toBe('r1');
    expect(Object.keys(event).sort()).toEqual(['environment', 'event_id', 'exception', 'extra', 'level', 'platform', 'release', 'tags', 'timestamp'].filter((k) => k in event).sort());
    expect(JSON.stringify(event)).not.toMatch(/cookie|authorization|password|email/i);
  });

  it('a failing reporter can never throw into the request', () => {
    process.env.SENTRY_DSN = 'https://abc123@o4500.ingest.sentry.io/99';
    __setReportSenderForTests(async () => { throw new Error('network down'); });
    expect(() => reportError(new Error('x'))).not.toThrow();
  });
});
