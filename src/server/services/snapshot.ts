import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  achievements, conceptEdges, concepts, credentials, flashcards, notifications, profiles, quizQuestions, quizzes, resources, studyKits, studySessions, topics, userAchievements, users,
} from '../db/schema';
import { notFound } from '../lib/errors';
import { dayKey } from '../lib/days';
import { reviewsByDay, studyDays } from './activity';
import { attemptsByTopic, masteryFrom, progressFrom } from './achievements';
import { currentStreak, longestStreak } from '../lib/days';
import { cardStatesForTopics } from './study';
import { getRules } from './rules';
import { listGoals } from './goals';
import { verificationRequired } from './verification';
import { aiConfigured } from '../ai/provider';

/**
 * Everything the signed-in UI renders from, computed from stored records.
 * Flashcard answers and quiz answer keys are deliberately absent — they only leave the server through
 * the study-session and quiz-attempt flows, after an answer has been submitted.
 *
 * Queries are issued in three parallel rounds (not one long chain) because every round trip to a hosted
 * database costs real time; this keeps /api/me fast.
 */
export interface Snapshot {
  user: {
    id: string; name: string; username: string; email: string; bio: string; avatarTone: number; xp: number; streak: number; longestStreak: number;
    dailyGoal: number; onboarded: boolean; showcase: string[]; timezone: string; isPublic: boolean; emailVerified: boolean;
  };
  verificationRequired: boolean;
  /** True when an AI provider is configured (study kits, typed-answer feedback). */
  aiAvailable: boolean;
  prefs: (typeof profiles.$inferSelect)['prefs'];
  topics: SnapTopic[];
  notifications: { id: string; type: string; html: string; at: string; unread: boolean; href: string }[];
  earned: Record<string, { date: string; verified?: boolean }>;
  badges: { code: string; name: string; description: string; icon: string; category: string; progress: { pct: number; meta: string } }[];
  activity: Record<string, number>;
  stats: { sessionsWeek: number; xpWeek: number; goalMetToday: boolean; reviewsToday: number };
  credentials: { id: string; code: string; topic: string | null; status: string; txHash: string | null; issuedAt: string | null }[];
  goals: Awaited<ReturnType<typeof listGoals>>;
  mastery: Record<string, { ready: number; master: number }>;
}

export interface SnapTopic {
  id: string; name: string; category: string; goal?: string; targetDate?: string; visibility: string; createdAt: string; archived: boolean;
  cards: { id: string; concept: string; q: string; strength: number; due: boolean; dueIn: number; status: 'approved' }[];
  draftCards: number;
  quizId: string | null;
  questions: { id: string; concept: string; prompt: string }[];
  resources: { id: string; name: string; ext: string; added: string; status: string; error: string | null; pages: number | null; cards: number; questions: number }[];
  concepts: { name: string; desc: string }[];
  /** Real relationships between concepts (from the study kit), by concept name. */
  edges: { a: string; b: string }[];
  assessments: number[];
  sessions: number;
  kit: { id: string; status: string; error: string | null } | null;
}

const ext = (name: string) => name.slice(name.lastIndexOf('.') + 1).toUpperCase().replace('MARKDOWN', 'MD');

