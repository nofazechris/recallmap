import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { __setProviderForTests, type AiProvider } from '../src/server/ai/provider';
import { getDb, type Db } from '../src/server/db';
import { flashcards, notifications, resourceChunks, resources, reviewSchedules, studyCircles, users } from '../src/server/db/schema';
import { __setMailerForTests, type Mail } from '../src/server/lib/email';
import { acceptInvite, createCircle, previewInvite, rotateInvite } from '../src/server/services/community';
import { regenerateCard } from '../src/server/services/regenerate';
import { sendDueReminders } from '../src/server/services/reminders';
import { completeSession, rateCard, startSession, submitResponse } from '../src/server/services/study';
import { addCard, createTopic } from '../src/server/services/topics';
import { updateProfile, registerUser } from '../src/server/services/users';
import { confirmEmail, requireVerified, sendVerification } from '../src/server/services/verification';
import '../src/server/services/register';

let db: Db;
const rejects = async (p: Promise<unknown>, code: string) => {
  try { await p; } catch (e) { expect((e as { code?: string }).code).toBe(code); return; }
  throw new Error(`expected rejection with ${code}`);
};
const reg = async (name: string, email: string, tz = 'UTC') => (await registerUser(db, { name, email, password: 'correct horse battery', timezone: tz })).id;
const tokenFrom = (m: Mail) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

beforeAll(async () => { db = await getDb(); });
afterAll(() => { __setMailerForTests(null); __setProviderForTests(null); });

describe('email verification', () => {
  const outbox: Mail[] = [];
  beforeAll(() => __setMailerForTests(async (m) => { outbox.push(m); }));
  afterAll(() => __setMailerForTests(null));

  it('emails a one-time link and unlocks community features once confirmed', async () => {
    const id = await reg('Vera Verify', 'vera@example.com');
    await rejects(requireVerified(db, id), 'forbidden');
    await rejects(createCircle(db, id, { name: 'Early Birds', visibility: 'public' }), 'forbidden');
    await updateProfile(db, id, { displayName: 'Vera' }); // ordinary profile edits are never blocked
    await rejects(updateProfile(db, id, { prefs: { publicProfile: true } }), 'forbidden');

    expect((await sendVerification(db, id)).sent).toBe(true);
    const mail = outbox.at(-1)!;
    expect(mail.to).toBe('vera@example.com');
    const token = tokenFrom(mail);
    const [row] = (await db.execute(sql`select token_hash from email_verifications where user_id = ${id}`)).rows as { token_hash: string }[];
    expect(row.token_hash).not.toContain(token); // only a hash is stored

    await confirmEmail(db, { token });
    await requireVerified(db, id); // no longer throws
    await createCircle(db, id, { name: 'Early Birds', visibility: 'public' });
    await rejects(confirmEmail(db, { token }), 'bad_token'); // single use
  });

  it('expired links are rejected, and already-verified users are not emailed again', async () => {
    const id = await reg('Eli Expired', 'eli@example.com');
    await sendVerification(db, id);
    const token = tokenFrom(outbox.at(-1)!);
    await db.execute(sql`update email_verifications set expires_at = now() - interval '1 minute' where user_id = ${id}`);
    await rejects(confirmEmail(db, { token }), 'bad_token');
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, id));
    const before = outbox.length;
    expect((await sendVerification(db, id)).sent).toBe(false);
    expect(outbox.length).toBe(before);
  });
});

describe('daily reminders', () => {
  const study = async (user: string, topic: string) => {
    const r = await startSession(db, user, topic, { mode: 'all', limit: 20 });
    if (r.empty) throw new Error('deck');
    for (const c of r.cards.slice(0, 3)) { await submitResponse(db, user, r.session, { flashcardId: c.id, answer: 'x' }); await rateCard(db, user, r.session, { flashcardId: c.id, rating: 'good' }); }
    await completeSession(db, user, r.session);
  };
  const setup = async (name: string, email: string, tz: string) => {
    const id = await reg(name, email, tz);
    await db.execute(sql`update profiles set onboarded = true where user_id = ${id}`);
    const t = (await createTopic(db, id, { title: `${name} topic` })).id;
    for (let i = 1; i <= 4; i++) await addCard(db, id, t, { question: `Q${i}?`, referenceAnswer: `A${i}`, concept: 'Basics' });
    return { id, t };
  };
  const now = new Date(); now.setUTCHours(9, 10, 0, 0); // 9am in UTC, today (records are stamped with the real clock)

  it('nudges at 9am local time, once a day, only when cards are due', async () => {
    const utc = await setup('Una Utc', 'una@example.com', 'UTC');
    const tokyo = await setup('Tomo Tokyo', 'tomo@example.com', 'Asia/Tokyo'); // 18:10 there -> not 9am
    expect(await sendDueReminders(db, now)).toBe(1);
    const mine = await db.select().from(notifications).where(eq(notifications.userId, utc.id));
    expect(mine.some((n) => n.type === 'due' && n.href === `/study/${utc.t}`)).toBe(true);
    expect((await db.select().from(notifications).where(eq(notifications.userId, tokyo.id))).some((n) => n.type === 'due')).toBe(false);
    expect(await sendDueReminders(db, now)).toBe(0); // already reminded today
  });

  it('respects the setting, skips people with nothing due, and skips anyone who already studied today', async () => {
    const off = await setup('Opal Off', 'opal@example.com', 'UTC');
    await updateProfile(db, off.id, { prefs: { remindDaily: false } });
    const empty = await reg('Ezra Empty', 'ezra@example.com');
    await db.execute(sql`update profiles set onboarded = true where user_id = ${empty}`);
    const busy = await setup('Bo Busy', 'bo@example.com', 'UTC');
    await study(busy.id, busy.t);
    const later = new Date(Date.now()); // "today" for the study above
    later.setUTCHours(9, 20, 0, 0);
    // run at 09:20 UTC today: Opal opted out, Ezra has no cards, Bo already studied today
    const n = await sendDueReminders(db, later);
    expect(n).toBe(0);
  });
});

