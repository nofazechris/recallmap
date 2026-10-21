import { appUrl } from './email';

/**
 * RecallMap's transactional emails: one shared, table-based layout (works in Gmail, Outlook and Apple Mail), three messages.
 * Every dynamic value is HTML-escaped. Each message also has a plain-text version.
 *
 * To change the typography, edit HEADING_FONT / BODY_FONT below. Email clients only show fonts that are installed on the
 * reader's device (or, in Apple Mail and iOS, loaded from the <link> in the head), so always end with safe fallbacks.
 */
export const HEADING_FONT = "'Instrument Serif', Georgia, 'Times New Roman', serif";
export const BODY_FONT = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Geist:wght@400;500;600&display=swap';

const C = { page: '#EEF2EA', card: '#FFFFFF', ink: '#14171A', soft: '#5B636B', faint: '#8A929A', line: '#E6EAE3', blue: '#2F6FB0', blueSoft: '#E8F1FA', lime: '#E1E5AC', limeInk: '#5A6333', warm: '#FFF4E8' };

export const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface Rendered { subject: string; text: string; html: string }

interface Layout {
  preheader: string;
  hero: string;            // file name in /public/email
  heroAlt: string;
  eyebrow: string;
  title: string;           // plain text, escaped here
  body: string;            // trusted HTML built from escaped parts
  cta?: { label: string; url: string };
  after?: string;          // trusted HTML shown under the button
  footer: string;          // trusted HTML
}

