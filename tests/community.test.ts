import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb, type Db } from '../src/server/db';
import { achievements, passwordResets, userAchievements, users, xpLedger } from '../src/server/db/schema';
import { challengeInput, circleInput, createChallenge, createCircle, feed, joinChallenge, listChallenges, listCircles, publicProfile, setFollow, setMembership, circleDetail } from '../src/server/services/community';
import { exportAccount } from '../src/server/services/export';
import { createGoal, listGoals } from '../src/server/services/goals';
import { markAllRead, clearRead } from '../src/server/services/notifications';
import { requestReset, resetPassword } from '../src/server/services/password';
import { buildSnapshot } from '../src/server/services/snapshot';
import { completeSession, rateCard, startSession, submitResponse } from '../src/server/services/study';
import { addCard, createTopic, deleteTopic } from '../src/server/services/topics';
import { deleteAccount, registerUser, updateProfile } from '../src/server/services/users';
import { totalXp } from '../src/server/services/xp';
import '../src/server/services/register';

let db: Db;
let A: string, B: string, C: string, topicId: string;

const rejects = async (p: Promise<unknown>, code: string) => {
  try { await p; } catch (e) { expect((e as { code?: string }).code).toBe(code); return; }
  throw new Error(`expected rejection with ${code}`);
};

const study = async (user: string, topic: string, n = 3) => {
  const r = await startSession(db, user, topic, { mode: 'all', limit: 20 });
  if (r.empty) throw new Error('empty deck');
  for (const c of r.cards.slice(0, n)) {
    await submitResponse(db, user, r.session, { flashcardId: c.id, answer: 'my attempt' });
    await rateCard(db, user, r.session, { flashcardId: c.id, rating: 'good' });
  }
  return completeSession(db, user, r.session);
};

beforeAll(async () => {
  db = await getDb();
  A = (await registerUser(db, { name: 'Ann Alpha', email: 'ann@example.com', password: 'correct horse battery', timezone: 'Pacific/Auckland' })).id;
  B = (await registerUser(db, { name: 'Ben Beta', email: 'ben@example.com', password: 'correct horse battery' })).id;
  C = (await registerUser(db, { name: 'Cal Gamma', email: 'cal@example.com', password: 'correct horse battery' })).id;
  topicId = (await createTopic(db, A, { title: 'Topology' })).id;
  for (let i = 1; i <= 4; i++) await addCard(db, A, topicId, { question: `Q${i}?`, referenceAnswer: `A${i}`, concept: 'Basics' });
});

describe('privacy is enforced on the server', () => {
  it('a private profile is invisible to everyone but its owner', async () => {
    await rejects(publicProfile(db, B, 'annalpha'), 'not_found');
    expect((await publicProfile(db, A, 'annalpha')).isMe).toBe(true);
    await rejects(setFollow(db, B, A, true), 'not_found'); // can't follow a private profile
  });

  it('going public exposes badges only; topics stay hidden unless opted in', async () => {
    await updateProfile(db, A, { prefs: { publicProfile: true } });
    const p = await publicProfile(db, B, 'annalpha');
    expect(p.topics).toBeNull();
    expect(JSON.stringify(p)).not.toMatch(/ann@example\.com|Q1\?|correct horse/);
    await updateProfile(db, A, { prefs: { showTopics: true } });
    expect((await publicProfile(db, B, 'annalpha')).topics).toEqual([]); // only topics marked public are listed
  });

  it('follow, unfollow, no self-follow, and the feed only shows shared activity', async () => {
    await setFollow(db, B, A, true);
    await setFollow(db, B, A, true); // idempotent
    await rejects(setFollow(db, A, A, true), 'bad_request');
    expect((await publicProfile(db, B, 'annalpha')).following).toBe(true);
    // Ann earns First Steps; she hasn't opted in to sharing, so Ben can't see it
    await study(A, topicId);
    expect((await feed(db, B)).filter((i) => !i.mine)).toHaveLength(0);
    await updateProfile(db, A, { prefs: { shareFeed: true } });
    await study(A, topicId); // new activity is now shareable
    const items = (await feed(db, B)).filter((i) => !i.mine);
    expect(items.every((i) => !/ann@|A1|my attempt/.test(JSON.stringify(i)))).toBe(true);
    await setFollow(db, B, A, false);
    expect((await feed(db, B)).filter((i) => !i.mine)).toHaveLength(0);
  });
});

