/**
 * Checks the environment for a PRODUCTION deploy and says what is missing or unsafe.
 *   npm run env:check            (reads .env.local, or the variables already in your shell)
 */
const e = process.env;
let bad = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { bad++; console.error(`  ✗ ${m}`); };
const warn = (m: string) => console.log(`  ! ${m}`);
const has = (k: string) => !!e[k] && e[k]!.trim().length > 0;
const https = (u: string) => /^https:\/\//.test(u);

console.log('Required');
has('DATABASE_URL') ? ok('DATABASE_URL') : fail('DATABASE_URL (Neon) is required — production refuses to start without it.');
has('AUTH_SECRET') && e.AUTH_SECRET!.length >= 32 ? ok('AUTH_SECRET (32+ chars)') : fail('AUTH_SECRET must be a random string of at least 32 characters (openssl rand -base64 32).');
const url = e.NEXT_PUBLIC_APP_URL ?? '';
https(url) && !/localhost|127\.0\.0\.1/.test(url) ? ok(`NEXT_PUBLIC_APP_URL = ${url}`) : fail('NEXT_PUBLIC_APP_URL must be your public https:// address (it is used in email links).');
has('AUTH_URL') && https(e.AUTH_URL!) ? ok('AUTH_URL') : fail('AUTH_URL must be your public https:// address.');
['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].every(has) ? ok('S3_* storage') : fail('S3_* storage is required in production (local disk is development only).');
has('AI_PROVIDER') && has('AI_API_KEY') ? ok(`AI (${e.AI_PROVIDER}${e.AI_MODEL ? ', ' + e.AI_MODEL : ''})`) : fail('AI_PROVIDER and AI_API_KEY are needed for study kits.');
has('CRON_SECRET') ? ok('CRON_SECRET (protects /api/jobs/sweep and /api/health details)') : fail('CRON_SECRET is required so your scheduler can run background jobs and reminders.');

console.log('\nOptional features');
has('RESEND_API_KEY') && has('EMAIL_FROM') ? ok('Email (verification, password reset, reminders)') : warn('No RESEND_API_KEY/EMAIL_FROM: password reset will refuse in production, and email verification stays off.');
if (e.ARC_CHAIN_ID && e.ARC_RPC_URL && e.ARC_CREDENTIAL_CONTRACT_ADDRESS) {
  ok(`Arc contract ${e.ARC_CREDENTIAL_CONTRACT_ADDRESS} on chain ${e.ARC_CHAIN_ID}`);
  has('ARC_ISSUER_PRIVATE_KEY') ? ok("ARC_ISSUER_PRIVATE_KEY (keep that wallet's balance small)") : warn('ARC_ISSUER_PRIVATE_KEY missing: people can verify existing credentials but not issue new ones.');
} else warn('Arc not fully configured: credentials are off.');
has('SENTRY_DSN') ? ok('SENTRY_DSN (error tracking)') : warn('No SENTRY_DSN: errors are only written to the server logs.');
has('NEXT_PUBLIC_CONTACT_EMAIL') ? ok('NEXT_PUBLIC_CONTACT_EMAIL shown on Terms/Privacy') : warn('NEXT_PUBLIC_CONTACT_EMAIL is empty — your Terms/Privacy pages have no contact address.');

console.log(bad ? `\n${bad} problem(s) to fix before deploying.` : '\nEnvironment looks ready for production.');
process.exit(bad ? 1 : 0);