describe('private circle invites', () => {
  it('only the owner can create a link; the link previews, joins, and can be revoked by replacing it', async () => {
    const owner = await reg('Olive Owner', 'olive@example.com');
    const guest = await reg('Gus Guest', 'gus@example.com');
    const circle = await createCircle(db, owner, { name: 'Secret Society', visibility: 'private' });
    await rejects(rotateInvite(db, guest, circle.id), 'forbidden');

    const { code } = await rotateInvite(db, owner, circle.id);
    expect(code.length).toBeGreaterThan(15);
    expect(await previewInvite(db, code)).toMatchObject({ name: 'Secret Society', members: 1 });
    await rejects(previewInvite(db, 'not-a-real-code'), 'not_found');

    await acceptInvite(db, guest, code);
    await acceptInvite(db, guest, code); // idempotent
    const [{ n }] = (await db.execute(sql`select count(*)::int n from study_circle_members where circle_id = ${circle.id}`)).rows as { n: number }[];
    expect(n).toBe(2);

    const { code: next } = await rotateInvite(db, owner, circle.id);
    expect(next).not.toBe(code);
    await rejects(acceptInvite(db, await reg('Late Larry', 'larry@example.com'), code), 'not_found');
    await db.delete(studyCircles).where(eq(studyCircles.id, circle.id));
  });
});

describe('regenerating a single AI card', () => {
  let owner: string, topic: string, resourceId: string, chunkId: string;
  const passage = 'Photosynthesis happens in the chloroplasts. The Calvin cycle fixes carbon dioxide into glucose in the stroma using ATP and NADPH.';
  let verifierSupports = true;
  const provider: AiProvider = {
    name: 'test-double', model: 'test-1',
    async generateJson(req) {
      if (req.schemaName === 'kit_verification') {
        const items = JSON.parse(req.user.split('Check these items:\n')[1]) as { id: string }[];
        return { usage: { tokensIn: 1, tokensOut: 1 }, data: { results: items.map((i) => ({ id: i.id, answerable: true, supported: verifierSupports, selectedIndex: null, trueFalse: null, note: '' })) } } as never;
      }
      return { usage: { tokensIn: 1, tokensOut: 1 }, data: { flashcard: { concept: 'Calvin cycle', question: 'Where does the Calvin cycle take place?', answer: 'In the stroma', explanation: 'It fixes carbon dioxide.', difficulty: 'easy', source: 'c1', evidence: 'fixes carbon dioxide into glucose in the stroma' } } } as never;
    },
  };
  const aiCard = async (extra: Partial<typeof flashcards.$inferInsert> = {}) => (await db.insert(flashcards).values({
    topicId: topic, sourceResourceId: resourceId, question: 'What is photosynthesis?', referenceAnswer: 'Making glucose from light', createdBy: 'ai', status: 'draft',
    sourceMetadata: { chunkId, resourceId, page: null }, ...extra,
  }).returning())[0];

  beforeAll(async () => {
    owner = await reg('Rex Regen', 'rex@example.com');
    topic = (await createTopic(db, owner, { title: 'Plants' })).id;
    [{ id: resourceId }] = await db.insert(resources).values({ topicId: topic, ownerId: owner, originalFilename: 'p.txt', mimeType: 'text/plain', fileSize: 10, storageKey: `users/${owner}/p.txt`, processingStatus: 'ready' }).returning({ id: resources.id });
    [{ id: chunkId }] = await db.insert(resourceChunks).values({ resourceId, chunkIndex: 0, content: passage, contentHash: 'h1' }).returning({ id: resourceChunks.id });
    __setProviderForTests(provider);
  });

  it('replaces the card with a verified one from the same passage', async () => {
    const c = await aiCard();
    const out = await regenerateCard(db, owner, c.id);
    expect(out.question).toBe('Where does the Calvin cycle take place?');
    const [row] = await db.select().from(flashcards).where(eq(flashcards.id, c.id));
    expect(row.referenceAnswer).toBe('In the stroma');
    expect(row.userEdited).toBe(false);
  });

  it('clears review history for a replaced approved card', async () => {
    const c = await aiCard({ status: 'approved' });
    await db.insert(reviewSchedules).values({ userId: owner, flashcardId: c.id, dueAt: new Date(), reviewCount: 3 });
    await regenerateCard(db, owner, c.id);
    expect((await db.select().from(reviewSchedules).where(eq(reviewSchedules.flashcardId, c.id))).length).toBe(0);
  });

  it('never overwrites cards you wrote or edited', async () => {
    const mine = (await addCard(db, owner, topic, { question: 'Mine?', referenceAnswer: 'Yes', concept: 'x' }));
    await rejects(regenerateCard(db, owner, mine.id), 'not_ai_card');
    const edited = await aiCard({ userEdited: true });
    await rejects(regenerateCard(db, owner, edited.id), 'user_edited');
  });

  it('refuses a replacement the independent checker cannot confirm, leaving the card unchanged', async () => {
    verifierSupports = false;
    const c = await aiCard();
    await rejects(regenerateCard(db, owner, c.id), 'regen_unverified');
    verifierSupports = true;
    const [row] = await db.select().from(flashcards).where(eq(flashcards.id, c.id));
    expect(row.question).toBe('What is photosynthesis?');
  });

  it("another user can't regenerate your card", async () => {
    const c = await aiCard();
    await rejects(regenerateCard(db, await reg('Mal Intruder', 'mal@example.com'), c.id), 'not_found');
  });
});