describe('circles and challenges', () => {
  let circleId: string;

  it('creates a circle with a starter challenge, and others can join and leave', async () => {
    await expect(circleInput.parseAsync({ name: 'x' })).rejects.toBeTruthy();
    const c = await createCircle(db, A, { name: 'Night Owls', goal: 'Study daily', visibility: 'public' });
    circleId = c.id;
    expect((await listCircles(db, B)).find((x) => x.id === circleId)?.joined).toBe(false);
    await setMembership(db, B, circleId, true);
    const mine = (await listCircles(db, B)).find((x) => x.id === circleId)!;
    expect(mine.joined).toBe(true);
    expect(mine.members).toBe(2);
    expect(mine.challengeId).toBeTruthy();
    await rejects(setMembership(db, A, circleId, false), 'owner_cannot_leave');
    const d = await circleDetail(db, B, circleId);
    expect(d.members.map((m) => m.name).sort()).toEqual(['Ann Alpha', 'Ben Beta']);
    await setMembership(db, B, circleId, false);
    expect((await listCircles(db, B)).find((x) => x.id === circleId)?.joined).toBe(false);
  });

  it('private circles are invite-only and hidden from non-members', async () => {
    const p = await createCircle(db, A, { name: 'Secret Society', visibility: 'private' });
    await rejects(setMembership(db, B, p.id, true), 'forbidden');
    expect((await listCircles(db, B)).some((x) => x.id === p.id)).toBe(false);
    await rejects(circleDetail(db, B, p.id), 'not_found');
  });

  it('completing a challenge pays 50 XP once and unlocks Challenge Finisher', async () => {
    const ch = await createChallenge(db, C, { title: 'Two days of recall', metric: 'reviews', target: 3, days: 7 });
    await joinChallenge(db, C, ch.id, true);
    const ct = (await createTopic(db, C, { title: 'Chess' })).id;
    for (let i = 1; i <= 3; i++) await addCard(db, C, ct, { question: `C${i}?`, referenceAnswer: `Move ${i}`, concept: 'Openings' });
    const before = await totalXp(db, C);
    await study(C, ct);
    const got = await db.select({ code: achievements.code }).from(userAchievements).innerJoin(achievements, eq(achievements.id, userAchievements.achievementId)).where(eq(userAchievements.userId, C));
    expect(got.map((g) => g.code)).toContain('challenge-finisher');
    const rows = await db.select().from(xpLedger).where(eq(xpLedger.userId, C));
    expect(rows.filter((x) => x.eventType === 'challenge')).toHaveLength(1);
    expect(await totalXp(db, C)).toBe(before + 3 * 5 + 10 + 50);
    await study(C, ct); // more studying never pays the challenge twice
    expect((await db.select().from(xpLedger).where(eq(xpLedger.userId, C))).filter((x) => x.eventType === 'challenge')).toHaveLength(1);
    expect((await listChallenges(db, C)).find((x) => x.id === ch.id)?.completed).toBe(true);
    await expect(challengeInput.parseAsync({ title: 'ok', target: 0 })).rejects.toBeTruthy();
  });
});

