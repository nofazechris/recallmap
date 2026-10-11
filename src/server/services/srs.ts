import type { SrsRules } from './rules';

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

export interface ScheduleState {
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
  lapses: number;
  strength: number;
}
export interface Scheduled extends ScheduleState { dueAt: Date }

const STRENGTH_DELTA: Record<Rating, number> = { again: -20, hard: 2, good: 10, easy: 16 };
const FIRST_STRENGTH = 30;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const DAY = 864e5;

/**
 * A small SM-2 style scheduler. Pure and deterministic: the caller passes "now".
 * - again: back in ten minutes, ease drops, counts as a lapse
 * - hard / good / easy: interval grows (first review uses fixed intervals, later ones scale with ease)
 */
export function schedule(prev: ScheduleState | null, rating: Rating, now: Date, rules: SrsRules): Scheduled {
  const first = !prev || prev.reviewCount === 0;
  const ease0 = prev?.easeFactor ?? rules.startEase;
  const ease = clamp(ease0 + rules.easeDelta[rating], rules.minEase, 3.2);
  const base = prev?.intervalDays ?? 0;

  let interval: number;
  if (rating === 'again') interval = 0;
  else if (first) interval = rules.intervals[rating];
  else if (rating === 'hard') interval = Math.max(1, base * rules.hardMultiplier);
  else if (rating === 'good') interval = Math.max(rules.intervals.good, base * ease);
  else interval = Math.max(rules.intervals.easy, base * ease * rules.easyBonus);

  interval = Math.round(interval * 10) / 10;
  const dueAt = rating === 'again' ? new Date(now.getTime() + 10 * 60_000) : new Date(now.getTime() + interval * DAY);
  const strength = clamp((prev?.strength || FIRST_STRENGTH) + STRENGTH_DELTA[rating], 10, 99);

  return {
    intervalDays: interval,
    easeFactor: Math.round(ease * 100) / 100,
    reviewCount: (prev?.reviewCount ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (rating === 'again' ? 1 : 0),
    strength,
    dueAt,
  };
}

/** Whole days until due, never negative; used for "next review in N days" copy. */
export const daysUntil = (dueAt: Date, now: Date) => Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / DAY));
