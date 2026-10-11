'use client';

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { api, ApiError, messageOf } from '../lib/api';
import type { AppState, Prefs, Rating, Toast, User } from './types';
import { recommendedTopic } from './selectors';

/**
 * Client-side view of the account. The truth lives in the database: this is a cache of what
 * `/api/me` returns, hydrated by the server on first render and refreshed after every change.
 */
export const EMPTY_PREFS: Prefs = {
  publicProfile: false, showTopics: false, shareFeed: false, reduceMotion: false,
  remindDaily: true, notifyBadges: true, notifyCommunity: true, typeAnswers: true,
};

export const ANON: AppState = {
  session: null,
  user: { id: '', name: '', username: '', email: '', bio: '', avatarTone: 0, xp: 0, streak: 0, longestStreak: 0, dailyGoal: 20, onboarded: false, showcase: [], timezone: 'UTC', isPublic: false, emailVerified: false },
  verificationRequired: false, aiAvailable: false,
  prefs: EMPTY_PREFS, topics: [], notifications: [], earned: {}, badges: [], activity: {},
  stats: { sessionsWeek: 0, xpWeek: 0, goalMetToday: false, reviewsToday: 0 }, credentials: [], goals: [], mastery: {},
};

/** The server's snapshot, as returned by GET /api/me (and handed to the provider on first render). */
export type ServerSnapshot = Omit<AppState, 'session'> & { user: User };
export const fromSnapshot = (s: ServerSnapshot): AppState => ({ ...s, session: { email: s.user.email } });

/* ───────────── store ───────────── */

export interface Store {
  get(): AppState;
  set(fn: (s: AppState) => AppState): void;
  subscribe(l: () => void): () => void;
  refresh(): Promise<void>;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(fn) { state = fn(state); listeners.forEach((l) => l()); },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    async refresh() {
      try {
        const snap = await api<ServerSnapshot>('GET', '/api/me');
        state = fromSnapshot(snap);
        listeners.forEach((l) => l());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { state = ANON; listeners.forEach((l) => l()); }
      }
    },
  };
}

const anonStore = createStore(ANON);
const Ctx = createContext<Store>(anonStore);
let active: Store = anonStore;

/** Applies the reduce-motion preference app-wide. */
function PrefsEffect() {
  const { prefs } = useApp();
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion); }, [prefs.reduceMotion]);
  return null;
}

/** Per-request store: server-rendered with the signed-in user's data, then live on the client. */
export function StoreProvider({ initial, children }: { initial: ServerSnapshot; children: ReactNode }) {
  const ref = useRef<Store | null>(null);
  if (!ref.current) ref.current = createStore(fromSnapshot(initial));
  if (typeof window !== 'undefined') active = ref.current;
  return <Ctx.Provider value={ref.current}><PrefsEffect />{children}</Ctx.Provider>;
}

export const useApp = (): AppState => {
  const s = useContext(Ctx);
  return useSyncExternalStore(s.subscribe, s.get, s.get);
};
/** Current state outside React (event handlers only). */
export const getState = () => active.get();
export const refresh = () => active.refresh();

/* ───────────── toasts (UI-only, never persisted) ───────────── */

let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const setToasts = (fn: (t: Toast[]) => Toast[]) => { toasts = fn(toasts); toastListeners.forEach((l) => l()); };
let toastSeq = 1;
export const toast = (t: Omit<Toast, 'id'>) => {
  const id = toastSeq++;
  setToasts((list) => [{ id, ...t }, ...list].slice(0, 4));
  setTimeout(() => dismissToast(id), 4600);
};
export const dismissToast = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));
const EMPTY_TOASTS: Toast[] = [];
export const useToasts = () => useSyncExternalStore((l) => { toastListeners.add(l); return () => { toastListeners.delete(l); }; }, () => toasts, () => EMPTY_TOASTS);

/** Show the outcome of a server action: XP earned and badges unlocked. */
export function announce(r: { xp?: number; unlocked?: { name: string }[]; body?: string }) {
  if (r.xp && r.xp > 0) toast({ kind: 'xp', title: `+${r.xp} XP earned`, body: r.body ?? '' });
  for (const u of r.unlocked ?? []) if (active.get().prefs.notifyBadges) toast({ kind: 'badge', title: 'Badge unlocked', body: u.name });
}