describe('goals, streaks and timezones', () => {
  it('tracks a weekly goal from stored sessions and pays once per week', async () => {
    const g = await createGoal(db, B, 'UTC', { goalType: 'reviews', targetValue: 3, period: 'weekly' });
    const bt = (await createTopic(db, B, { title: 'Biology' })).id;
    for (let i = 1; i <= 3; i++) await addCard(db, B, bt, { question: `B${i}?`, referenceAnswer: `Cell ${i}`, concept: 'Cells' });
    expect((await listGoals(db, B, 'UTC'))[0].progress).toBe(0);
    await study(B, bt);
    const [goal] = await listGoals(db, B, 'UTC');
    expect(goal.id).toBe(g.id);
    expect(goal.progress).toBe(3);
    expect(goal.done).toBe(true);
    await study(B, bt);
    expect((await db.select().from(xpLedger).where(eq(xpLedger.userId, B))).filter((x) => x.eventType === 'weekly_goal')).toHaveLength(1);
  });

  it('daily boundaries follow the learner\'s timezone', async () => {
    const snap = await buildSnapshot(db, A, new Date());
    expect(snap.user.timezone).toBe('Pacific/Auckland');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
    expect(snap.activity[today]).toBeGreaterThan(0);
    expect(snap.stats.reviewsToday).toBeGreaterThan(0);
    expect(snap.user.streak).toBeGreaterThanOrEqual(1);
  });

  it('First Steps is unlocked from stored sessions, exactly once', async () => {
    const rows = await db.select({ code: achievements.code }).from(userAchievements).innerJoin(achievements, eq(achievements.id, userAchievements.achievementId)).where(eq(userAchievements.userId, A));
    expect(rows.filter((r) => r.code === 'first-steps')).toHaveLength(1);
  });
});

describe('notifications', () => {
  it('can be marked read and cleared', async () => {
    expect((await buildSnapshot(db, A)).notifications.some((n) => n.unread)).toBe(true);
    await markAllRead(db, A);
    expect((await buildSnapshot(db, A)).notifications.every((n) => !n.unread)).toBe(true);
    await clearRead(db, A);
    expect((await buildSnapshot(db, A)).notifications).toHaveLength(0);
  });
});

describe('password reset', () => {
  it('uses a single-use token and never reveals whether an account exists', async () => {
    const unknown = await requestReset(db, '1.1.1.1', { email: 'nobody@example.com' });
    expect(unknown.devLink).toBeUndefined();
    const { devLink } = await requestReset(db, '1.1.1.2', { email: 'ben@example.com' });
    const token = new URL(devLink!).searchParams.get('token')!;
    const stored = (await db.select().from(passwordResets))[0];
    expect(stored.tokenHash).not.toContain(token); // only a hash is stored
    await resetPassword(db, '1.1.1.2', { token, password: 'a brand new passphrase' });
    await rejects(resetPassword(db, '1.1.1.2', { token, password: 'another passphrase 2' }), 'bad_token');
    await rejects(resetPassword(db, '1.1.1.2', { token: 'x'.repeat(40), password: 'whatever long enough' }), 'bad_token');
  });

  it('expired links are rejected', async () => {
    const { devLink } = await requestReset(db, '1.1.1.3', { email: 'cal@example.com' });
    const token = new URL(devLink!).searchParams.get('token')!;
    await db.execute(sql`update password_resets set expires_at = now() - interval '1 minute'`);
    await rejects(resetPassword(db, '1.1.1.3', { token, password: 'a brand new passphrase' }), 'bad_token');
  });
});

describe('data ownership', () => {
  it('exports everything except password hashes and storage keys', async () => {
    const data = await exportAccount(db, A);
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/password_hash|passwordHash|\$2[aby]\$|storageKey|storage_key/);
    expect(data.flashcards.length).toBe(4);
    expect(data.flashcardResponses.length).toBeGreaterThan(0);
  });

  it('deleting a topic or account cascades through everything owned', async () => {
    await deleteTopic(db, A, topicId);
    expect((await buildSnapshot(db, A)).topics).toHaveLength(0);
    await deleteAccount(db, B);
    expect((await db.select().from(users).where(eq(users.id, B))).length).toBe(0);
    for (const t of ['profiles', 'topics', 'study_sessions', 'flashcard_responses', 'xp_ledger', 'notifications', 'learning_goals', 'user_achievements']) {
      const col = t === 'profiles' ? 'user_id' : t === 'topics' ? 'owner_id' : 'user_id';
      const res = await db.execute(sql.raw(`select count(*)::int n from ${t} where ${col} = '${B}'`));
      expect((res.rows[0] as { n: number }).n).toBe(0);
    }
  });
});
