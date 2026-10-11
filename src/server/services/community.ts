import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db, DbOrTx } from '../db';
import {
  achievements, activities, challengeParticipants, challenges, credentials, follows, profiles, studyCircleMembers, studyCircles, topics, userAchievements, users,
} from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { escapeHtml } from './users';
import { totalXp } from './xp';
import { requireVerified } from './verification';
import { notify } from './notifications';

/* ───────────── activity feed ───────────── */

/** Only these fields ever reach a public feed — never answers, notes, file names or emails. */
const SAFE_META = ['name', 'icon', 'topicTitle', 'score', 'count', 'title'] as const;

export async function activityRecord(db: DbOrTx, userId: string, a: { type: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const [p] = await db.select({ isPublic: profiles.isPublic, prefs: profiles.prefs }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const visibility = p?.isPublic && p.prefs.shareFeed ? 'public' : 'private';
  const metadata: Record<string, unknown> = {};
  for (const k of SAFE_META) if (a.metadata?.[k] !== undefined) metadata[k] = a.metadata[k];
  await db.insert(activities).values({ userId, activityType: a.type, entityType: a.entityType, entityId: a.entityId ?? null, visibility, metadata });
}

export interface FeedItem { id: string; type: string; at: string; who: { username: string; name: string; tone: number }; text: string; mine: boolean }

const describe = (type: string, m: Record<string, unknown>) => {
  switch (type) {
    case 'badge_unlocked': return `earned the ${String(m.name ?? 'a new')} badge`;
    case 'challenge_completed': return `completed the ${String(m.title ?? 'study')} challenge`;
    case 'quiz_passed': return `scored ${Math.round(Number(m.score ?? 0))}% on a ${String(m.topicTitle ?? 'topic')} quiz`;
    case 'streak': return `reached a ${Number(m.count ?? 0)}-day streak`;
    case 'session_completed': return `finished a ${String(m.topicTitle ?? 'study')} session`;
    default: return 'did something great';
  }
};

/** Your own activity plus public activity from people you follow. */
export async function feed(db: Db, userId: string, limit = 30): Promise<FeedItem[]> {
  const followed = await db.select({ id: follows.followedId }).from(follows).where(eq(follows.followerId, userId));
  const ids = followed.map((f) => f.id);
  const rows = await db.select({ a: activities, p: profiles }).from(activities).innerJoin(profiles, eq(profiles.userId, activities.userId))
    .where(or(eq(activities.userId, userId), ids.length ? and(inArray(activities.userId, ids), inArray(activities.visibility, ['public', 'followers'])) : sql`false`))
    .orderBy(desc(activities.createdAt)).limit(limit);
  return rows.map(({ a, p }) => ({
    id: a.id, type: a.activityType, at: a.createdAt.toISOString(), mine: a.userId === userId,
    who: { username: p.username, name: p.displayName, tone: p.avatarTone }, text: describe(a.activityType, a.metadata),
  }));
}

/* ───────────── follows & public profiles ───────────── */

export async function setFollow(db: Db, userId: string, targetUserId: string, follow: boolean) {
  if (userId === targetUserId) throw badRequest('You can’t follow yourself.');
  if (follow) await requireVerified(db, userId);
  const [t] = await db.select({ id: profiles.userId, isPublic: profiles.isPublic }).from(profiles).where(eq(profiles.userId, targetUserId)).limit(1);
  if (!t || !t.isPublic) throw notFound('That profile isn’t available.');
  if (follow) {
    const r = await db.insert(follows).values({ followerId: userId, followedId: targetUserId }).onConflictDoNothing().returning({ f: follows.followerId });
    if (r.length) {
      const [me] = await db.select({ name: profiles.displayName, username: profiles.username }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
      await notify(db, targetUserId, 'social', `<strong>${escapeHtml(me?.name ?? 'Someone')}</strong> started following you.`, `/u/${me?.username}`);
    }
  } else {
    await db.delete(follows).where(and(eq(follows.followerId, userId), eq(follows.followedId, targetUserId)));
  }
}

export async function followCounts(db: DbOrTx, userId: string) {
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followedId, userId));
  const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followerId, userId));
  return { followers: a.n, following: b.n };
}

export interface PublicProfile {
  userId: string; username: string; name: string; bio: string; tone: number; level: number; xp: number;
  isMe: boolean; following: boolean; counts: { followers: number; following: number };
  badges: { code: string; name: string; icon: string; at: string }[];
  showcase: string[];
  credentials: { id: string; code: string; name: string; topic: string | null; txHash: string | null; verifiedAt: string | null }[];
  topics: { id: string; title: string; category: string }[] | null;
}

