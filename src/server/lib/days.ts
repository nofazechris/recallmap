/** Calendar-day helpers. Instants are stored in UTC; "a study day" is a day in the learner's own timezone. */
export const safeTz = (tz: string | null | undefined) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz ?? 'UTC' }); return tz ?? 'UTC'; } catch { return 'UTC'; }
};

export const dayKey = (d: Date | string | number, tz = 'UTC'): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: safeTz(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
  return parts; // en-CA => YYYY-MM-DD
};

export const addDays = (key: string, n: number): string => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

/** ISO week key (Monday start) for weekly caps, e.g. 2026-W41. */
export const weekKey = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dow + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt.getTime() - firstThu.getTime()) / 864e5 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/** Start-of-day instant (UTC) for a local calendar day in `tz`. */
export const startOfDay = (key: string, tz = 'UTC'): Date => {
  const [y, m, d] = key.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d);
  // Two passes converge on the correct offset across DST changes.
  for (let i = 0; i < 2; i++) {
    const asLocal = new Date(guess).toLocaleString('en-US', { timeZone: safeTz(tz) });
    const diff = new Date(asLocal + ' UTC').getTime() - guess;
    guess = Date.UTC(y, m - 1, d) - diff;
  }
  return new Date(guess);
};

/** Current consecutive-day streak ending today (or yesterday, so an unfinished today doesn't break it). */
export const currentStreak = (days: Set<string>, today: string): number => {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
};

export const longestStreak = (days: Set<string>): number => {
  const sorted = [...days].sort();
  let best = 0, run = 0, prev: string | null = null;
  for (const k of sorted) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
};
