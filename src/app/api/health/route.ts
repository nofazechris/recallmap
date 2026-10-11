import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { aiConfigured } from '@/server/ai/provider';
import { chainStatus } from '@/server/chain/client';
import { env } from '@/server/config';
import { getDb } from '@/server/db';
import { emailConfigured } from '@/server/lib/email';
import { getStorage } from '@/server/storage';

export const dynamic = 'force-dynamic';

/** Liveness + database check for uptime monitors. With the CRON_SECRET bearer it also reports which services are configured (booleans only). */
export async function GET(req: Request) {
  let dbOk = false;
  try { await (await getDb()).execute(sql`select 1`); dbOk = true; } catch { /* reported below */ }
  const detailed = !!env().CRON_SECRET && req.headers.get('authorization') === `Bearer ${env().CRON_SECRET}`;
  const body: Record<string, unknown> = { ok: dbOk, db: dbOk };
  if (detailed) {
    const st = await getStorage().then((s) => s.kind).catch(() => 'error');
    Object.assign(body, { storage: st, ai: aiConfigured(), email: emailConfigured(), arc: chainStatus() });
  }
  return NextResponse.json(body, { status: dbOk ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
