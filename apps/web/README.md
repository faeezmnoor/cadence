# Cadence — `apps/web`

The Next.js app: chat UI, billing, admin, Telegram webhook, Inngest crons,
the AI composer pipeline, and all data access.

> Looking for the project overview, blueprint, or strategy docs? Start at
> the repo root README and `docs/` (mirror of `cadence/blueprint/`).
> This README is the **codebase handover** doc — what every directory does
> and how to be productive in an hour.

For LLM-specific orientation (Claude Code / Cursor / GPT), read
[`CLAUDE.md`](./CLAUDE.md) next. For module-level system architecture, see
[`server/ARCHITECTURE.md`](./server/ARCHITECTURE.md).

---

## Quick start

```bash
# from cadence/app (the nested git repo root)
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in keys (see Env vars)
pnpm --filter web dev                          # http://localhost:3000
```

Tests:

```bash
cd apps/web
npx vitest run                                 # ~5s, 485 tests
# do NOT use `pnpm test` if you see it hang — go direct to vitest
```

Typecheck + lint:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

---

## Stack

| Layer            | Choice                                                      |
|------------------|-------------------------------------------------------------|
| Framework        | Next.js 15.5 (App Router) + React 19 RC                     |
| Styling          | Tailwind v3 + shadcn/ui (Radix primitives, `components/`)   |
| API surface      | tRPC v11 (`server/trpc/`) — typed end-to-end                |
| AI               | Vercel AI SDK 4 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`) |
| LLMs             | Claude Haiku 4.5 (composer default), GPT-4o-mini (config agent), Claude Sonnet 4.6 (Pro composer), Perplexity Sonar Reasoning Pro (Pro search) |
| DB               | Supabase Postgres (`ap-southeast-1`)                        |
| ORM              | Drizzle ORM 0.45 (postgres-js driver)                       |
| Auth             | Supabase Auth — magic link via Resend SMTP                  |
| Background jobs  | Inngest (cron `* * * * *` for digest dispatch + weekly distill + RSS poll + purge) |
| Telegram         | grammY (webhook-only — no long-polling)                     |
| Scraping         | playwright-core + `@sparticuz/chromium` on Vercel functions |
| Observability    | Sentry + Axiom (`next-axiom`)                               |
| Tests            | Vitest 4                                                    |

---

## Directory map

```
apps/web/
├── app/                      Next.js App Router pages + route handlers
│   ├── (marketing)/          Public marketing pages (/, /pricing, /terms)
│   ├── admin/                Admin-only dashboards (runs, evals, cost, feedback, missing-capabilities)
│   ├── api/                  Route handlers (NOT pages)
│   │   ├── auth/sign-in/     POST magic-link issue
│   │   ├── chat/             POST streaming chat endpoint (config agent)
│   │   ├── dev-smoke/        Local-only pipeline smoke (refuses in prod)
│   │   ├── inngest/          Inngest serve handler (cron entry)
│   │   ├── telegram/webhook/ Telegram Update receiver
│   │   └── trpc/[trpc]/      tRPC fetch adapter
│   ├── app/                  Signed-in user surface (chat, link, account)
│   ├── auth/                 /auth/callback for magic-link return
│   ├── b/[shortId]/          Public brief permalink (e.g. `/b/abc123`)
│   ├── chat/                 Chat onboarding
│   ├── settings/             /settings index + danger zone (delete account)
│   └── spec/                 /spec — view/edit current DigestSpec
│
├── components/               React components (shadcn primitives + Cadence widgets)
│   ├── auth/                 Sign-in + sign-out
│   ├── billing/              Pack cards, tier explainer, low-balance footer preview
│   ├── chat/                 Chat UI, starter chips, draft sidebar
│   ├── marketing/            Hero, FAQ, etc.
│   ├── nav/                  App + marketing nav
│   └── telegram/             Telegram link + progress card
│
├── lib/                      Shared utilities (importable from both `app/` and `server/`)
│   ├── chat/multi-topic.ts      Multi-topic detector (PRD: refuse multi-topic at v1)
│   ├── digest-spec/schema.ts    Zod DigestSpec v1 contract (THE typed brief shape)
│   ├── digest-spec/templates.ts Starter templates + topic classifier
│   ├── supabase/browser.ts      Client-side Supabase helper
│   ├── trpc/{client,provider}   React Query + tRPC wiring
│   ├── feature-flags.ts         PRO_TIER_ALPHA + future flags (single read site)
│   ├── log.ts                   Tiny structured logger
│   └── utils.ts                 `cn()` className helper
│
├── server/                   Backend modules — see server/ARCHITECTURE.md
│   ├── ai/                   Composer, config agent, distill, providers (Pro/default)
│   ├── auth/admin.ts         Email-based admin gate (env CADENCE_ADMIN_EMAILS)
│   ├── billing/              Credits, debit, refund, packs, circuit breaker, footer
│   ├── connectors/           Brave Search + RSS connectors (legacy; new code uses server/sources/)
│   ├── cost/record.ts        cost_events emitter (LLM/search/price pricing tables)
│   ├── cron/match.ts         Pure tz-aware "should this spec fire now?"
│   ├── db/                   Drizzle schema.ts + migrations + apply-NNNN.mjs runners
│   ├── digest/               Pipeline (run.ts), sample banner, share helper, streak, errors
│   ├── email/                Resend HTTP sender + receipt/refund templates
│   ├── eval/                 Feedback-loop eval harness (weekly)
│   ├── evals/pro-eval-gate   Pro-vs-default readiness check (manual ratings → gate)
│   ├── inngest/              Client + functions/ (cron-dispatch, digest-run, distill, etc.)
│   ├── observability/        Sentry beforeSend PII scrub
│   ├── rate-limit/check.ts   Per-user fixed-window limiter (single Postgres round trip)
│   ├── sources/              Phase 6a free-data substrate — RSS aggregator + Playwright scrapers + gatherSources()
│   ├── supabase/             Server-side Supabase clients (RLS as user vs service role)
│   ├── support/contact.ts    Single SUPPORT_EMAIL source of truth
│   ├── telegram/             grammY client + Update dispatcher + feedback callback + /tune + link tokens
│   └── trpc/                 tRPC root, context, procedures, routers/
│
├── test/                     Vitest suite (61 files, 485 passing; see CLAUDE.md "Testing")
├── scripts/                  Standalone Node scripts (seed/verify smoke spec)
├── public/                   Static assets
├── instrumentation.ts        Next.js process-init hook (loads Sentry server/edge configs)
├── middleware.ts             Supabase session refresh on every request
├── sentry.{client,edge,server}.config.ts  Sentry initialization per runtime
├── drizzle.config.ts         Migration config (URL = DIRECT_URL)
├── tailwind.config.ts        Tailwind v3 config
├── tsconfig.json             Strict TS; path alias `@/*` → `apps/web/*`
└── vitest.config.ts          Vitest config (`@/*` alias mirrored)
```

---

## Environment variables

See [`.env.example`](../../.env.example) (lives at the repo root, NOT under `apps/web/`).

Required for local dev (minimum to boot):

- `DATABASE_URL` + `DIRECT_URL` — Supabase Postgres (session pooler + direct)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `RESEND_API_KEY` (magic link)

Required for cron / Telegram / Pro tier in prod:

- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- `BRAVE_SEARCH_API_KEY`
- `PERPLEXITY_API_KEY` (Pro tier)
- `PRO_TIER_ALPHA=false|true` (single feature-flag for the Pro arm)
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`
- `AXIOM_TOKEN`, `AXIOM_DATASET`
- `CADENCE_ADMIN_EMAILS` (comma-sep, e.g. `faeezmnoor@gmail.com`)
- `SUPPORT_EMAIL` (override default; see `server/support/contact.ts`)
- `NEXT_PUBLIC_APP_URL`

