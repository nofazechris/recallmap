import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { getDb } from './server/db';
import { users } from './server/db/schema';
import { rateLimit } from './server/lib/rate-limit';

declare module 'next-auth' {
  interface Session { user: { id: string; email: string; name?: string | null } }
}

const creds = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

/** Compared against when the email is unknown, so response timing doesn't reveal who has an account. */
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('recallmap-timing-equaliser', 12));

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/auth' },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = creds.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const db = await getDb();
        try { await rateLimit(db, `login:${email}`, 8, 300); } catch { return null; }
        const [u] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
        const ok = await bcrypt.compare(password, u?.passwordHash ?? getDummyHash());
        return u && ok ? { id: u.id, email: u.email } : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
