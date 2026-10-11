import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { configRules } from '../db/schema';
import { DEFAULT_RULES } from '../db/seed';

export interface XpRules {
  session: { xp: number; dailyCap: number };
  quiz: { xp: number; minScore: number; dailyCap: number };
  review: { xp: number; dailyCap: number };
  dailyCommitment: { xp: number };
  weeklyGoal: { xp: number };
  challenge: { xp: number };
  minAnswersForSession: number;
}
export interface MasteryRules {
  recallReady: { minScore: number; attempts: number };
  topicMaster: { minScore: number; attempts: number };
  minIntervalMinutes: number;
  minQuestions: number;
}
export interface SrsRules {
  startEase: number; minEase: number; hardMultiplier: number; easyBonus: number;
  intervals: Record<'again' | 'hard' | 'good' | 'easy', number>;
  easeDelta: Record<'again' | 'hard' | 'good' | 'easy', number>;
}
export interface StreakRules {
  consistentLearner: { days: number; window: number };
  weekOfFocus: { days: number };
  goalGetter: { days: number; window: number };
}
export interface Rules { xp: XpRules & { version: number }; mastery: MasteryRules; srs: SrsRules; streak: StreakRules }

let cache: { at: number; rules: Rules } | null = null;
export const clearRulesCache = () => { cache = null; };

/** Rules are read from `config_rules` (falling back to the seeded defaults) and cached briefly. */
export async function getRules(db: DbOrTx): Promise<Rules> {
  if (cache && Date.now() - cache.at < 30_000) return cache.rules;
  const rows = await db.select().from(configRules).where(inArray(configRules.key, Object.keys(DEFAULT_RULES)));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const pick = <T,>(key: keyof typeof DEFAULT_RULES): T => (byKey.get(key)?.value ?? DEFAULT_RULES[key]) as T;
  const rules: Rules = {
    xp: { ...pick<XpRules>('xp.rules'), version: byKey.get('xp.rules')?.version ?? 1 },
    mastery: pick<MasteryRules>('mastery.rules'),
    srs: pick<SrsRules>('srs.rules'),
    streak: pick<StreakRules>('streak.rules'),
  };
  cache = { at: Date.now(), rules };
  return rules;
}