Source the canonical machine secrets in dev with:
`set -a && source ~/.openclaw/secrets.env && set +a`.

---

## Local DB workflow

1. Edit `server/db/schema.ts`.
2. `pnpm --filter web db:generate` — drizzle-kit emits a numbered SQL file
   into `server/db/migrations/`.
3. **For non-trivial migrations, write a `server/db/apply-NNNN.mjs` runner**
   too. The pattern (see `apply-0023.mjs` for a clean reference):
   - Reads the `.sql` file.
   - Runs the migration inside a transaction.
   - Verifies the post-state (column exists, constraint present, etc).
   - Optionally backfills rows.
4. Apply:
   ```bash
   cd apps/web && node --env-file=.env.local server/db/apply-NNNN.mjs
   ```
5. RLS policies live as SQL-only migrations (`0001_rls_policies.sql`,
   `0019_language_interest_events_rls.sql`) — Drizzle doesn't model RLS,
   so any new user-data table needs a hand-written policy migration.

> `pnpm db:push` exists but should NOT be used against prod — it skips
> the migration history. Use it only for throwaway local schemas.

---

## Deployment (Vercel)

- Region: `sin1` (Singapore) — set in `vercel.json`.
- Push to `main` → production deploy.
- Open PR → preview deploy.
- Inngest functions register automatically via `app/api/inngest/route.ts`
  on first request after deploy. Confirm in the Inngest dashboard that
  cron `cadence/cron-dispatch` is registered after each deploy.

