---
paths:
  - "apps/web/**"
---
# Web app conventions (apps/web)
Rehomed 2026-10-06 from the app-level instruction file (lines 51–153, 203–223), the server architecture notes (lines 414–430) and the old handover's runbook section; all three are archived under docs/_archive/2026-10/ (see docs/_archive/index.md). Costly rules sit in AGENTS.md §6 with their lessons; this file holds the working conventions.

## Read first for app work
`server/db/schema.ts` (data model) · `lib/digest-spec/schema.ts` (the `DigestSpecV1` contract) · `server/trpc/root.ts` (every router) · `server/ai/providers/index.ts` (tier routing) · `server/digest/run.ts` (the pipeline, top to bottom).

## Drizzle
- Import `db` from `@/server/db/client`; filter helpers from `drizzle-orm` (`eq`, `and`, `or`, `inArray`, `desc`, `isNull`, `sql`) over raw SQL strings.
- Multi-row atomic writes use `db.transaction(async (tx) => …)`; pattern: `server/billing/debit.ts`.
- Row-level security applies to the Supabase clients (`server/supabase/server.ts`, `browser.ts`), not to `db`. Choose the client deliberately.
- Never write `users.credits_balance` outside `server/billing/`; a new `transactions.type` needs a helper there too.
- `chat_threads.spec_id` is `ON DELETE SET NULL`: any hard delete of a `digest_specs` row also archives or deletes its bound chat thread in the same transaction.

## tRPC
- One router per domain under `server/trpc/routers/`; register it in `server/trpc/root.ts`.
- `protectedProcedure` (signed in) or `adminProcedure` (admin e-mail allowlist, `server/auth/admin.ts`); `publicProcedure` is rare.
- Zod in `.input()`; let TypeScript infer the output. Errors: `TRPCError` with `INTERNAL_SERVER_ERROR`, `BAD_REQUEST`, `NOT_FOUND`, `FORBIDDEN` or `UNAUTHORIZED`.

## Pipeline errors and logging
- Anything that can throw inside `runDigestPipeline` is classified by `classifyError` in `server/digest/errors.ts` (transient, permanent, unknown); retries depend on the class.
- Error text is passed through `sanitizeError` before it reaches `digest_runs.last_error`.
- Log with `log.event({ event, …fields })` from `lib/log.ts`, not `console.log`. Sentry scrubbing is in `server/observability/sentry-scrub.ts`; a new sensitive field extends it and `test/sentry-scrub.test.ts`.

## Imports and module boundaries
- Use the `@/*` alias across modules; relative imports within a module.
- `lib/` never imports from `server/`. `server/db/schema.ts` imports nothing else from `server/`. `server/ai/providers/*` never imports from `server/digest/`.
- `app/` imports `server/` only in Server Components and Route Handlers; Client Components reach the server through tRPC. Watch for `db` imported into a `lib/` file used on both sides.
- A cycle is usually fixed by moving a pure type or schema into `lib/`, or by passing a value as a parameter.

## Tests (Vitest, `apps/web/test/`)
- One file per behaviour. Prefer pure-function tests; next, module-boundary tests that mock `db`, the Telegram client and the LLM call (`test/digest-retry.test.ts`, `test/admin-replay.test.ts`).
- Source-regex tests are a deliberate exception for multi-file contracts (`test/pro-tier-spec-tier.test.ts`); do not copy the pattern for normal logic.
- A flaky test (LLM, network, sleep) becomes a pure-logic test, or `.skip` with a comment naming when to enable it.

## How-tos (paths verified 2026-10-06)
- New starter template: add it to `lib/digest-spec/templates.ts` (shape: `DigestSpecV1`); cards render from `components/chat/starter-cards.tsx` and `brief-gallery.tsx`; seed overlay in `server/ai/config-agent/template-seed.ts`. Run the template tests.
- New RSS feed: add a `CuratedFeed` (`id`, `url`, `topics`, `name`) in `server/sources/rss/feeds.ts`; `topics` must match `TOPIC_KEYWORDS` in `server/sources/index.ts`. Run `npx vitest run test/sources-rss-aggregate.test.ts test/rss-ssrf.test.ts` (the SSRF test rejects internal addresses).
- New scraper: one file in `server/sources/scrape/scrapers/` returning `NormalizedSourceItem[]` and never throwing (shape: `mpob-stocks.ts`); trigger it from `gatherSources()` in `server/sources/index.ts` with coarse keyword matching; respect `MAX_RSS_FEEDS_PER_CALL` and `MAX_YAHOO_SCRAPES_PER_CALL`; test with a fixture under `test/fixtures/`.
- New web searcher: implement `SearchProvider` and register it in `server/ai/providers/searchers.ts` (`SEARCHER_IDS`); a new id needs a migration for the `digest_specs` searcher check (decision 0011).
- New composer or search provider for a tier: implement the interface in `server/ai/providers/types.ts` in a new file, wire it into `getProviders()` in `server/ai/providers/index.ts`, record `cost_events` and update `server/cost/record.ts` pricing, gate it behind a flag in `lib/feature-flags.ts` until the eval gate passes, and add `test/providers-<name>.test.ts` locking the model id and request shape.
