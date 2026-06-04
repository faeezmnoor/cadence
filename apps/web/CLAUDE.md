# CLAUDE.md — Cadence orientation for LLM agents

You are looking at the Cadence web app (`apps/web/`). Cadence delivers
periodical, self-learning market-research digests to Telegram, configured
via web chat. One-person ops, multi-tenant, side-income economics.

Read this BEFORE making changes. The codebase has strong conventions —
violating them produces noise diffs that get rejected at review.

> The companion handover doc is [`README.md`](./README.md) (directory map,
> stack, common tasks). System-level architecture lives in
> [`server/ARCHITECTURE.md`](./server/ARCHITECTURE.md). Start with both.

---

## Navigating this codebase

**Read these files first, in order:**

1. `server/db/schema.ts` — the data model. Every table has a docstring;
   every column has a `// T-NNN` reference back to the ticket that
   introduced it. If you understand this file you understand the app.
2. `lib/digest-spec/schema.ts` — the `DigestSpecV1` Zod contract. This
   is what the chat config-agent emits and what the composer consumes.
3. `server/trpc/root.ts` — index of every API surface (one line per
   router). Drill down into `server/trpc/routers/` from there.
4. `server/ai/providers/index.ts` — single entry point for tier routing.
5. `server/digest/run.ts` — the full digest pipeline end-to-end (893
   lines, well-commented). Reading this top-to-bottom teaches you how
   the product actually works.

**To answer "where does X live?":**

| Question                                       | Look at                                  |
|------------------------------------------------|------------------------------------------|
| How is a brief composed?                       | `server/ai/composer/compose.ts`          |
| How is the chat agent prompted?                | `server/ai/config-agent/` + `prompts/`   |
| How does the cron fire user briefs?            | `server/inngest/functions/cron-dispatch.ts` |
| How are credits debited?                       | `server/billing/debit.ts`                |
| How does Pro tier swap providers?              | `server/ai/providers/index.ts`           |
| How are RSS feeds aggregated?                  | `server/sources/rss/aggregate.ts`        |
| How is the Telegram webhook verified?          | `app/api/telegram/webhook/route.ts`      |
| Where are admin gates?                         | `server/auth/admin.ts` + `server/trpc/trpc.ts` (`adminProcedure`) |
| Where is the trust boundary for `/api/chat`?   | `app/api/chat/route.ts`                  |

---

## Conventions

### Drizzle queries

- Always import from the canonical client: `import { db } from "@/server/db/client"`.
- Filter helpers come from `drizzle-orm`: `eq`, `and`, `or`, `inArray`,
  `desc`, `isNull`, `sql`. Prefer these over raw SQL strings.
- For multi-row writes that need atomicity, use `db.transaction(async (tx) => ...)`.
  See `server/billing/debit.ts` for the canonical pattern.
- RLS is enforced on the server-side Supabase client (`@/server/supabase/server`),
  NOT on the Drizzle `db` client. `db` runs as service role. If you write
  a "show me the current user's X" query through Drizzle, you MUST filter
  by `userId` yourself.

### tRPC

- One router per logical domain under `server/trpc/routers/`.
- Procedures use `protectedProcedure` (auth required) or `adminProcedure`
  (admin email required). `publicProcedure` is rare and obvious.
- Input validation: Zod schema in `.input()`. Output: just return — let
  TypeScript infer.
- Errors: throw `TRPCError({ code, message })` with one of the standard
  codes. `INTERNAL_SERVER_ERROR` for unexpected, `BAD_REQUEST` for
  malformed input, `NOT_FOUND` for missing rows, `FORBIDDEN` for
  permission, `UNAUTHORIZED` for unauthenticated.

### Error handling in the digest pipeline

- Anything that can throw inside `runDigestPipeline` MUST be classified
  via `classifyError(err)` in `server/digest/errors.ts` (`transient` vs
  `permanent` vs `unknown`). The retry policy depends on the class.
- User-facing error strings go through `sanitizeError(err)` first —
  emails, chat_ids, and tokens get scrubbed before persisting to
  `digest_runs.last_error`.

### Logging

- `lib/log.ts` exports a tiny structured logger. Prefer
  `log.event({event: "...", ...fields})` over `console.log`.
- Sentry captures errors automatically via `Sentry.captureException`.
  `server/observability/sentry-scrub.ts` scrubs PII in `beforeSend`.

### Testing

- Tests live in `test/`. One file per behaviour, not per source file.
- **Mock at module boundaries**, not at function call sites. See
  `test/digest-retry.test.ts` for the pattern: mock `db`, mock the
  Telegram client, exercise the pipeline.
- **Prefer pure-function tests** over source-regex tests. There is
  ONE source-regex test (`test/pro-tier-spec-tier.test.ts`) that
  asserts migration SQL + file structural invariants — it's a
  deliberate exception for cross-file wiring contracts, not a pattern
  to copy.
- Network and LLM calls MUST be mocked. No test in this repo hits the
  Anthropic, OpenAI, Perplexity, Brave, or Telegram APIs. If you
  introduce one, mark it `.skip` and document when to flip it on.
- Run tests with `npx vitest run` — NOT `pnpm test` (it can hang in
  some workspace configurations).

### Imports

