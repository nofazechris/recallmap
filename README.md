# RecallMap

Learn consistently. Prove your progress. An active-recall learning platform: upload your own material, get an AI-drafted study kit you review and approve, study with **answer-first** flashcards and server-graded quizzes, earn XP and badges from real activity, and anchor selected achievements on **Arc** so anyone can verify them.

Built on Next.js (App Router) · TypeScript · Neon Postgres + Drizzle · Auth.js · S3-compatible private storage · a provider-agnostic AI layer · Solidity + viem for Arc.

---

## Quick start (no external accounts needed)

```bash
npm install
cp .env.example .env.local      # then set AUTH_SECRET (openssl rand -base64 32)
npm run dev                     # http://localhost:3000
```

With no `DATABASE_URL`, the app uses an **embedded development database (PGlite)** stored in `.data/pglite`, applies the real migrations automatically, and uploads go to local disk (`.data/uploads`) through short-lived signed URLs. This is for development and tests only — in production the app refuses to start without `DATABASE_URL`.

What works locally with zero configuration: sign-up/sign-in, topics, file upload + text extraction, answer-first study sessions, spaced repetition, quizzes, XP, achievements, goals/streaks, circles/challenges, follows, notifications, data export, account deletion.

What needs a key from you: **AI generation** (`AI_*`), **Arc credentials** (`ARC_*`), **password-reset email** (`RESEND_*`). Until set, those features return a clear "not configured" message — they are never faked.

## Production setup

### 1. Neon
Create a project at neon.tech, copy the **pooled** connection string, then:

```bash
# .env.local
DATABASE_URL=postgresql://…neon.tech/neondb?sslmode=require
npm run db:migrate              # applies ./drizzle migrations and seeds achievements + reward rules
```
Schema changes: edit `src/server/db/schema.ts`, run `npm run db:generate`, commit the new SQL in `drizzle/`, then `npm run db:migrate`.

### 2. File storage (Cloudflare R2 or any S3-compatible bucket)
Uploads are private; the browser only ever gets a 5-minute signed `PUT` URL, and downloads a 2-minute signed `GET`.
Cloudflare R2: *R2 → Create bucket* → *Manage R2 API tokens → Create token* (permission **Object Read & Write**, scoped to the bucket) → copy the Access Key ID / Secret. Then set:

```
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=recallmap-uploads
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```
Add a **CORS rule** on the bucket allowing `PUT` and `GET` from your app origin with header `content-type`. (AWS S3 / MinIO / Backblaze work the same way.)

### 3. AI provider
```
AI_PROVIDER=anthropic            # anthropic | openai | openai-compatible
AI_API_KEY=…
AI_MODEL=…                       # optional for anthropic/openai
AI_BASE_URL=…                    # required for openai-compatible
```
The model is called server-side with a validated JSON schema. Every generated card/question must cite a source passage **and** include a verbatim evidence quote that the server finds in that passage; anything else is dropped. Nothing is saved until you approve the draft.

### 4. Arc credentials (mainnet)
Network values below were checked against docs.arc.io: **Arc Mainnet, chain ID 5042, RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`, gas paid in USDC.** They are already in `.env.example`.

1. `npm run contracts:build` compiles `contracts/src/CredentialRegistry.sol` → `src/server/chain/artifact.json` (and `contracts/standard-json-input.json` for explorer source verification).
2. Create **two separate wallets** and fund each with a few USDC on Arc mainnet:
   - **Issuer** — the app's hot key. Put its private key in `.env.local` as `ARC_ISSUER_PRIVATE_KEY`. Keep only a small balance on it (each credential costs a fraction of a cent).
   - **Deployer / owner** — used once to deploy, then kept offline. **Never put this key in `.env.local`.** The owner can add/remove issuers and revoke; transfer ownership to a multisig if you can.
3. Dry run (sends nothing, shows the cost): `DEPLOYER_PRIVATE_KEY=0x… npm run contracts:deploy`
4. Deploy for real (irreversible, spends real USDC): `DEPLOYER_PRIVATE_KEY=0x… CONFIRM_MAINNET=yes npm run contracts:deploy -- --broadcast`. It verifies the on-chain code matches this repo's build before reporting success.
5. Set `ARC_CREDENTIAL_CONTRACT_ADDRESS` and run `npm run arc:check` (read-only: chain, code match, owner, issuer authorised, issuer balance).
6. `ARC_MAX_ISSUANCES_PER_DAY` (default 100) caps total credentials per rolling 24 h, so a bug or abuse can never drain the issuer wallet.

**Deployed (Arc mainnet, chain 5042):** `0xd14aca8cd7331d4d5d2b91a7a3afd0edef0b7369` — owner `0x9d64b8827fbec8657be07cD1EF5E24E2b62e8Ff2`, issuer `0x5b0B5Ca9AB21966cD81A5ef3CA7f79C6CB0e9f54`. Verified end to end: a test credential was issued, confirmed on-chain and publicly verified.

A credential only becomes `verified` after the transaction receipt succeeded **and** the contract's stored hash matches. The public page `/verify/<id>` re-reads the contract on every visit and never trusts the database's own status. The contract is **not upgradeable**: a deployed registry is permanent (credentials can be revoked, but the code cannot change).

### 5. Background jobs
Jobs (document processing, AI generation, credential issuance/confirmation) live in the `jobs` table, so work survives restarts and serverless cold starts. They run immediately after the triggering request (`after()`), and are recovered by a sweep:
`POST /api/jobs/sweep` with `Authorization: Bearer $CRON_SECRET`. `vercel.json` schedules it every 5 minutes; on other hosts, call it from any scheduler.

### 6. Password-reset email
Set `RESEND_API_KEY` and `EMAIL_FROM`. Without them, reset links are returned **in development only**, and production returns a clear error instead of pretending to send.

### Deploy checklist
`AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `S3_*`, `AI_*`, `CRON_SECRET` (+ `ARC_*`, `RESEND_*` if used) → `npm run db:migrate` → `npm run build && npm start`.

