export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type ConceptState = 'mastered' | 'strong' | 'learning' | 'due' | 'unexplored';

/** A flashcard as the app lists it. The reference answer is deliberately not here — it only arrives after you answer. */
export interface Card {
  id: string;
  concept: string;
  q: string;
  /** 0–100 — how firmly the card is remembered, from your review history. */
  strength: number;
  due: boolean;
  /** Days until next review (0 when due now). */
  dueIn: number;
}

export interface Question {
  id: string;
  concept: string;
  prompt: string;
}

export interface Resource {
  id: string;
  name: string;
  ext: string;
  added: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed' | string;
  error: string | null;
  pages: number | null;
  cards: number;
  questions: number;
}

export interface ConceptMeta {
  name: string;
  desc: string;
}

export interface KitStatus {
  id: string;
  status: 'queued' | 'generating' | 'ready' | 'approved' | 'failed' | string;
  error: string | null;
}

export interface Topic {
  id: string;
  name: string;
  category: string;
  goal?: string;
  targetDate?: string;
  visibility: string;
  cards: Card[];
  /** Flashcards from an AI kit waiting for your review. */
  draftCards: number;
  quizId: string | null;
  questions: Question[];
  resources: Resource[];
  concepts: ConceptMeta[];
  /** Relationships between concepts, by name. */
  edges: { a: string; b: string }[];
  /** Scores (0–100) from submitted quizzes. */
  assessments: number[];
  sessions: number;
  createdAt: string;
  kit: KitStatus | null;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  bio: string;
  avatarTone: number;
  xp: number;
  streak: number;
  longestStreak: number;
  dailyGoal: number;
  onboarded: boolean;
  showcase: string[];
  timezone: string;
  isPublic: boolean;
  emailVerified: boolean;
}

export interface Prefs {
  publicProfile: boolean;
  showTopics: boolean;
  shareFeed: boolean;
  reduceMotion: boolean;
  remindDaily: boolean;
  notifyBadges: boolean;
  notifyCommunity: boolean;
  /** Study sessions ask you to type your answer before the card turns. */
  typeAnswers: boolean;
}

export type NotifType = 'badge' | 'due' | 'social' | 'verified' | 'xp';

export interface Notif {
  id: string;
  type: NotifType;
  html: string;
  at: string;
  unread: boolean;
  href: string;
}

export interface Badge {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  progress: { pct: number; meta: string };
}

export interface EarnedBadge {
  date: string;
  verified?: boolean;
}

export interface CredentialRow {
  id: string;
  code: string;
  topic: string | null;
  status: 'pending' | 'submitted' | 'verified' | 'failed' | string;
  txHash: string | null;
  issuedAt: string | null;
}

export interface Goal {
  id: string;
  goalType: 'reviews' | 'sessions' | 'quizzes';
  targetValue: number;
  period: 'daily' | 'weekly';
  progress: number;
  done: boolean;
}

export interface AppState {
  /** True when the server sends verification emails and gates community features on a confirmed address. */
  verificationRequired: boolean;
  /** True when an AI provider is configured on the server. */
  aiAvailable: boolean;
  /** True once the server has confirmed a signed-in account. */
  session: { email: string } | null;
  user: User;
  prefs: Prefs;
  topics: Topic[];
  notifications: Notif[];
  earned: Record<string, EarnedBadge>;
  badges: Badge[];
  /** Rated reviews per local calendar day (YYYY-MM-DD). */
  activity: Record<string, number>;
  stats: { sessionsWeek: number; xpWeek: number; goalMetToday: boolean; reviewsToday: number };
  credentials: CredentialRow[];
  goals: Goal[];
  mastery: Record<string, { ready: number; master: number }>;
}

export interface Toast {
  id: number;
  title: string;
  body: string;
  kind: 'xp' | 'badge' | 'due' | 'error' | 'info';
}
