import type { AnswerKey } from '../db/schema';

export interface GradableQuestion { id: string; answerKey: AnswerKey }
export type Submitted = number | boolean | null | undefined;

export function isCorrect(key: AnswerKey, answer: Submitted): boolean {
  if (answer === null || answer === undefined) return false;
  if (key.type === 'multiple_choice') return typeof answer === 'number' && Number.isInteger(answer) && answer === key.correctIndex;
  return typeof answer === 'boolean' && answer === key.value;
}

export interface GradeResult {
  perQuestion: { questionId: string; isCorrect: boolean; points: number }[];
  correct: number;
  total: number;
  /** score_percentage = correct / total × 100, or null when nothing was gradable. */
  score: number | null;
}

export function gradeAttempt(questions: GradableQuestion[], answers: Map<string, Submitted>): GradeResult {
  const perQuestion = questions.map((q) => {
    const ok = isCorrect(q.answerKey, answers.get(q.id));
    return { questionId: q.id, isCorrect: ok, points: ok ? 1 : 0 };
  });
  const correct = perQuestion.filter((p) => p.isCorrect).length;
  const total = questions.length;
  return { perQuestion, correct, total, score: total === 0 ? null : Math.round((correct / total) * 10000) / 100 };
}

export interface ScoredAttempt { id: string; at: Date; score: number }

/**
 * Mastery needs `count` *distinct* attempts at or above `minScore`, each at least
 * `minIntervalMs` after the previous qualifying one — so a single sitting can't farm a badge.
 */
export function masteryReached(attempts: ScoredAttempt[], minScore: number, count: number, minIntervalMs: number): boolean {
  const sorted = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const seen = new Set<string>();
  let picked = 0;
  let last = -Infinity;
  for (const a of sorted) {
    if (seen.has(a.id) || a.score < minScore) continue;
    if (a.at.getTime() - last < minIntervalMs) continue;
    seen.add(a.id);
    picked++;
    last = a.at.getTime();
    if (picked >= count) return true;
  }
  return false;
}

/** How many distinct, spaced attempts so far meet `minScore` (for progress bars). */
export function masteryProgress(attempts: ScoredAttempt[], minScore: number, minIntervalMs: number): number {
  let n = 0;
  while (n < 50 && masteryReached(attempts, minScore, n + 1, minIntervalMs)) n++;
  return n;
}
