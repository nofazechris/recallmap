import { env } from '../config';

export interface Mail { to: string; subject: string; text: string }
type Mailer = (m: Mail) => Promise<void>;

let override: Mailer | null = null;
/** Test seam only. */
export const __setMailerForTests = (m: Mailer | null) => { override = m; };

/** True when a real email provider (Resend) is configured. Features that depend on email only switch on then. */
export const emailConfigured = () => !!override || !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(m: Mail): Promise<void> {
  if (override) return override(m);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: m.to, subject: m.subject, text: m.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}

export const appUrl = () => env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
