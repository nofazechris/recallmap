import { describe, expect, it } from 'vitest';
import { esc, reminderEmail, resetEmail, verifyEmail } from '../src/server/lib/email-templates';

const link = 'https://recallmap.top/auth/verify?token=abc123';

describe('email templates', () => {
  it('verification email: branded html, the link twice (button + fallback), a plain-text twin, and a greeting', () => {
    const m = verifyEmail({ link, name: 'Alex' });
    expect(m.subject).toBe('Confirm your RecallMap email');
    expect(m.text).toContain(link);                       // the plain-text version still carries the link
    expect(m.html).toContain('<!doctype html>');
    expect(m.html.split(link).length - 1).toBeGreaterThanOrEqual(2);
    expect(m.html).toContain('Welcome, Alex');
    expect(m.html).toContain('/email/hero-verify.png');
  });

  it('reset email explains the one-hour window and that ignoring it is safe', () => {
    const m = resetEmail({ link: 'https://recallmap.top/auth/reset?token=zzz', name: null });
    expect(m.html).toContain('within an hour');
    expect(m.html).toContain('ignore this email');
    expect(m.text).toContain('https://recallmap.top/auth/reset?token=zzz');
  });

  it('reminder email: count, topic, singular/plural, and a way to turn reminders off', () => {
    const many = reminderEmail({ count: 12, topic: 'Photosynthesis', link: 'https://recallmap.top/study/x', name: 'Sam' });
    expect(many.subject).toBe('12 cards are due for review');
    expect(many.html).toContain('Start with Photosynthesis');
    expect(many.html).toContain('/app/settings');
    const one = reminderEmail({ count: 1, topic: null, link: 'https://recallmap.top/study/x' });
    expect(one.subject).toBe('1 card is due for review');
    expect(one.html).not.toContain('Start with');
  });

  it('escapes everything user-controlled so a name or topic can never inject markup', () => {
    const evil = '<img src=x onerror=alert(1)>"&';
    for (const html of [verifyEmail({ link, name: evil }).html, resetEmail({ link, name: evil }).html, reminderEmail({ count: 2, topic: evil, link, name: evil }).html]) {
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x');
    }
    expect(esc(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&#39;');
  });
});