CI gate (see `.github/workflows/`): typecheck + lint + vitest + `pnpm audit`
with prod high/critical gate. PRs blocked if any of those fail.

---

## Provider abstraction (default vs Pro)

`server/ai/providers/` is the ONLY place that decides which model handles
a brief. Call sites use:

```ts
import { getProviders } from "@/server/ai/providers";
const { search, composer, tier } = getProviders(spec.tier);
```

- **Default** (`tier: "default"`): Brave Search + curated RSS + Playwright
  scrapers + Claude Haiku 4.5. 1 credit per brief.
- **Pro** (`tier: "pro"`): Perplexity Sonar Reasoning Pro (search-and-cite
  in one call) + Claude Sonnet 4.6. 3 credits per brief. Gated behind
  `PRO_TIER_ALPHA=true` — `getProviders("pro")` silently returns the
  default bundle when the flag is off. **Always check the returned
  `tier` field, not the requested one**, to know what actually ran.

Adding a new tier or model:
1. Add a new module under `server/ai/providers/<name>.ts` implementing
   `SearchProvider` and/or `ComposerProvider` from `./types.ts`.
2. Add the tier label to the `Tier` union in `./types.ts`.
3. Route it from `index.ts` `getProviders()`. Never branch on tier at
   call sites.

---

## Free data sources (`server/sources/`)

Phase 6a substrate (`CAD-113`). Four patterns:

- **Pattern A — Playwright scrapers** (wired): `server/sources/scrape/scrapers/`.
  Three scrapers live: MPOB palm-oil stocks, Bursa CPO futures, Yahoo
  Finance ticker quotes.
- **Pattern B — SERP scrapes** (deferred to Phase 6b).
- **Pattern C — RSS aggregator** (wired): `server/sources/rss/` with 17
  curated feeds in `feeds.ts` and a topic→feeds router.
- **Pattern D — Perplexity Sonar** (existing, will adopt
  `NormalizedSourceItem` over time).

The composer-facing entry point is `gatherSources(spec)` in
`server/sources/index.ts` — fans out to RSS + topic-conditional scrapers
and returns a capped, normalized `NormalizedSourceItem[]`. **Never
throws** — per-source failures are swallowed so a broken feed cannot
break a brief.

Strategy doc: `cadence/strategy/free-data-source-plan-v1.md`.

---

## Common tasks

### Add a starter template
Edit `lib/digest-spec/templates.ts`. The chat UI's turn-0 chips and the
topic classifier both read from this single source.

### Add a curated RSS feed
Edit `CURATED_FEEDS` in `server/sources/rss/feeds.ts`. Tag with one or
more topic buckets so `gatherSources()` routes the right specs to it.
Add an SSRF test fixture if the feed URL pattern is novel.