- Use the `@/*` path alias (configured in `tsconfig.json` and
  `vitest.config.ts`). Relative imports are fine within a module but
  prefer `@/...` across modules.
- Server-only imports MUST NOT leak into client components. The Next.js
  build will catch most of these via the `"use client"` boundary, but
  watch for accidental `import { db }` in a `lib/` file that gets
  imported from both sides.

---

## Things NOT to do

1. **Don't run `pnpm test` if it hangs.** Use `npx vitest run` from `apps/web/`.
2. **Don't modify `pnpm-workspace.yaml`** unless you are deliberately
   adding a new workspace. The `onlyBuiltDependencies` list is load-bearing.
3. **Don't regenerate `cadence/ticket-map.json` by hand.** Use
   `cadence/scripts/regen-ticket-map.mjs` — it queries Linear and
   sorts deterministically.
4. **Don't use Notion `select` type for the Cadence Engineering Backlog
   Status column** — it's `status` type. Mixing them up has killed
   sub-agents historically.
5. **Don't read `PRO_TIER_ALPHA` from `process.env` directly.** Always
   go through `isProTierAlpha()` in `lib/feature-flags.ts`. There is
   one canonical read site.
6. **Don't add a new LLM-touching code path without wiring `cost_events`.**
   Cost-to-us tracking is load-bearing for billing.
7. **Don't write a digest run row without going through `runDigestPipeline`**
   (or extracting a helper from it). The pipeline owns idempotency,
   credit debit, auto-heal, and error classification — duplicating any
   of those creates ledger drift.
8. **Don't add a new public-by-link surface (like `/b/<id>`) without
   filtering soft-deleted users.** See `app/b/[shortId]/page.tsx` for
   the pattern (security MEDIUM #2).
9. **Don't return the service-role key, raw cost-to-us numbers, or
   other users' rows from any tRPC procedure.** Cost-to-us is internal
   margin signal, not user data.
10. **Don't `pnpm db:push` against the production Supabase.** Use the
    `apply-NNNN.mjs` migration runners — they are idempotent and verify
    post-apply state.

---

## How to add a new provider (tier)

1. Implement `SearchProvider` and/or `ComposerProvider` from
   `server/ai/providers/types.ts` in a new file
   `server/ai/providers/<name>.ts`. Look at `perplexity.ts` for a full
   search-provider example and `anthropic-pro.ts` for a composer-provider
   example.
2. Wire it into the tier union and the `getProviders()` switch in
   `server/ai/providers/index.ts`.
3. Add cost tracking — at minimum log `cost_events` rows with the
   provider name (string, no enum). Update `server/cost/record.ts`
   pricing tables.
4. Gate behind a feature flag in `lib/feature-flags.ts` until evals
   show ≥0.5 composite-score lift on ≥5 manually-rated briefs.
5. Add a `providers-<name>.test.ts` that locks the model id + temperature
   and a request-shape happy path.

---

## How to add a new RSS feed

Edit `server/sources/rss/feeds.ts`. Each `CuratedFeed` needs:

- `id` — kebab-case, unique
- `url` — feed URL
- `topics` — array of bucket names (must match those in
  `TOPIC_KEYWORDS` in `server/sources/index.ts` to be reachable)
- `name` — human label for telemetry

Then run `npx vitest run test/sources-rss-aggregate.test.ts` to confirm
the new feed parses. Watch for SSRF — `test/rss-ssrf.test.ts` rejects
internal IPs; new feed URLs must pass it.

## How to add a Playwright scraper

1. New file under `server/sources/scrape/scrapers/<name>.ts`. Look at
   `mpob-stocks.ts` for the canonical shape: takes nothing (or a
   minimal arg), returns `NormalizedSourceItem[]`, NEVER throws.
2. Add the trigger logic in `gatherSources()` in `server/sources/index.ts`
   — keep keyword matching coarse (substring on `spec.topics +
   spec.topicHint`).
3. Cap aggressively: scrapes are slow (~5–15s on cold Chromium). The
   existing caps (`MAX_RSS_FEEDS_PER_CALL=5`, `MAX_YAHOO_SCRAPES_PER_CALL=2`)
   exist for a reason.
4. Test with a fixture HTML file under `test/fixtures/` and mock
   Playwright's `page.content()` return.

---

## Testing philosophy

We test at three levels:

1. **Pure-function tests** (preferred). Cost matcher, error classifier,
   tier resolver, sample banner, low-balance footer, streak — these are
   the cheapest to maintain.
2. **Module-boundary integration tests**. Mock `db`, mock Telegram
   client, mock the LLM call, exercise a router or pipeline branch.
   `test/digest-retry.test.ts`, `test/admin-replay.test.ts` are good
   references.
3. **Structural / source-regex tests** (rare). Only when a behavioural
   test would be brittle and the contract is multi-file (e.g.
   "migration 0023 + schema.ts + run.ts + spec page all agree on the
   tier column"). One example exists: `test/pro-tier-spec-tier.test.ts`.
   Don't replicate this pattern for normal logic — refactor toward a
   pure helper that both production and test can call.

If you're tempted to write a flaky test (LLM, network, sleep-based),
either (a) extract the pure logic and test that instead, or (b) mark it
`.skip` with a comment naming when to flip it on.