function layout(l: Layout): string {
  const base = appUrl();
  const button = l.cta ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 6px;">
            <tr><td align="center" bgcolor="${C.blue}" style="border-radius:999px;">
              <a href="${esc(l.cta.url)}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:${BODY_FONT};font-size:16px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:999px;background:${C.blue};border:1px solid ${C.blue};">${esc(l.cta.label)}&nbsp;&nbsp;&rarr;</a>
            </td></tr>
          </table>` : '';
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(l.title)}</title>
<link href="${FONT_LINK}" rel="stylesheet">
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:${C.blue}; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:32px !important; line-height:38px !important; }
    .hero { height:auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(l.preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
  <tr><td align="center" style="padding:28px 12px 40px;">
    <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
      <tr><td align="center" style="padding:0 0 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:10px;"><img src="${base}/email/logo.png" width="34" height="34" alt="" style="display:block;width:34px;height:34px;"></td>
          <td style="font-family:${BODY_FONT};font-size:21px;font-weight:600;letter-spacing:-0.4px;color:${C.ink};">RecallMap</td>
        </tr></table>
      </td></tr>
      <tr><td bgcolor="${C.card}" style="background:${C.card};border-radius:28px;overflow:hidden;border:1px solid ${C.line};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-size:0;line-height:0;">
            <img class="hero" src="${base}/email/${l.hero}" width="600" height="220" alt="${esc(l.heroAlt)}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:28px 28px 0 0;">
          </td></tr>
          <tr><td class="pad" style="padding:38px 44px 14px;font-family:${BODY_FONT};color:${C.ink};">
            <div style="font-size:12px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${C.blue};margin-bottom:10px;">${esc(l.eyebrow)}</div>
            <div class="h1" style="font-family:${HEADING_FONT};font-size:40px;line-height:46px;font-weight:400;letter-spacing:-0.5px;color:${C.ink};margin:0 0 16px;">${esc(l.title)}</div>
            <div style="font-size:16.5px;line-height:26px;color:${C.soft};">${l.body}</div>
            ${button}
            ${l.after ?? ''}
          </td></tr>
          <tr><td class="pad" style="padding:22px 44px 34px;font-family:${BODY_FONT};">
            <div style="border-top:1px solid ${C.line};padding-top:20px;font-size:13.5px;line-height:21px;color:${C.faint};">${l.footer}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:22px 20px 0;font-family:${BODY_FONT};font-size:12.5px;line-height:19px;color:${C.faint};">
        <span style="color:${C.soft};font-weight:600;">Make learning something you can prove.</span><br>
        RecallMap &middot; <a href="${base}" style="color:${C.faint};text-decoration:underline;">recallmap.top</a> &middot; <a href="${base}/privacy" style="color:${C.faint};text-decoration:underline;">Privacy</a> &middot; <a href="${base}/terms" style="color:${C.faint};text-decoration:underline;">Terms</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const fallbackLink = (url: string) => `
            <div style="margin-top:24px;padding:14px 16px;background:${C.blueSoft};border-radius:14px;font-size:13px;line-height:20px;color:${C.soft};">
              Button not working? Paste this link into your browser:<br>
              <a href="${esc(url)}" style="color:${C.blue};word-break:break-all;">${esc(url)}</a>
            </div>`;

const hello = (name?: string | null) => (name ? `Hi ${esc(name)}, ` : '');

export function verifyEmail(a: { link: string; name?: string | null }): Rendered {
  return {
    subject: 'Confirm your RecallMap email',
    text: `Welcome to RecallMap! Confirm your email address with this link (valid for 24 hours):\n\n${a.link}\n\nIf you didn’t create an account, you can ignore this email.`,
    html: layout({
      preheader: 'One tap to confirm your email and unlock study circles, public profiles and credentials.',
      hero: 'hero-verify.png', heroAlt: 'A moth delivering a confirmed email',
      eyebrow: 'Welcome', title: a.name ? `Welcome, ${a.name}` : 'Welcome to RecallMap',
      body: `${hello(null)}Confirm your email so we know it’s really you. It unlocks study circles, public profiles and credentials you can prove on Arc.`,
      cta: { label: 'Confirm my email', url: a.link },
      after: `${fallbackLink(a.link)}
            <div style="margin-top:16px;font-size:13.5px;color:${C.faint};">This link works for 24 hours.</div>`,
      footer: 'If you didn’t create a RecallMap account, you can safely ignore this email. Nothing will happen.',
    }),
  };
}

export function resetEmail(a: { link: string; name?: string | null }): Rendered {
  return {
    subject: 'Reset your RecallMap password',
    text: `Use this link within an hour to choose a new password:\n\n${a.link}\n\nIf you didn’t ask for this, you can ignore this email.`,
    html: layout({
      preheader: 'Choose a new password. This link works for one hour.',
      hero: 'hero-reset.png', heroAlt: 'A moth with a lock and key',
      eyebrow: 'Account security', title: 'Reset your password',
      body: `${hello(a.name)}we got a request to reset the password on your RecallMap account. Use the button below within an hour to choose a new one.`,
      cta: { label: 'Choose a new password', url: a.link },
      after: fallbackLink(a.link),
      footer: 'Didn’t ask for this? You can ignore this email and your password will stay exactly as it is. Never share this link with anyone.',
    }),
  };
}

export function reminderEmail(a: { count: number; topic?: string | null; link: string; name?: string | null }): Rendered {
  const cards = `${a.count} ${a.count === 1 ? 'card is' : 'cards are'} due for review`;
  const settings = `${appUrl()}/app/settings`;
  const stat = `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 0;">
              <tr><td bgcolor="${C.warm}" style="background:${C.warm};border-radius:20px;padding:22px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="font-family:${HEADING_FONT};font-size:62px;line-height:62px;color:${C.ink};padding-right:18px;">${a.count}</td>
                  <td style="font-family:${BODY_FONT};">
                    <div style="font-size:17px;font-weight:600;color:${C.ink};">${a.count === 1 ? 'card' : 'cards'} due for review</div>
                    ${a.topic ? `<div style="margin-top:8px;"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${C.lime};color:${C.limeInk};font-size:13px;font-weight:600;">Start with ${esc(a.topic)}</span></div>` : ''}
                  </td>
                </tr></table>
              </td></tr>
            </table>`;
  return {
    subject: cards.charAt(0).toUpperCase() + cards.slice(1),
    text: `You have ${a.count} ${a.count === 1 ? 'card' : 'cards'} due. A few minutes keeps them fresh:\n\n${a.link}\n\nTurn these reminders off any time in Settings → Notifications.`,
    html: layout({
      preheader: `${a.count} ${a.count === 1 ? 'card' : 'cards'} ready. A few minutes now keeps them fresh.`,
      hero: 'hero-reminder.png', heroAlt: 'A stack of flashcards and a streak flame',
      eyebrow: 'Daily review', title: a.name ? `${a.name}, your cards are ready` : 'Your cards are ready',
      body: `Remembering is the work. A few minutes of answering from memory now keeps these cards from slipping away.${stat}`,
      cta: { label: 'Start reviewing', url: a.link },
      footer: `You’re getting this because daily reminders are on. <a href="${esc(settings)}" style="color:${C.blue};">Turn them off in Settings &rarr; Notifications</a>.`,
    }),
  };
}