/** Private profiles are visible only to their owner — enforced here, not in the UI. */
export async function publicProfile(db: Db, viewerId: string, username: string): Promise<PublicProfile> {
  const [p] = await db.select().from(profiles).where(eq(sql`lower(${profiles.username})`, username.toLowerCase())).limit(1);
  const isMe = p?.userId === viewerId;
  if (!p || (!p.isPublic && !isMe)) throw notFound('This profile is private or doesn’t exist.');
  const xp = await totalXp(db, p.userId);
  const badges = await db.select({ code: achievements.code, name: achievements.name, icon: achievements.icon, at: userAchievements.unlockedAt })
    .from(userAchievements).innerJoin(achievements, eq(achievements.id, userAchievements.achievementId)).where(eq(userAchievements.userId, p.userId));
  const creds = await db.select({ c: credentials, code: achievements.code, name: achievements.name, topic: topics.title }).from(credentials)
    .innerJoin(achievements, eq(achievements.id, credentials.achievementId)).leftJoin(topics, eq(topics.id, credentials.topicId))
    .where(and(eq(credentials.userId, p.userId), eq(credentials.status, 'verified')));
  const [f] = await db.select({ x: follows.followerId }).from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followedId, p.userId))).limit(1);
  const showTopics = isMe || p.prefs.showTopics;
  const topicRows = showTopics
    ? await db.select({ id: topics.id, title: topics.title, category: topics.category }).from(topics).where(and(eq(topics.ownerId, p.userId), eq(topics.visibility, 'public'), sql`${topics.archivedAt} is null`))
    : null;
  return {
    userId: p.userId, username: p.username, name: p.displayName, bio: p.bio, tone: p.avatarTone, xp, level: Math.floor(xp / 200) + 1, isMe, following: !!f,
    counts: await followCounts(db, p.userId),
    badges: badges.map((b) => ({ ...b, at: b.at.toISOString() })), showcase: p.showcase,
    credentials: creds.map(({ c, code, name, topic }) => ({ id: c.id, code, name, topic: p.prefs.showTopics || isMe ? topic : null, txHash: c.transactionHash, verifiedAt: c.verifiedAt?.toISOString() ?? null })), topics: topicRows,
  };
}

/** Learners worth following: public profiles you don't already follow. */
export async function suggestedPeople(db: Db, userId: string, limit = 5) {
  const followed = (await db.select({ id: follows.followedId }).from(follows).where(eq(follows.followerId, userId))).map((f) => f.id);
  return db.select({ userId: profiles.userId, username: profiles.username, name: profiles.displayName, tone: profiles.avatarTone, bio: profiles.bio }).from(profiles)
    .where(and(eq(profiles.isPublic, true), ne(profiles.userId, userId), followed.length ? sql`${profiles.userId} not in (${sql.join(followed.map((i) => sql`${i}::uuid`), sql`, `)})` : undefined)).limit(limit);
}

/* ───────────── circles ───────────── */

export const circleInput = z.object({
  name: z.string().trim().min(2, 'Give the circle a name').max(60),
  goal: z.string().trim().max(160).optional(),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(['public', 'private']).default('public'),
});

const DAY = 864e5;

async function startChallenge(db: DbOrTx, creatorId: string, circleId: string | null, title: string, memberIds: string[]) {
  const [c] = await db.insert(challenges).values({
    creatorId, circleId, title, description: 'Study on seven days in a row.', rules: { metric: 'study_days', target: 7 },
    startsAt: new Date(), endsAt: new Date(Date.now() + 7 * DAY),
  }).returning();
  if (memberIds.length) await db.insert(challengeParticipants).values(memberIds.map((userId) => ({ challengeId: c.id, userId }))).onConflictDoNothing();
  return c;
}

export async function createCircle(db: Db, userId: string, input: z.infer<typeof circleInput>) {
  await requireVerified(db, userId);
  const [mine] = await db.select({ n: sql<number>`count(*)::int` }).from(studyCircles).where(eq(studyCircles.ownerId, userId));
  if (mine.n >= 10) throw badRequest('You can own up to 10 circles.', 'circle_limit');
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(studyCircles).values({ ownerId: userId, name: input.name, goal: input.goal ?? '', description: input.description ?? '', visibility: input.visibility }).returning();
    await tx.insert(studyCircleMembers).values({ circleId: c.id, userId, role: 'owner' });
    await startChallenge(tx, userId, c.id, `${c.name} · 7-day focus`, [userId]);
    return c;
  });
}

