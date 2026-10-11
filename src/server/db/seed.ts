import { sql } from 'drizzle-orm';
import type { Db } from './index';
import { achievements, configRules } from './schema';

export const DEFAULT_RULES = {
  /** Reward rules. Edit the row in `config_rules` (and bump `version`) to change them without a deploy. */
  'xp.rules': {
    session: { xp: 10, dailyCap: 3 },
    quiz: { xp: 15, minScore: 70, dailyCap: 3 },
    review: { xp: 5, dailyCap: 10 },
    dailyCommitment: { xp: 10 },
    weeklyGoal: { xp: 30 },
    challenge: { xp: 50 },
    /** A session only counts when it has real activity in it. */
    minAnswersForSession: 3,
  },
  'mastery.rules': {
    recallReady: { minScore: 80, attempts: 2 },
    topicMaster: { minScore: 90, attempts: 2 },
    /** Qualifying attempts must be this far apart so one sitting can't farm a badge. */
    minIntervalMinutes: 30,
    minQuestions: 3,
  },
  'srs.rules': {
    startEase: 2.5,
    minEase: 1.3,
    intervals: { again: 0, hard: 1, good: 3, easy: 7 },
    easeDelta: { again: -0.2, hard: -0.15, good: 0, easy: 0.15 },
    hardMultiplier: 1.2,
    easyBonus: 1.3,
  },
  'streak.rules': { consistentLearner: { days: 3, window: 7 }, weekOfFocus: { days: 7 }, goalGetter: { days: 5, window: 7 } },
} as const;

export const ACHIEVEMENTS = [
  { code: 'first-steps', name: 'First Steps', icon: 'check', category: 'learning', description: 'Complete your first eligible study session.', qualificationRules: { type: 'first_session' } },
  { code: 'consistent-learner', name: 'Consistent Learner', icon: 'calendar', category: 'habit', description: 'Study on three separate days within seven.', qualificationRules: { type: 'study_days_in_window', days: 3, window: 7 } },
  { code: 'week-of-focus', name: 'Week of Focus', icon: 'flame', category: 'habit', description: 'Study on seven consecutive days.', qualificationRules: { type: 'streak', days: 7 } },
  { code: 'recall-ready', name: 'Recall Ready', icon: 'target', category: 'mastery', description: 'Score 80%+ on two separate assessments in one topic.', qualificationRules: { type: 'mastery', level: 'recallReady' } },
  { code: 'topic-master', name: 'Topic Master', icon: 'award', category: 'mastery', description: 'Score 90%+ on two separate assessments in one topic.', qualificationRules: { type: 'mastery', level: 'topicMaster' } },
  { code: 'goal-getter', name: 'Goal Getter', icon: 'star', category: 'habit', description: 'Hit your daily recall goal on five days within seven.', qualificationRules: { type: 'goal_days_in_window', days: 5, window: 7 } },
  { code: 'challenge-finisher', name: 'Challenge Finisher', icon: 'flag', category: 'community', description: 'Complete a study challenge.', qualificationRules: { type: 'challenge_completed' } },
  { code: 'verified-achievement', name: 'Verified Achievement', icon: 'shield', category: 'proof', description: 'Have a credential verified on Arc.', qualificationRules: { type: 'credential_verified' } },
] as const;

/** Idempotent: never overwrites a rule an operator has changed. */
export async function seedReference(db: Db) {
  await db.insert(achievements).values(ACHIEVEMENTS.map((a) => ({ ...a, qualificationRules: { ...a.qualificationRules } }))).onConflictDoNothing();
  await db.insert(configRules).values(Object.entries(DEFAULT_RULES).map(([key, value]) => ({ key, value, version: 1, updatedAt: sql`now()` as never }))).onConflictDoNothing();
}