export const fail = (e: unknown) => { toast({ kind: 'error', title: 'That didn’t work', body: messageOf(e) }); };

/* ───────────── actions ───────────── */

const hardNav = (to: string) => { window.location.assign(to); };

export const actions = {
  /* auth */
  async signUp(name: string, email: string, password: string) {
    await api('POST', '/api/auth/register', { name, email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    await actions.signIn(email, password);
  },
  async signIn(email: string, password: string) {
    const { signIn } = await import('next-auth/react');
    const r = await signIn('credentials', { email, password, redirect: false });
    if (!r || r.error) throw new ApiError(401, 'bad_credentials', 'That email and password don’t match. Check them and try again.');
  },
  async signOut() {
    const { signOut } = await import('next-auth/react');
    await signOut({ redirect: false });
    hardNav('/');
  },
  async deleteAccount() {
    await api('DELETE', '/api/me');
    const { signOut } = await import('next-auth/react');
    await signOut({ redirect: false });
    hardNav('/');
  },

  /* profile & settings — applied locally right away, then saved */
  async updateUser(patch: Partial<Pick<User, 'name' | 'username' | 'bio' | 'avatarTone' | 'dailyGoal' | 'onboarded' | 'showcase' | 'timezone'>>) {
    const prev = active.get();
    active.set((s) => ({ ...s, user: { ...s.user, ...patch } }));
    const { name, ...rest } = patch;
    try {
      await api('PATCH', '/api/me/profile', { ...rest, ...(name !== undefined ? { displayName: name } : {}) });
      await active.refresh();
    } catch (e) { active.set(() => prev); throw e; }
  },
  async updatePrefs(patch: Partial<Prefs>) {
    const prev = active.get();
    active.set((s) => ({ ...s, prefs: { ...s.prefs, ...patch }, user: { ...s.user, isPublic: patch.publicProfile ?? s.user.isPublic } }));
    try { await api('PATCH', '/api/me/profile', { prefs: patch }); await active.refresh(); } catch (e) { active.set(() => prev); throw e; }
  },
  /** Pin / unpin a badge on your profile (max three). Returns false when the shelf is full. */
  async toggleShowcase(code: string): Promise<boolean> {
    const cur = active.get().user.showcase;
    if (!cur.includes(code) && cur.length >= 3) return false;
    await actions.updateUser({ showcase: cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code] });
    return true;
  },

  /* topics */
  async createTopic(name: string, goal?: string, targetDate?: string): Promise<string> {
    const { topic } = await api<{ topic: { id: string } }>('POST', '/api/topics', { title: name.trim(), goal: goal?.trim() || undefined, targetDate: targetDate?.trim() || undefined });
    await active.refresh();
    return topic.id;
  },
  async deleteTopic(id: string) { await api('DELETE', `/api/topics/${id}`); await active.refresh(); },

  /* notifications — optimistic */
  async notify(op: 'read' | 'unread' | 'dismiss' | 'read_all' | 'clear_read', ids: string[] = []) {
    const prev = active.get();
    active.set((s) => ({
      ...s,
      notifications: op === 'read' ? s.notifications.map((n) => (ids.includes(n.id) ? { ...n, unread: false } : n))
        : op === 'unread' ? s.notifications.map((n) => (ids.includes(n.id) ? { ...n, unread: true } : n))
        : op === 'dismiss' ? s.notifications.filter((n) => !ids.includes(n.id))
        : op === 'read_all' ? s.notifications.map((n) => ({ ...n, unread: false }))
        : s.notifications.filter((n) => n.unread),
    }));
    try { await api('POST', '/api/notifications', op === 'read_all' || op === 'clear_read' ? { op } : { op, ids }); }
    catch (e) { active.set(() => prev); fail(e); }
  },
  markRead: (id: string) => actions.notify('read', [id]),
  markUnread: (id: string) => actions.notify('unread', [id]),
  dismissNotif: (id: string) => actions.notify('dismiss', [id]),
  markAllRead: () => actions.notify('read_all'),
  clearRead: () => actions.notify('clear_read'),
};

export type { Rating };

/** Where "Study" should go from anywhere in the app. */
export const studyHref = (s: AppState = active.get()) => {
  const t = recommendedTopic(s);
  return t && t.cards.length ? `/study/${t.id}` : t ? `/app/topics/${t.id}` : '/app';
};
