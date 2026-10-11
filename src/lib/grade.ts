export type Rating = 'again' | 'hard' | 'good' | 'easy';

/**
 * Light, local answer matching for "type before you flip".
 *
 * It compares the key words in what you typed with the key words in the card's answer. It is a
 * heuristic to *suggest* a rating — never to decide one. Wording differences, synonyms and
 * paraphrases will score lower than they deserve, so the learner always has the final say.
 */
export type MatchLevel = 'close' | 'partial' | 'miss' | 'none';

export interface Match {
  level: MatchLevel;
  /** 0–1 share of the answer's key words found in the typed text. */
  score: number;
  suggested: Rating;
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'in', 'on', 'at', 'by', 'for', 'with',
  'as', 'it', 'its', 'that', 'this', 'these', 'those', 'from', 'into', 'than', 'then', 'so', 'if', 'but', 'not', 'no',
]);

/** lower-case, strip punctuation, crude plural stemming. */
export const norm = (w: string) => {
  const s = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s;
};

/** Words that matter. Hyphenated terms ("electron-pair") count as their parts. */
const parts = (w: string) => w.split(/[-‐-―/]/).map(norm).filter((x) => x && !STOP.has(x));
const content = (text: string) => text.split(/\s+/).flatMap(parts);

export const grade = (typed: string, answer: string): Match => {
  if (!typed.trim()) return { level: 'none', score: 0, suggested: 'again' };
  const want = [...new Set(content(answer))];
  const have = new Set(content(typed));
  if (want.length === 0) {
    const same = norm(typed) === norm(answer);
    return { level: same ? 'close' : 'miss', score: same ? 1 : 0, suggested: same ? 'good' : 'again' };
  }
  const score = want.filter((w) => have.has(w)).length / want.length;
  if (score >= 0.6) return { level: 'close', score, suggested: score >= 0.95 ? 'easy' : 'good' };
  if (score >= 0.3) return { level: 'partial', score, suggested: 'hard' };
  return { level: 'miss', score, suggested: 'again' };
};

export interface Piece { text: string; hit?: boolean }

/** Splits the correct answer into pieces, flagging key words the learner got (true) or missed (false). */
export const markAnswer = (typed: string, answer: string): Piece[] => {
  const have = new Set(content(typed));
  return answer.split(/(\s+)/).map((text) => {
    const ps = parts(text);
    if (ps.length === 0 || /^\s+$/.test(text)) return { text };
    return { text, hit: ps.every((x) => have.has(x)) };
  });
};

export const matchLabel: Record<MatchLevel, string> = {
  close: 'Close match',
  partial: 'Partly there',
  miss: 'Not quite',
  none: 'No answer',
};
