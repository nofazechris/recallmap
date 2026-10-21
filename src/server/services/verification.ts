import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '../db';
import { emailVerifications, users } from '../db/schema';
import { appUrl, emailConfigured, sendEmail } from '../lib/email';
import { verifyEmail } from '../lib/email-templates';
import { badRequest, forbidden } from '../lib/errors';
import { log } from '../lib/log';
import { rateLimit } from '../lib/rate-limit';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const TTL_MS = 24 * 3600_000;

export const confirmInput = z.object({ token: z.string().min(20).max(200) });

/** Email verification only applies once a real email provider is configured — otherwise nobody could ever verify. */
export const verificationRequired = () => emailConfigured();

/** Creates a one-time link and emails it. Safe to call again (older links keep working until they expire). */
export async function sendVerification(db: Db, userId: string): Promise<{ sent: boolean }> {
  if (!emailConfigured()) return { sent: false };
  await rateLimit(db, `verify-send:${userId}`, 5, 3600);
  const [u] = await db.select({ email: users.email, verified: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.verified) return { sent: false };
  const token = randomBytes(32).toString('base64url');
  await db.insert(emailVerifications).values({ userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + TTL_MS) });
  try {
    const { firstNameOf } = await import('./users'); // users.ts imports this module, so load it lazily
    await sendEmail({ to: u.email, ...verifyEmail({ link: `${appUrl()}/auth/verify?token=${token}`, name: await firstNameOf(db, userId) }) });
  } catch (e) {
    log.error('verification_email_failed', { message: e instanceof Error ? e.message : String(e) });
    throw badRequest('We couldn’t send the email just now. Please try again in a minute.', 'email_failed');
  }
  return { sent: true };
}

export async function confirmEmail(db: Db, input: z.infer<typeof confirmInput>) {
  const hash = sha(input.token);
  await db.transaction(async (tx) => {
    const [r] = await tx.update(emailVerifications).set({ usedAt: new Date() })
      .where(and(eq(emailVerifications.tokenHash, hash), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, new Date()))).returning({ userId: emailVerifications.userId });
    if (!r) throw badRequest('This confirmation link is invalid or has expired. Sign in and request a new one.', 'bad_token');
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, r.userId));
  });
}

export const isVerified = async (db: DbOrTx, userId: string) => {
  const [u] = await db.select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return !!u?.v;
};

/** Guard for actions that touch other people (community, public profile, credentials). No-op until email is configured. */
export async function requireVerified(db: DbOrTx, userId: string) {
  if (!verificationRequired()) return;
  if (!(await isVerified(db, userId))) throw forbidden('Please confirm your email address first — check your inbox, or resend the link from the banner at the top of the app.');
}
