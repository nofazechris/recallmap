import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '../db';
import { notifications, profiles, users, type Prefs } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { safeTz } from '../lib/days';
import { requireVerified } from './verification';

export const DEFAULT_PREFS: Prefs = {
  publicProfile: false, showTopics: false, shareFeed: false, reduceMotion: false,
  remindDaily: true, notifyBadges: true, notifyCommunity: true, typeAnswers: true,
};

export const registerInput = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  timezone: z.string().max(64).optional(),
});

const slugUser = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'learner';

async function freeUsername(db: DbOrTx, base: string) {
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
    const [hit] = await db.select({ u: profiles.username }).from(profiles).where(eq(sql`lower(${profiles.username})`, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${base}${Date.now().toString(36)}`;
}

export async function registerUser(db: Db, raw: z.infer<typeof registerInput>) {
  const input = { ...raw, email: raw.email.trim().toLowerCase() };
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, input.email)).limit(1);
  if (exists) throw conflict('An account with this email already exists. Try signing in instead.', 'email_taken');
  const passwordHash = await bcrypt.hash(input.password, 12);

  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email: input.email, passwordHash }).returning({ id: users.id });
    await tx.insert(profiles).values({
      userId: u.id,
      username: await freeUsername(tx, slugUser(input.name)),
      displayName: input.name,
      avatarTone: Math.floor(Math.random() * 6),
      timezone: safeTz(input.timezone),
      prefs: DEFAULT_PREFS,
    });
    await tx.insert(notifications).values({
      userId: u.id, type: 'xp', href: '/onboarding',
      html: `Welcome to RecallMap, <strong>${escapeHtml(input.name.split(' ')[0])}</strong>. Create your first topic to begin.`,
    });
    return { id: u.id };
  });
}

export const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const profilePatch = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, 'Use 3–20 letters, numbers or underscores').optional(),
  bio: z.string().trim().max(280).optional(),
  avatarTone: z.number().int().min(0).max(5).optional(),
  timezone: z.string().max(64).optional(),
  dailyGoal: z.number().int().min(1).max(500).optional(),
  onboarded: z.boolean().optional(),
  showcase: z.array(z.string().max(40)).max(3).optional(),
  prefs: z.object({
    publicProfile: z.boolean(), showTopics: z.boolean(), shareFeed: z.boolean(), reduceMotion: z.boolean(),
    remindDaily: z.boolean(), notifyBadges: z.boolean(), notifyCommunity: z.boolean(), typeAnswers: z.boolean(),
  }).partial().optional(),
});

export async function updateProfile(db: Db, userId: string, patch: z.infer<typeof profilePatch>) {
  const [cur] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!cur) throw notFound('Profile not found.');
  if (patch.prefs?.publicProfile === true && !cur.isPublic) await requireVerified(db, userId);
  if (patch.username && patch.username.toLowerCase() !== cur.username.toLowerCase()) {
    const [taken] = await db.select({ u: profiles.userId }).from(profiles).where(eq(sql`lower(${profiles.username})`, patch.username)).limit(1);
    if (taken) throw conflict('That username is taken.', 'username_taken');
  }
  const { prefs, timezone, ...rest } = patch;
  await db.update(profiles).set({
    ...rest,
    ...(timezone ? { timezone: safeTz(timezone) } : {}),
    ...(prefs ? { prefs: { ...cur.prefs, ...prefs } } : {}),
    isPublic: prefs?.publicProfile ?? cur.isPublic,
    updatedAt: new Date(),
  }).where(eq(profiles.userId, userId));
}

/** Account deletion: every owned row cascades from `users`. Uploaded files are removed by the caller. */
export async function deleteAccount(db: Db, userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}