export async function buildSnapshot(db: Db, userId: string, now = new Date()): Promise<Snapshot> {
  const weekAgo = new Date(now.getTime() - 7 * 864e5);

  /* ── round 1: everything that only needs the user id ── */
  const [rowArr, xpRow, topicRows, notifs, ua, creds, defs, sessByTopic, attemptRows, rules] = await Promise.all([
    db.select({ u: users, p: profiles }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, userId)).limit(1),
    db.execute(sql`select coalesce(sum(amount), 0)::int as xp, coalesce(sum(amount) filter (where created_at > ${weekAgo}), 0)::int as xw from xp_ledger where user_id = ${userId}`),
    db.select().from(topics).where(and(eq(topics.ownerId, userId), isNull(topics.archivedAt))).orderBy(desc(topics.createdAt)),
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(60),
    db.select({ code: achievements.code, at: userAchievements.unlockedAt }).from(userAchievements).innerJoin(achievements, eq(achievements.id, userAchievements.achievementId)).where(eq(userAchievements.userId, userId)),
    db.select({ c: credentials, code: achievements.code, topic: topics.title }).from(credentials)
      .innerJoin(achievements, eq(achievements.id, credentials.achievementId)).leftJoin(topics, eq(topics.id, credentials.topicId)).where(eq(credentials.userId, userId)).orderBy(desc(credentials.createdAt)),
    db.select().from(achievements).where(eq(achievements.isActive, true)),
    db.select({ topicId: studySessions.topicId, n: sql<number>`count(*)::int`, wk: sql<number>`count(*) filter (where ${studySessions.completedAt} > ${weekAgo})::int` })
      .from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.qualified, true))).groupBy(studySessions.topicId),
    getRules(db).then((r) => attemptsByTopic(db, userId, r.mastery.minQuestions)),
    getRules(db),
  ]);
  const row = rowArr[0];
  if (!row) throw notFound('Account not found.');
  const { u, p } = row;
  const tz = p.timezone;
  const today = dayKey(now, tz);
  const ids = topicRows.map((t) => t.id);
  const { xp, xw } = xpRow.rows[0] as { xp: number; xw: number };

  /* ── round 2: depends on the user's timezone / topic ids ── */
  const [days, reviews, goals, conceptRows, edgeRows, resRows, quizRows, kitRows, draftRows, cardRows] = await Promise.all([
    studyDays(db, userId, tz),
    reviewsByDay(db, userId, tz, 400),
    listGoals(db, userId, tz),
    ids.length ? db.select().from(concepts).where(inArray(concepts.topicId, ids)).orderBy(asc(concepts.createdAt)) : [],
    ids.length ? db.select().from(conceptEdges).where(inArray(conceptEdges.topicId, ids)) : [],
    ids.length ? db.select().from(resources).where(inArray(resources.topicId, ids)).orderBy(asc(resources.createdAt)) : [],
    ids.length ? db.select().from(quizzes).where(and(inArray(quizzes.topicId, ids), eq(quizzes.status, 'published'))) : [],
    ids.length ? db.select().from(studyKits).where(and(inArray(studyKits.topicId, ids), eq(studyKits.ownerId, userId))).orderBy(desc(studyKits.createdAt)) : [],
    ids.length ? db.select({ topicId: flashcards.topicId, n: sql<number>`count(*)::int` }).from(flashcards).where(and(inArray(flashcards.topicId, ids), eq(flashcards.status, 'draft'))).groupBy(flashcards.topicId) : [],
    cardStatesForTopics(db, userId, ids),
  ]);

  /* ── round 3: questions of the published quizzes ── */
  const qIds = quizRows.map((q) => q.id);
  const questionRows = qIds.length ? await db.select().from(quizQuestions).where(inArray(quizQuestions.quizId, qIds)).orderBy(asc(quizQuestions.position)) : [];

  const cName = new Map(conceptRows.map((c) => [c.id, c.name]));
  const perTopic = masteryFrom(rules, attemptRows);
  const scores = new Map<string, number[]>();
  for (const [topicId, list] of attemptRows) scores.set(topicId, [...list].sort((a, b) => a.at.getTime() - b.at.getTime()).map((a) => Math.round(a.score)));

  const cardCountByRes = new Map<string, number>();
  for (const c of cardRows) if (c.sourceResourceId) cardCountByRes.set(c.sourceResourceId, (cardCountByRes.get(c.sourceResourceId) ?? 0) + 1);
  const qCountByRes = new Map<string, number>();
  for (const q of questionRows) {
    const rid = (q.sourceMetadata as { resourceId?: string }).resourceId;
    if (rid) qCountByRes.set(rid, (qCountByRes.get(rid) ?? 0) + 1);
  }

  const out: SnapTopic[] = topicRows.map((t) => {
    const quiz = quizRows.find((q) => q.topicId === t.id) ?? null;
    const kit = kitRows.find((k) => k.topicId === t.id && ['queued', 'generating', 'ready', 'failed'].includes(k.status)) ?? null;
    return {
      id: t.id, name: t.title, category: t.category, goal: t.goal ?? undefined, targetDate: t.targetDate ?? undefined, visibility: t.visibility,
      createdAt: t.createdAt.toISOString(), archived: false,
      cards: cardRows.filter((c) => c.topicId === t.id).map((c) => {
        const due = !c.dueAt || c.dueAt <= now;
        return { id: c.id, concept: c.concept ?? 'General', q: c.question, strength: c.strength ?? 0, due, dueIn: due ? 0 : Math.max(1, Math.ceil((c.dueAt!.getTime() - now.getTime()) / 864e5)), status: 'approved' as const };
      }),
      draftCards: draftRows.find((d) => d.topicId === t.id)?.n ?? 0,
      quizId: quiz?.id ?? null,
      questions: quiz ? questionRows.filter((q) => q.quizId === quiz.id).map((q) => ({ id: q.id, concept: cName.get(q.conceptId ?? '') ?? 'General', prompt: q.questionText })) : [],
      resources: resRows.filter((r) => r.topicId === t.id).map((r) => ({
        id: r.id, name: r.originalFilename, ext: ext(r.originalFilename), added: r.createdAt.toISOString(), status: r.processingStatus, error: r.processingError,
        pages: r.pageCount, cards: cardCountByRes.get(r.id) ?? 0, questions: qCountByRes.get(r.id) ?? 0,
      })),
      concepts: conceptRows.filter((c) => c.topicId === t.id).map((c) => ({ name: c.name, desc: c.description })),
      edges: edgeRows.filter((e) => e.topicId === t.id).flatMap((e) => { const a = cName.get(e.fromConceptId), b = cName.get(e.toConceptId); return a && b ? [{ a, b }] : []; }),
      assessments: (scores.get(t.id) ?? []).slice(-12),
      sessions: sessByTopic.find((s) => s.topicId === t.id)?.n ?? 0,
      kit: kit ? { id: kit.id, status: kit.status, error: kit.error } : null,
    };
  });

  const verifiedCodes = new Set(creds.filter((c) => c.c.status === 'verified').map((c) => c.code));
  const qualifiedSessions = sessByTopic.reduce((n, s) => n + s.n, 0);
  const sessionsWeek = sessByTopic.reduce((n, s) => n + s.wk, 0);
  const cur = currentStreak(days, today);
  const goalDays = [...reviews].filter(([, n]) => n >= p.dailyGoal).map(([d]) => d);
  const progress = progressFrom({ rules, today, days, currentStreak: cur, goalDays, perTopic, qualifiedSessions });

  const mastery: Snapshot['mastery'] = {};
  for (const [tid, v] of perTopic) mastery[tid] = { ready: v.ready, master: v.master };

  return {
    user: {
      id: u.id, name: p.displayName, username: p.username, email: u.email, bio: p.bio, avatarTone: p.avatarTone, xp, streak: cur, longestStreak: longestStreak(days),
      dailyGoal: p.dailyGoal, onboarded: p.onboarded, showcase: p.showcase, timezone: tz, isPublic: p.isPublic, emailVerified: !!u.emailVerifiedAt,
    },
    verificationRequired: verificationRequired(),
    aiAvailable: aiConfigured(),
    prefs: p.prefs,
    topics: out,
    notifications: notifs.map((n) => ({ id: n.id, type: n.type, html: n.html, at: n.createdAt.toISOString(), unread: n.unread, href: n.href })),
    earned: Object.fromEntries(ua.map((a) => [a.code, { date: a.at.toISOString(), verified: verifiedCodes.has(a.code) || undefined }])),
    badges: defs.map((d) => ({ code: d.code, name: d.name, description: d.description, icon: d.icon, category: d.category, progress: progress[d.code] ?? { pct: 0, meta: d.code === 'challenge-finisher' ? 'Complete a study challenge' : d.code === 'verified-achievement' ? 'Verify any eligible badge to unlock' : '' } })),
    activity: Object.fromEntries(reviews),
    stats: { sessionsWeek, xpWeek: xw, goalMetToday: (reviews.get(today) ?? 0) >= p.dailyGoal, reviewsToday: reviews.get(today) ?? 0 },
    credentials: creds.map((c) => ({ id: c.c.id, code: c.code, topic: c.topic, status: c.c.status, txHash: c.c.transactionHash, issuedAt: c.c.issuedAt?.toISOString() ?? null })),
    goals,
    mastery,
  };
}
