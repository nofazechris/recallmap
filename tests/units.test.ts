import { describe, expect, it } from 'vitest';
import { quoteSupported, selectPassages, validateKit } from '../src/server/ai/generate-study-content';
import { chunk, detectKind, ExtractionError, normalise } from '../src/server/services/extraction';
import { gradeAttempt, isCorrect, masteryProgress, masteryReached } from '../src/server/services/grading';
import { schedule } from '../src/server/services/srs';
import { DEFAULT_RULES } from '../src/server/db/seed';
import { addDays, currentStreak, dayKey, longestStreak, startOfDay, weekKey } from '../src/server/lib/days';
import { grade } from '../src/lib/grade';

const srs = DEFAULT_RULES['srs.rules'] as never;
const now = new Date('2026-10-10T12:00:00Z');
const DAY = 864e5;

describe('spaced repetition', () => {
  it('first reviews use fixed intervals', () => {
    expect(schedule(null, 'good', now, srs).intervalDays).toBe(3);
    expect(schedule(null, 'easy', now, srs).intervalDays).toBe(7);
    expect(schedule(null, 'hard', now, srs).intervalDays).toBe(1);
  });
  it('"again" is due in minutes, counts a lapse and lowers ease', () => {
    const s = schedule({ intervalDays: 6, easeFactor: 2.5, reviewCount: 3, lapses: 0, strength: 60 }, 'again', now, srs);
    expect(s.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(s.lapses).toBe(1);
    expect(s.easeFactor).toBeLessThan(2.5);
    expect(s.strength).toBe(40);
  });
  it('good grows the interval by ease; ease never drops below the floor', () => {
    const s = schedule({ intervalDays: 4, easeFactor: 2.5, reviewCount: 2, lapses: 0, strength: 50 }, 'good', now, srs);
    expect(s.intervalDays).toBe(10);
    let st = { intervalDays: 1, easeFactor: 1.4, reviewCount: 5, lapses: 0, strength: 50 };
    for (let i = 0; i < 6; i++) { const n = schedule(st, 'again', now, srs); st = { ...n }; }
    expect(st.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
  it('strength stays within 10–99', () => {
    let st = { intervalDays: 1, easeFactor: 2.5, reviewCount: 1, lapses: 0, strength: 95 };
    for (let i = 0; i < 5; i++) st = { ...schedule(st, 'easy', now, srs) };
    expect(st.strength).toBe(99);
    for (let i = 0; i < 8; i++) st = { ...schedule(st, 'again', now, srs) };
    expect(st.strength).toBe(10);
  });
});

describe('quiz grading', () => {
  const qs = [
    { id: 'a', answerKey: { type: 'multiple_choice' as const, correctIndex: 2 } },
    { id: 'b', answerKey: { type: 'true_false' as const, value: false } },
    { id: 'c', answerKey: { type: 'multiple_choice' as const, correctIndex: 0 } },
    { id: 'd', answerKey: { type: 'true_false' as const, value: true } },
  ];
  it('scores correct / total x 100', () => {
    const r = gradeAttempt(qs, new Map([['a', 2], ['b', false], ['c', 1], ['d', null]]));
    expect(r.correct).toBe(2);
    expect(r.score).toBe(50);
  });
  it('unanswered and wrong-typed answers are wrong; an empty quiz has no score', () => {
    expect(isCorrect(qs[0].answerKey, undefined)).toBe(false);
    expect(isCorrect(qs[0].answerKey, '2' as never)).toBe(false);
    expect(isCorrect(qs[1].answerKey, 0 as never)).toBe(false);
    expect(gradeAttempt([], new Map()).score).toBeNull();
  });
});

describe('mastery rules', () => {
  const at = (m: number) => new Date(now.getTime() + m * 60_000);
  const gap = 30 * 60_000;
  it('needs two distinct, spaced attempts above the threshold', () => {
    expect(masteryReached([{ id: '1', at: at(0), score: 85 }, { id: '2', at: at(5), score: 90 }], 80, 2, gap)).toBe(false); // same sitting
    expect(masteryReached([{ id: '1', at: at(0), score: 85 }, { id: '2', at: at(45), score: 90 }], 80, 2, gap)).toBe(true);
  });
  it('a low score in between does not reset progress; the threshold is inclusive', () => {
    expect(masteryReached([{ id: '1', at: at(0), score: 80 }, { id: '2', at: at(40), score: 60 }, { id: '3', at: at(90), score: 80 }], 80, 2, gap)).toBe(true);
    expect(masteryReached([{ id: '1', at: at(0), score: 79.9 }, { id: '2', at: at(60), score: 79.9 }], 80, 2, gap)).toBe(false);
  });
  it('reports partial progress', () => {
    expect(masteryProgress([{ id: '1', at: at(0), score: 95 }], 90, gap)).toBe(1);
  });
});

describe('days, streaks and timezones', () => {
  it('uses the learner\'s calendar day, not UTC', () => {
    const t = new Date('2026-10-10T02:30:00Z');
    expect(dayKey(t, 'UTC')).toBe('2026-10-10');
    expect(dayKey(t, 'America/Los_Angeles')).toBe('2026-10-09');
    expect(dayKey(t, 'Asia/Tokyo')).toBe('2026-10-10');
  });
  it('start of a local day respects the offset', () => {
    expect(startOfDay('2026-10-10', 'Asia/Tokyo').toISOString()).toBe('2026-10-09T15:00:00.000Z');
  });
  it('streak counts back from today, or from yesterday if today is not done yet', () => {
    const days = new Set(['2026-10-07', '2026-10-08', '2026-10-09']);
    expect(currentStreak(days, '2026-10-10')).toBe(3);
    expect(currentStreak(days, '2026-10-12')).toBe(0);
    expect(currentStreak(new Set([...days, '2026-10-10']), '2026-10-10')).toBe(4);
    expect(longestStreak(new Set(['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-05', '2026-01-06']))).toBe(3);
  });
  it('adds days across month ends and builds ISO week keys', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekKey('2026-10-10')).toBe('2026-W41');
    expect(weekKey('2026-01-01')).toBe('2026-W01');
    expect(weekKey('2021-01-03')).toBe('2020-W53');
  });
});

describe('document extraction', () => {
  it('detects supported types from name and mime', () => {
    expect(detectKind('notes.pdf', 'application/pdf')).toBe('pdf');
    expect(detectKind('notes.MD', 'text/markdown')).toBe('md');
    expect(detectKind('notes.exe', 'application/octet-stream')).toBeNull();
    expect(detectKind('notes.pdf', 'image/png')).toBeNull();
  });
  it('normalises whitespace and strips NUL bytes', () => {
    expect(normalise('a\u0000b\r\n\r\n\r\n\r\nc   d')).toBe('ab\n\nc d');
  });
  it('chunks on paragraph boundaries and keeps page numbers', () => {
    const para = 'Sentence about recall. '.repeat(40);
    const chunks = chunk([{ page: 1, text: `${para}\n\n${para}\n\n${para}` }, { page: 2, text: 'Page two content that is long enough to keep.' }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 3000)).toBe(true);
    expect(chunks.at(-1)!.pageNumber).toBe(2);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
  it('rejects documents that are too large', () => {
    expect(() => chunk([{ page: null, text: 'x'.repeat(1_600_000) }])).toThrow(ExtractionError);
  });
});

describe('AI output validation', () => {
  const passages = [{ id: 'c1', resourceId: 'r1', page: 3, text: 'Mitochondria produce ATP through oxidative phosphorylation in the inner membrane.' }];
  const card = (over: object = {}) => ({ concept: 'Cells', question: 'What do mitochondria produce?', answer: 'ATP', explanation: 'Via oxidative phosphorylation.', difficulty: 'easy' as const, source: 'c1', evidence: 'produce ATP through oxidative phosphorylation', ...over });
  const q = (over: object = {}) => ({ concept: 'Cells', type: 'multiple_choice' as const, prompt: 'Where does it happen?', options: ['Inner membrane', 'Nucleus', 'Ribosome'], correctIndex: 0, explanation: 'x', difficulty: 'easy' as const, source: 'c1', evidence: 'in the inner membrane', ...over });
  const cfg = { cards: 10, questions: 10, difficulty: 'mixed' as const };

  it('keeps grounded items and drops fabricated quotes, unknown sources and malformed questions', () => {
    const kit = validateKit({
      concepts: [{ name: 'Cells', description: 'd' }],
      flashcards: [card(), card({ question: 'Invented?', evidence: 'The moon is made of cheese and rocks' }), card({ question: 'Other?', source: 'c9' })],
      questions: [q(), q({ prompt: 'Bad index', correctIndex: 7 }), q({ prompt: 'Dupes', options: ['A', 'A', 'B'] }), q({ type: 'true_false', prompt: 'TF', answer: true, options: undefined, correctIndex: undefined })],
    }, passages, cfg);
    expect(kit.cards).toHaveLength(1);
    expect(kit.questions.map((x) => x.prompt)).toEqual(['Where does it happen?', 'TF']);
    expect(kit.dropped).toEqual({ cards: 2, questions: 2 });
  });
  it('drops duplicate questions and respects the requested counts', () => {
    const kit = validateKit({ concepts: [], flashcards: [card(), card(), card({ question: 'Second?' }), card({ question: 'Third?' })], questions: [] }, passages, { ...cfg, cards: 2 });
    expect(kit.cards).toHaveLength(2);
  });
  it('quote matching is forgiving about case and punctuation but not about invention', () => {
    expect(quoteSupported('PRODUCE ATP, through oxidative phosphorylation', passages[0].text)).toBe(true);
    expect(quoteSupported('chloroplasts produce glucose', passages[0].text)).toBe(false);
    expect(quoteSupported('ATP', passages[0].text)).toBe(false); // too short to be evidence
  });
  it('samples evenly when the material exceeds the prompt budget', () => {
    const chunks = Array.from({ length: 100 }, (_, i) => ({ id: String(i), resourceId: 'r', page: i + 1, text: 'x'.repeat(1000) }));
    const p = selectPassages(chunks, 10_000);
    expect(p.length).toBe(10);
    expect(p[0].page).toBe(1);
    expect(p.at(-1)!.page).toBeGreaterThan(80);
  });
});

describe('answer matching heuristic', () => {
  it('only suggests a rating', () => {
    expect(grade('', 'Electron-pair donor').level).toBe('none');
    expect(grade('a donor of an electron pair', 'Electron-pair donor').level).toBe('close');
    expect(grade('something unrelated', 'Electron-pair donor').suggested).toBe('again');
  });
});