### Add a Playwright scraper
1. New file `server/sources/scrape/scrapers/<name>.ts` that exports a
   function returning `NormalizedSourceItem[]`.
2. Add the scraper-trigger keywords to `gatherSources()` in
   `server/sources/index.ts`.
3. Write a test under `test/sources-*` using the locked Zod contract.

### Add a tRPC procedure
Append to the relevant router under `server/trpc/routers/`. Use
`protectedProcedure` for authed routes, `adminProcedure` for admin.
Input validation via Zod; output is just a return type.

### Add an admin page
Drop a `page.tsx` under `app/admin/<name>/`. The layout enforces the
admin email gate; data access goes through `adminProcedure` tRPC routes.

### Add a credit pack
Edit `PACKS` in `server/billing/packs.ts`. Then create a new
`pricing_snapshots` row via SQL (see `server/db/seed-pricing-snapshots.mjs`).
The DB row is authoritative for charges; the constant is for FE rendering
and tests.

### Add a feature flag
Edit `lib/feature-flags.ts`. Read it from there only — never `process.env`
direct from call sites.

---

## Where the trust boundaries are

- **`/api/chat`** — User-controlled text reaches the config-agent LLM
  prompt. Treat as untrusted: never let the LLM call a tool that mutates
  another user's data, never log the raw prompt without scrubbing.
- **Telegram webhook** — Verified via `?secret=` query OR
  `X-Telegram-Bot-Api-Secret-Token` header. Anything from the bot is
  attacker-controllable if the secret leaks.
- **Inngest webhook** — Verified via signing key at cold start
  (`INNGEST_SIGNING_KEY` asserted in prod).
- **RLS** — All user-data tables are RLS-locked to `auth.uid()`. The
  service role bypasses RLS — never expose the service-role key to the
  client, and never run a service-role query that returns "all users'
  X" without an explicit user-id filter.
- **Brief permalinks** (`/b/<shortId>`) — Public-by-link only. Soft-deleted
  users' briefs 404 (security MEDIUM #2). New "public" surfaces should
  follow the same delete-aware pattern.

---

## Ops: nightly database backups (CAD-216)

`.github/workflows/db-backup.yml` runs every night at 20:00 UTC
(04:00 MYT, off-peak): `pg_dump --format=custom` against
`secrets.DATABASE_URL`, gzipped, uploaded as a GitHub Actions artifact
named `db-backup` with **30-day retention**. The job fails loudly if the
secret is missing, the dump errors, or the file is under 100KB — the
GitHub workflow-failure email is the alert. There is no other alerting;
do not mute those emails.

**Founder action required (one-time):** add the `DATABASE_URL` secret in
GitHub → repo Settings → Secrets and variables → Actions. Use the direct
(non-pooled) connection string. Until it's set, every nightly run fails —
which is the intended nag.

**To restore:**

1. Download the artifact from the workflow run (Actions → DB backup →
   pick a run → Artifacts → `db-backup`), then unpack:

   ```bash
   gunzip cadence-YYYY-MM-DD.dump.gz
   ```

2. Restore into the target database (custom-format dumps need
   `pg_restore`, not `psql`):

   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges \
     -d "$DATABASE_URL" cadence-YYYY-MM-DD.dump
   ```

   `--clean --if-exists` drops and recreates objects, so this overwrites
   the target — point it at a fresh database first when in doubt. Your
   local `pg_restore` must be at least the version that produced the dump
   (the workflow uses the `postgres:17` client).

3. Sanity-check row counts on `users`, `digest_specs`, and `transactions`
   before pointing the app at the restored database.

A manual run before risky migrations: Actions → DB backup → Run workflow.

---

## Where to ask for help

- Blueprint (the "what should this be?"): `cadence/blueprint/`
- PM audits / decisions: `cadence/blueprint/pm-audit-v1.md`,
  `design-audit-v1.md`, `chat-ux-v2.md`
- Ticket map (Linear ↔ T-NNN): `cadence/ticket-map.json`
- Operational runbook: `cadence/blueprint/operational-runbook.md`
