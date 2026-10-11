import type { AppState, ConceptState, Topic } from './types';

export const topicRecall = (t: Topic) =>
  t.cards.length ? Math.round(t.cards.reduce((n, c) => n + c.strength, 0) / t.cards.length) : 0;

export const topicDue = (t: Topic) => t.cards.filter((c) => c.due).length;

export const totalDue = (s: AppState) => s.topics.reduce((n, t) => n + topicDue(t), 0);

export const avgRecall = (s: AppState) => {
  const withCards = s.topics.filter((t) => t.cards.length);
  return withCards.length ? Math.round(withCards.reduce((n, t) => n + topicRecall(t), 0) / withCards.length) : 0;
};

export const level = (xp: number) => Math.floor(xp / 200) + 1;
export const levelProgress = (xp: number) => (xp % 200) / 200;

export const reviewsToday = (s: AppState) => s.stats.reviewsToday;

/** Calendar day (YYYY-MM-DD) in the learner's own timezone. */
export const dayKey = (tz: string, d: Date = new Date()) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  catch { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
};

export const findTopic = (s: AppState, id?: string) => s.topics.find((t) => t.id === id);

/** The topic that needs attention most: most due cards, ties go to lowest recall. */
export const recommendedTopic = (s: AppState): Topic | undefined => {
  const withCards = s.topics.filter((t) => t.cards.length);
  if (!withCards.length) return s.topics[0];
  return [...withCards].sort((a, b) => topicDue(b) - topicDue(a) || topicRecall(a) - topicRecall(b))[0];
};

export interface ConceptStat {
  name: string;
  desc: string;
  cards: number;
  due: number;
  recall: number;
  state: ConceptState;
}

export const conceptState = (cards: number, due: number, recall: number): ConceptState => {
  if (!cards) return 'unexplored';
  if (recall >= 90 && due === 0) return 'mastered';
  if (due > 0 && recall < 80) return 'due';
  if (recall >= 80) return 'strong';
  return 'learning';
};

export const conceptStats = (t: Topic): ConceptStat[] => {
  const names = new Set(t.concepts.map((c) => c.name));
  // Cards whose concept isn't declared still show up as a node.
  const extra = [...new Set(t.cards.map((c) => c.concept))].filter((n) => !names.has(n)).map((name) => ({ name, desc: '' }));
  return [...t.concepts, ...extra].map((m) => {
    const cs = t.cards.filter((c) => c.concept === m.name);
    const recall = cs.length ? Math.round(cs.reduce((n, c) => n + c.strength, 0) / cs.length) : 0;
    const due = cs.filter((c) => c.due).length;
    return { name: m.name, desc: m.desc, cards: cs.length, due, recall, state: conceptState(cs.length, due, recall) };
  });
};

export const stateLabel: Record<ConceptState, string> = {
  mastered: 'Mastered',
  strong: 'Strong recall',
  learning: 'Learning',
  due: 'Due for review',
  unexplored: 'Unexplored',
};

export const recallLabel = (r: number) => {
  if (r === 0) return 'Not started';
  if (r >= 90) return 'Excellent';
  if (r >= 80) return 'Strong';
  if (r >= 65) return 'Building';
  return 'Needs work';
};

export const weekBars = (s: AppState) => {
  const out: { label: string; value: number; today: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({
      label: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      value: s.activity[dayKey(s.user.timezone, d)] ?? 0,
      today: i === 0,
    });
  }
  return out;
};

export const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
};

export const isToday = (iso: string, tz = 'UTC') => dayKey(tz, new Date(iso)) === dayKey(tz);

/* ───────────────────────── badges ───────────────────────── */

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  tone: 'lime' | 'blue';
}

const LIME = new Set(['first-steps', 'topic-master']);

/** Badge catalogue, straight from the server's `achievements` table (with a display tone for the UI). */
export const badgeDefs = (s: AppState): BadgeDef[] =>
  s.badges.map((b) => ({ id: b.code, name: b.name, icon: b.icon, desc: b.description, tone: LIME.has(b.code) ? 'lime' : 'blue' }));

export const badgeMet = (s: AppState, id: string): boolean => !!s.earned[id];

/** Progress toward a badge — computed by the server from stored records. */
export const badgeProgress = (s: AppState, id: string): { pct: number; meta: string } =>
  s.badges.find((b) => b.code === id)?.progress ?? { pct: 0, meta: '' };