export async function setMembership(db: Db, userId: string, circleId: string, join: boolean) {
  const [c] = await db.select().from(studyCircles).where(eq(studyCircles.id, circleId)).limit(1);
  if (!c) throw notFound('Circle not found.');
  if (join) {
    await requireVerified(db, userId);
    if (c.visibility === 'private') throw forbidden('This circle is invite-only.');
    await db.insert(studyCircleMembers).values({ circleId, userId }).onConflictDoNothing();
    const live = await db.select({ id: challenges.id }).from(challenges).where(and(eq(challenges.circleId, circleId), eq(challenges.status, 'active')));
    for (const ch of live) await db.insert(challengeParticipants).values({ challengeId: ch.id, userId }).onConflictDoNothing();
  } else {
    if (c.ownerId === userId) throw conflict('Owners can’t leave their own circle.', 'owner_cannot_leave');
    await db.delete(studyCircleMembers).where(and(eq(studyCircleMembers.circleId, circleId), eq(studyCircleMembers.userId, userId)));
    const ids = (await db.select({ id: challenges.id }).from(challenges).where(eq(challenges.circleId, circleId))).map((x) => x.id);
    if (ids.length) await db.delete(challengeParticipants).where(and(inArray(challengeParticipants.challengeId, ids), eq(challengeParticipants.userId, userId), eq(challengeParticipants.status, 'joined')));
  }
}

/* ───────────── invites (the way into private circles) ───────────── */

/** Owner-only. Creates (or replaces) the secret code behind the circle's invite link — replacing it revokes old links. */
export async function rotateInvite(db: Db, userId: string, circleId: string) {
  const [c] = await db.select().from(studyCircles).where(eq(studyCircles.id, circleId)).limit(1);
  if (!c) throw notFound('Circle not found.');
  if (c.ownerId !== userId) throw forbidden('Only the circle’s owner can manage invite links.');
  const code = randomBytes(15).toString('base64url');
  await db.update(studyCircles).set({ inviteCode: code }).where(eq(studyCircles.id, circleId));
  return { code };
}

export async function previewInvite(db: Db, code: string) {
  const [c] = await db.select().from(studyCircles).where(eq(studyCircles.inviteCode, code)).limit(1);
  if (!c) throw notFound('This invite link is invalid or has been replaced.');
  const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(studyCircleMembers).where(eq(studyCircleMembers.circleId, c.id));
  return { name: c.name, goal: c.goal, members: m.n };
}

export async function acceptInvite(db: Db, userId: string, code: string) {
  await requireVerified(db, userId);
  const [c] = await db.select().from(studyCircles).where(eq(studyCircles.inviteCode, code)).limit(1);
  if (!c) throw notFound('This invite link is invalid or has been replaced.');
  await db.insert(studyCircleMembers).values({ circleId: c.id, userId }).onConflictDoNothing();
  const live = await db.select({ id: challenges.id }).from(challenges).where(and(eq(challenges.circleId, c.id), eq(challenges.status, 'active')));
  for (const ch of live) await db.insert(challengeParticipants).values({ challengeId: ch.id, userId }).onConflictDoNothing();
  return { id: c.id, name: c.name };
}

export interface CircleView {
  id: string; name: string; goal: string; members: number; joined: boolean; owner: boolean; progress: number; tones: number[]; challengeId: string | null;
}

export async function listCircles(db: Db, userId: string): Promise<CircleView[]> {
  const mine = (await db.select({ id: studyCircleMembers.circleId }).from(studyCircleMembers).where(eq(studyCircleMembers.userId, userId))).map((m) => m.id);
  const rows = await db.select().from(studyCircles)
    .where(or(eq(studyCircles.visibility, 'public'), mine.length ? inArray(studyCircles.id, mine) : sql`false`)).orderBy(desc(studyCircles.createdAt)).limit(40);
  const out: CircleView[] = [];
  for (const c of rows) {
    const mem = await db.select({ tone: profiles.avatarTone }).from(studyCircleMembers).innerJoin(profiles, eq(profiles.userId, studyCircleMembers.userId)).where(eq(studyCircleMembers.circleId, c.id)).limit(50);
    const [ch] = await db.select().from(challenges).where(and(eq(challenges.circleId, c.id), eq(challenges.status, 'active'))).orderBy(desc(challenges.startsAt)).limit(1);
    let progress = 0;
    if (ch) {
      const parts = await db.select({ p: challengeParticipants.progress }).from(challengeParticipants).where(eq(challengeParticipants.challengeId, ch.id));
      progress = parts.length ? Math.round((parts.reduce((n, x) => n + Math.min(x.p, ch.rules.target), 0) / (parts.length * ch.rules.target)) * 100) : 0;
    }
    out.push({ id: c.id, name: c.name, goal: c.goal || 'Study together', members: mem.length, joined: mine.includes(c.id), owner: c.ownerId === userId, progress, tones: mem.slice(0, 4).map((m) => m.tone), challengeId: ch?.id ?? null });
  }
  return out;
}

