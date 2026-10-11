import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db';
import { xpLedger } from '../db/schema';
import { log } from '../lib/log';
import { getRules, type Rules } from './rules';

export type XpEvent = 'study_session' | 'quiz_completed' | 'review' | 'daily_commitment' | 'weekly_goal' | 'challenge';

export interface AwardInput {
  userId: string;
  event: XpEvent;
  /** The activity this reward is for (session id, attempt id, flashcard response id…). */
  relatedId: string;
  /** Local calendar day (daily caps) or ISO week (weekly goal) the award counts toward. */
  period: string;
  /** Unique per qualifying activity — replaying the request can never pay twice. */
  idempotencyKey: string;
}

export interface AwardResult { awarded: number; reason: 'awarded' | 'duplicate' | 'capped' | 'ineligible' }

const amountAndCap = (event: XpEvent, r: Rules): { amount: number; cap: number | null } => {
  switch (event) {
    case 'study_session': return { amount: r.xp.session.xp, cap: r.xp.session.dailyCap };
    case 'quiz_completed': return { amount: r.xp.quiz.xp, cap: r.xp.quiz.dailyCap };
    case 'review': return { amount: r.xp.review.xp, cap: r.xp.review.dailyCap };
    case 'daily_commitment': return { amount: r.xp.dailyCommitment.xp, cap: 1 };
    case 'weekly_goal': return { amount: r.xp.weeklyGoal.xp, cap: 1 };
    case 'challenge': return { amount: r.xp.challenge.xp, cap: null };
  }
};

/**
 * The only way XP is ever created. Runs inside the caller's transaction; the amount comes from the
 * server-side rules, never from the client. A per-user/event/period advisory lock makes the cap check
 * race-free, and the unique idempotency key makes replays harmless.
 */
export async function awardXp(tx: Tx, input: AwardInput): Promise<AwardResult> {
  const rules = await getRules(tx);
  const { amount, cap } = amountAndCap(input.event, rules);
  if (amount <= 0) return { awarded: 0, reason: 'ineligible' };

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`xp:${input.userId}:${input.event}:${input.period}`}))`);

  const [dup] = await tx.select({ id: xpLedger.id }).from(xpLedger)
    .where(and(eq(xpLedger.userId, input.userId), eq(xpLedger.idempotencyKey, input.idempotencyKey))).limit(1);
  if (dup) return { awarded: 0, reason: 'duplicate' };

  if (cap !== null) {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(xpLedger)
      .where(and(eq(xpLedger.userId, input.userId), eq(xpLedger.eventType, input.event), eq(xpLedger.dayKey, input.period)));
    if (n >= cap) {
      log.info('xp_capped', { userId: input.userId, event: input.event, period: input.period });
      return { awarded: 0, reason: 'capped' };
    }
  }

  await tx.insert(xpLedger).values({
    userId: input.userId, eventType: input.event, amount, relatedActivityId: input.relatedId,
    idempotencyKey: input.idempotencyKey, ruleVersion: rules.xp.version, dayKey: input.period,
  });
  return { awarded: amount, reason: 'awarded' };
}

export async function totalXp(db: Pick<Tx, 'select'>, userId: string): Promise<number> {
  const [{ s }] = await db.select({ s: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` }).from(xpLedger).where(eq(xpLedger.userId, userId));
  return s;
}

export const level = (xp: number) => Math.floor(xp / 200) + 1;
