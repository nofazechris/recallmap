# Deploying RecallMap

Target: **Vercel** (the repo already has `vercel.json` with a 5-minute cron). Any Node host works the same way; replace the cron with any scheduler that can call one URL.

## 0. Before you start
```bash
npm test             # 85 tests should pass
npm run env:check    # lists what's missing for production
npm run build        # a clean production build
```
`env:check` reads `.env.local`; for production, run it with the real values loaded in your shell.

## 1. Database
Your Neon `DATABASE_URL` is already migrated. For any new database (or after pulling schema changes):
```bash
DATABASE_URL=postgresql://… npm run db:migrate
```
Use Neon's **pooled** connection string. Turn on Neon's point-in-time restore / backups in the Neon console.

## 2. Create the Vercel project
1. Push the repo to GitHub, then *Add New → Project* on vercel.com and import it (framework: Next.js, defaults are fine).
2. Add these **Environment Variables** (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled string |
| `AUTH_SECRET` | `openssl rand -base64 32` — a NEW one for production |
| `AUTH_URL` and `NEXT_PUBLIC_APP_URL` | your public `https://…` address |
| `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | your R2 values |
| `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_MODEL` (optional `AI_VERIFY_MODEL`) | OpenAI |
| `CRON_SECRET` | any long random string; Vercel sends it to the cron automatically |
| `RESEND_API_KEY`, `EMAIL_FROM` | for verification emails, password reset and reminders |
| `NEXT_PUBLIC_CONTACT_EMAIL` | shown on Terms / Privacy |
| `ARC_*`, `NEXT_PUBLIC_ARC_EXPLORER_URL` | once the contract is deployed (see README §4) |

3. Deploy. Then add your domain under *Settings → Domains* and update `AUTH_URL` / `NEXT_PUBLIC_APP_URL` to it.

## 3. Cloudflare R2
Edit the bucket's **CORS policy** and add your production origin next to `http://localhost:3000`:
```json
[{ "AllowedOrigins": ["https://your-domain.com", "http://localhost:3000"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```
Then run `npm run storage:check` with `NEXT_PUBLIC_APP_URL` set to your production address; the CORS line must be ✓.

## 4. Email (Resend)
Create a Resend account, verify your sending domain, create an API key, and set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `RecallMap <hello@your-domain.com>`). Setting them switches on email verification, which then gates community features, public profiles and credentials until a user confirms their address.

## 5. Background jobs & reminders
`vercel.json` calls `/api/jobs/sweep` every 5 minutes. It recovers stuck jobs, finishes document processing / AI generation / credential confirmation, and sends the 9am-local "cards due" reminders. Vercel's Hobby plan only allows daily crons — on Hobby, use a free external scheduler (e.g. cron-job.org) to `POST` that URL every 5 minutes with header `Authorization: Bearer <CRON_SECRET>`.

## 6. After the first deploy — smoke test
- `GET https://your-domain/api/health` → `{"ok":true,"db":true}`. With header `Authorization: Bearer <CRON_SECRET>` it also lists which services are configured.
- Create an account, confirm the email link works, upload a PDF, generate a study kit, run a study session and a quiz.
- Visit `/terms` and `/privacy`.
- (Arc) issue one credential and open its `/verify/<id>` page.

## Operating notes
- **Costs:** AI is the only metered cost that scales with users (kits are rate limited to 10/hour/user). Arc credentials cost a fraction of a cent each and are capped by `ARC_MAX_ISSUANCES_PER_DAY`.
- **Rotating secrets:** changing `AUTH_SECRET` signs everyone out (fine). The issuer key can be rotated on-chain by the contract owner (`setIssuer`).
- **Content-Security-Policy** is not set yet (Next.js inline scripts need a nonce setup); the other security headers are on.
- **Logs** are structured JSON with request IDs and never contain documents, answers or keys. Add an error tracker (Sentry) if you want alerting.