export async function circleDetail(db: Db, userId: string, circleId: string) {
  const [c] = await db.select().from(studyCircles).where(eq(studyCircles.id, circleId)).limit(1);
  if (!c) throw notFound('Circle not found.');
  const member = await isMember(db, userId, circleId);
  if (c.visibility === 'private' && !member) throw notFound('Circle not found.');
  const rows = await db.select({ m: studyCircleMembers, p: profiles }).from(studyCircleMembers)
    .innerJoin(profiles, eq(profiles.userId, studyCircleMembers.userId)).where(eq(studyCircleMembers.circleId, circleId)).orderBy(studyCircleMembers.joinedAt);
  return {
    id: c.id, name: c.name, goal: c.goal, description: c.description, joined: member, owner: c.ownerId === userId,
    visibility: c.visibility, inviteCode: c.ownerId === userId ? c.inviteCode : null,
    members: rows.map(({ m, p }) => ({ name: p.displayName, tone: p.avatarTone, role: m.role, me: m.userId === userId, username: p.isPublic ? p.username : null, since: m.joinedAt.toISOString() })),
  };
}

/* ───────────── challenges ───────────── */

export const challengeInput = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  metric: z.enum(['study_days', 'reviews']).default('study_days'),
  target: z.number().int().min(1).max(500),
  days: z.number().int().min(1).max(60).default(7),
  circleId: z.string().uuid().optional(),
});

export async function createChallenge(db: Db, userId: string, input: z.infer<typeof challengeInput>) {
  await requireVerified(db, userId);
  if (input.circleId) {
    const [m] = await db.select().from(studyCircleMembers).where(and(eq(studyCircleMembers.circleId, input.circleId), eq(studyCircleMembers.userId, userId))).limit(1);
    if (!m) throw forbidden('Join the circle first.');
  }
  const [c] = await db.insert(challenges).values({
    creatorId: userId, circleId: input.circleId ?? null, title: input.title, description: input.description ?? '',
    rules: { metric: input.metric, target: input.target }, startsAt: new Date(), endsAt: new Date(Date.now() + input.days * DAY),
  }).returning();
  await db.insert(challengeParticipants).values({ challengeId: c.id, userId });
  return c;
}

export async function joinChallenge(db: Db, userId: string, challengeId: string, join: boolean) {
  const [c] = await db.select().from(challenges).where(eq(challenges.id, challengeId)).limit(1);
  if (!c || c.status !== 'active' || c.endsAt < new Date()) throw notFound('That challenge has ended.');
  if (join) await requireVerified(db, userId);
  if (join) await db.insert(challengeParticipants).values({ challengeId, userId }).onConflictDoNothing();
  else await db.delete(challengeParticipants).where(and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.userId, userId), eq(challengeParticipants.status, 'joined')));
}

export interface ChallengeView {
  id: string; title: string; description: string; metric: string; target: number; endsAt: string; participants: number;
  joined: boolean; progress: number; completed: boolean; circleName: string | null;
}

export async function listChallenges(db: Db, userId: string): Promise<ChallengeView[]> {
  const rows = await db.select({ c: challenges, circle: studyCircles.name }).from(challenges).leftJoin(studyCircles, eq(studyCircles.id, challenges.circleId))
    .where(and(eq(challenges.status, 'active'), sql`${challenges.endsAt} > now()`)).orderBy(desc(challenges.startsAt)).limit(30);
  const out: ChallengeView[] = [];
  for (const { c, circle } of rows) {
    const parts = await db.select().from(challengeParticipants).where(eq(challengeParticipants.challengeId, c.id));
    const me = parts.find((p) => p.userId === userId);
    // Private-circle challenges are only listed for members.
    if (c.circleId && !me && !(await isMember(db, userId, c.circleId))) continue;
    out.push({
      id: c.id, title: c.title, description: c.description, metric: c.rules.metric, target: c.rules.target, endsAt: c.endsAt.toISOString(),
      participants: parts.length, joined: !!me, progress: me?.progress ?? 0, completed: me?.status === 'completed', circleName: circle,
    });
  }
  return out;
}

async function isMember(db: DbOrTx, userId: string, circleId: string) {
  const [m] = await db.select().from(studyCircleMembers).where(and(eq(studyCircleMembers.circleId, circleId), eq(studyCircleMembers.userId, userId))).limit(1);
  return !!m;
}

void users;