---

## How the key rules are enforced

| Rule | Where |
|---|---|
| Answer first, reveal second | `POST /api/study-sessions/:id/responses` stores your answer, *then* returns the reference answer. Session and snapshot payloads never contain reference answers; rating before answering is rejected. |
| Server-side grading | `services/quiz.ts` + `services/grading.ts`. Answer keys leave the server only in the results of a *submitted* attempt. Re-submitting returns the stored result and pays nothing. |
| XP can't be farmed | `services/xp.ts` is the only writer of the append-only `xp_ledger`: server-side rules (`config_rules` table), unique idempotency keys, per-day/week caps under an advisory lock, early re-reviews and failed/abandoned quizzes earn nothing. |
| Mastery needs real, spaced assessments | `masteryReached`: two *distinct* attempts ≥ threshold, ≥ 30 min apart (configurable). |
| Streaks use your timezone | Study day = a local calendar day with a rated review or submitted quiz. Opening the app doesn't count. |
| Privacy | Ownership checked in every service (`services/ownership.ts`; foreign ids return 404). Private profiles/topics are enforced in `services/community.ts`; feeds expose only whitelisted fields. |
| Nothing private on-chain | Only a keccak-256 hash of a small canonical payload (achievement, optional topic name, optional public username, date, random nonce). |

Reward/mastery/SRS rules are rows in `config_rules` (versioned); change them without a deploy.

## Project layout
```
src/app/            Next.js routes (pages + /api route handlers)
src/views/          screens (client components)   src/components/  shared UI
src/store/          client cache of /api/me       src/lib/         API client, grading heuristic, router shim
src/server/         db (Drizzle schema, seed) · services (all business logic) · ai · storage · chain
contracts/          CredentialRegistry.sol, Foundry tests + deploy script
tests/              vitest: units, end-to-end flows, community/goals, credentials, real-contract tests
drizzle/            committed SQL migrations
```

## Tests
```bash
npm test            # 85 tests, ~1 min: unit, integration (real Postgres engine), contract (real EVM)
npm run typecheck
```
- **Integration tests** run the real services against an in-memory Postgres (PGlite) using the real migrations. The AI provider is an injected test double (`__setProviderForTests`).
- **Contract tests** (`tests/contract.test.ts`) execute the compiled contract bytecode on an in-process EVM — nothing about the contract is mocked.
- **Credential service tests** use an explicitly-named `MockChain` so the issuance state machine can be exercised deterministically; they do not claim real chain verification.
- `contracts/test/CredentialRegistry.t.sol` is a Foundry suite covering the same behaviours; run `forge test` in `contracts/` (it has **not** been executed in this environment).

## Honest status & known gaps
- **Not exercised against live services** (no credentials were available): the AI providers (Anthropic/OpenAI request formats are implemented to spec), the S3/R2 adapter, Resend email, and the Arc RPC. Everything around them is tested with doubles; plan a short smoke test on your first deploy.
- Scanned PDFs are rejected with a clear message — no OCR yet.
- The product spec asked for Tailwind and Framer Motion; the existing design system (plain CSS tokens) and CSS animations were kept instead.
- Single-attempt AI feedback on typed answers (`POST …/feedback`) is advisory only and never changes ratings or XP.
