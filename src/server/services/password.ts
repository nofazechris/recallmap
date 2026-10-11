import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../config';
import type { Db } from '../db';
import { passwordResets, users } from '../db/schema';
import { HttpError, badRequest } from '../lib/errors';
import { appUrl, emailConfigured, sendEmail } from '../lib/email';
import { log } from '../lib/log';
import { rateLimit } from '../lib/rate-limit';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const TTL_MS = 60 * 60_000;

export const forgotInput = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const resetInput = z.object({ token: z.string().min(20).max(200), password: z.string().min(8, 'Use at least 8 characters').max(200) });

/**
 * Always answers the same way whether or not the address has an account (no account enumeration).
 * Emails a one-time link when an email provider is configured; in development without one, returns the link
 * so the flow can be exercised locally. In production without email it refuses rather than pretending.
 */
export async function requestReset(db: Db, ip: string, input: z.infer<typeof forgotInput>): Promise<{ devLink?: string }> {
  await rateLimit(db, `forgot:ip:${ip}`, 10, 3600);
  await rateLimit(db, `forgot:${input.email}`, 3, 3600);
  const prod = env().NODE_ENV === 'production';
  if (prod && !emailConfigured()) throw new HttpError(503, 'email_not_configured', 'Password reset email isn’t set up on this server yet. Contact support.');

  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(sql`lower(${users.email})`, input.email)).limit(1);
  if (!u) return {};
  const token = randomBytes(32).toString('base64url');
  await db.insert(passwordResets).values({ userId: u.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + TTL_MS) });
  const link = `${appUrl()}/auth/reset?token=${token}`;

  if (emailConfigured()) {
    try { await sendEmail({ to: u.email, subject: 'Reset your RecallMap password', text: `Use this link within an hour to choose a new password:\n\n${link}\n\nIf you didn’t ask for this, you can ignore this email.` }); }
    catch (e) { log.error('reset_email_failed', { message: e instanceof Error ? e.message : String(e) }); throw new HttpError(502, 'email_failed', 'We couldn’t send the email. Please try again shortly.'); }
    return {};
  }
  log.warn('password_reset_link_dev_only', { note: 'No email provider configured; link returned to the caller in development only.' });
  return { devLink: link };
}

export async function resetPassword(db: Db, ip: string, input: z.infer<typeof resetInput>) {
  await rateLimit(db, `reset:ip:${ip}`, 20, 3600);
  const hash = sha(input.token);
  const passwordHash = await bcrypt.hash(input.password, 12);
  await db.transaction(async (tx) => {
    const [r] = await tx.update(passwordResets).set({ usedAt: new Date() })
      .where(and(eq(passwordResets.tokenHash, hash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date()))).returning({ userId: passwordResets.userId });
    if (!r) throw badRequest('This reset link is invalid or has expired. Request a new one.', 'bad_token');
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, r.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(and(eq(passwordResets.userId, r.userId), isNull(passwordResets.usedAt)));
  });
}
