# `server/` Architecture

Module-by-module overview of the backend. Read this after `README.md` and
`CLAUDE.md` at the app root. Most modules have rich docstrings at the top
of their entry file — this doc is the index and the system-level glue.

---

## End-to-end data flow

```
                    [/chat (config agent)]
                            │
                            ▼  user converses; agent emits DigestSpecV1
                  digest_specs.spec (versioned, is_current=true)
                            │
                            ▼  every UTC minute
              server/inngest/functions/cron-dispatch.ts
                            │  match (user_tz, cadence) → claim row
                            ▼  INSERT digest_runs (status=pending)
                                + emit digest/run.scheduled
                            │
                            ▼
              server/inngest/functions/digest-run.ts
                            │  retry policy: 3× transient, 0× permanent
                            ▼
              server/digest/run.ts :: runDigestPipeline
                  │
                  ├── shouldSkipForCredits (billing/debit.ts)
                  │       └── if broke → record skip, return
                  │
                  ├── gatherSources (sources/index.ts)
                  │       ├── RSS aggregator (sources/rss/aggregate.ts)
                  │       └── Playwright scrapers (sources/scrape/scrapers/*)
                  │
                  ├── braveSearch (connectors/brave-search.ts) + recentRssForSpec
                  │
                  ├── getProviders(spec.tier) (ai/providers/index.ts)
                  │       ├── default → Brave + RSS + scrapers + Haiku 4.5
                  │       └── pro     → Perplexity Sonar Reasoning Pro
                  │                     + Claude Sonnet 4.6 (gated by PRO_TIER_ALPHA)
                  │
                  ├── composer.compose() (ai/composer/compose.ts)
                  │       └── prompt + few-shots → JSON → render markdown
                  │
                  ├── formatComposerOutput (telegram/format.ts)
                  │       └── split into ≤3800-char Telegram parts
                  │
                  ├── bot.api.sendMessage  ────► delivered
                  │
                  ├── debitForDelivery (billing/debit.ts)
                  │       └── −N credits + INSERT transactions + cost-to-us snapshot
                  │
                  ├── autoHealDeliveryBroken (digest/run.ts)
                  │       └── flip users.state = active if was delivery_broken
                  │
                  └── UPDATE digest_runs SET status='delivered', ...

User taps inline feedback button on Telegram
                            │
                            ▼
      server/telegram/feedback-callback.ts → feedback_events row
                            │
                            ▼  weekly cron
      server/inngest/functions/weekly-distill.ts
                            └── ai/distill/distill.ts
                                  └── UPDATE users.distilled_prefs

      server/ai/composer/feedback-block.ts (called inside compose())
                  └── injects distilled_prefs + recent learning_log
                      into the next brief's system prompt
```

---

## `ai/`

LLM-touching code. Two main pipelines + provider abstraction.

### `ai/composer/`
Builds the actual brief.
- `compose.ts` — entry point. Builds prompt → calls Haiku → extracts JSON
  → validates against `briefJsonSchema` → renders markdown.
- `prompt.ts` — the v2 brief template, few-shots, and channel-neutral
  exemplar. Edit here to change brief voice; tests in
  `test/composer-prompt.test.ts` lock structural invariants.
- `schema.ts` — Zod schema for the JSON the composer emits. Citation
  parity is enforced here.
- `render.ts` — pure JSON → markdown renderer.
- `feedback-block.ts` — injects distilled prefs + recent /tune log into
  the system prompt.
- `types.ts` — `ComposerInput`, `ComposerSourcesBundle`.

### `ai/config-agent/`
The chat agent that captures the user's DigestSpec.
- `runtime.ts` — bridges descriptor tools into Vercel AI SDK `tool()` shape.
- `tools/` — `previewSpec`, `saveSpec`, `clarify`, etc. (descriptor pattern;
  no `@ai-sdk/*` imports → testable in isolation).
- `system-prompt.ts` — the agent's instructions. See also `prompts/config_agent_v1.md`.
- `save-spec.ts` — production-side `saveSpec` (mirrors `digestSpec.updateRaw`).
- `safe-execute.ts` — wraps tool calls with structured error envelopes
  so the agent's stream doesn't crash on a tool throw.
- `draft.ts` — chat-thread draft-spec persistence.
- Manage mode (see `chat/` below for the lifecycle): `manage-context.ts`
  (per-turn CURRENT BRIEF overlay + `specToDraft`), `update-spec.ts`
  (`updateSpecInPlace` — same spec id, version +1, NEVER imports cap
  code), `tools/send_sample.ts` + `tools/save_changes.ts`, and the
  second registry `manageAgentTools` (exact-keys eval-guarded; the
  setup registry stays byte-frozen). Separate prompt file
  `prompts/config_agent_manage_v1.md` keeps setup evals provably
  untouched.

### `ai/distill/`
Weekly aggregation of `learning_log` rows into terse `distilled_prefs`.
Same model as the composer (Haiku 4.5, temp 0.1). Pure prompt → JSON →
parse pipeline.

### `ai/providers/`
The tier abstraction layer. See README "Provider abstraction" for the rule:
**`getProviders(tier)` is the only call site for tier routing**.
- `index.ts` — entry point + `isProTierAlphaEnabled()` helper.
- `types.ts` — `SearchProvider`, `ComposerProvider`, `Tier`, `ProviderBundle`.
- `default.ts` — bundles Brave + RSS + scrapers + Haiku 4.5.
- `anthropic-pro.ts` + `anthropic-pro-prompt.ts` — Pro composer (Sonnet 4.6).
- `perplexity.ts` — Pro search (Sonar Reasoning Pro).

**To extend**: add a new provider module + new tier label in `types.ts`
+ switch arm in `index.ts`. See `CLAUDE.md` "How to add a new provider".

---

## `auth/`

- `admin.ts` — `isAdminEmail(email)` checks against `CADENCE_ADMIN_EMAILS`.
  Used by `adminProcedure` (`server/trpc/trpc.ts`) and admin layouts.
  No DB column for "role" yet; single-tenant prod keeps this simple.

---

## `billing/`

Credit accounting + cost circuit breaker. Two columns on `users`:
`credits_balance` (what the user owes/owns; integer, can briefly go to
−1 via the 1-brief grace credit) and `cost_to_us_micro_usd` (internal
margin metric, never shown to the user).

- `cost.ts` — `creditCostForTier(tier)` returns the per-brief credit
  charge (1 default, 3 pro). Also computes cost-to-us snapshots from
  the run's `cost_events`.
- `debit.ts` — pre-flight `shouldSkipForCredits` + post-delivery
  `debitForDelivery` (atomic UPDATE + INSERT in one transaction).
- `refund.ts` — `refundRun(digestRunId)`, called by `admin.refundRun`.
  Idempotent on (digest_run_id, type='refund').
- `packs.ts` — `PACKS` constant (single source of truth) +
  `TRIAL_CREDITS=3` + cost-to-us-per-credit constants.
- `circuit-breaker.ts` — `isProTierCostSane()` returns false when today's
  Pro cost-to-us exceeds the daily cap. Pre-flight gate so a runaway
  config can't drain monthly margin in an afternoon.
- `low-balance-footer.ts` — pure module: given `(creditsBalance, cadence)`,
  return a Telegram footer string or `null`.

**Extending billing**: NEVER write to `credits_balance` outside this module.
Adding a new transaction `type` requires both a new helper here AND a
matching `transactions.type` value (currently `charge | refund | grant | topup`).

---

## `chat/`

Thread lifecycle for the manage-mode wave (migration 0028; plan in
`proposals/brief-manage-mode-plan.md`).

- `thread-gate.ts` — `deriveThreadMode` + `resolveThreadGate`, the pure
  route-guard matrix `/api/chat` consumes verbatim
  (test: `test/manage-thread-gate.test.ts`).
- `manage-thread.ts` — `/chat` resolution + lazy-create (partial unique
  index + re-select on violation, Sentry breadcrumb on the race path).
- `manage-seed.ts` — `buildManageSeedSummary`, the two deterministic
  seed messages for lazy-created threads (banned-vocab unit-enforced).
- `manage-transcript.ts` — `capManageTranscript(messages, N=20)`,
  exec RC7. The per-turn CURRENT BRIEF overlay (not the transcript) is
  the load-bearing state; chat-turn `cost_events` rows are the monitor
  that per-turn input tokens stay flat as threads age.
- `telemetry.ts` — `manage_thread_resumed` / sample / edit event writes.

**Thread lifecycle (mode is DERIVED, never stored):**

- `chat_threads.spec_id IS NULL` → **setup** thread: the setup interview
  prompt + `configAgentTools` (byte-frozen registry, eval-gated).
- `chat_threads.spec_id IS NOT NULL` → **manage** thread: the manage
  prompt (`prompts/config_agent_manage_v1.md`) + `manageAgentTools`.
  After `confirm_and_save`, `onFinish` writes `spec_id` and the SAME
  thread becomes its brief's persistent manage thread — `status` stays
  `active` forever.
- `status='completed'` is **legacy-only**: no new code path writes it
  (flag-off restores the legacy write for unbound threads). Completed
  threads are never resumed; migration 0028 phase 2 (post-deploy)
  reactivates spec-bound ones.
- Kill switch (`MANAGE_MODE` off, exec RC5): the route 409s ANY
  spec-bound thread regardless of status and resolution skips them —
  a spec-bound thread must never fall through to the setup prompt
  (whose save path can archive-and-replace at cap).

**ON DELETE SET NULL tripwire (exec advisory 4):** `chat_threads.spec_id`
references `digest_specs(id) ON DELETE SET NULL`. Specs are archive-only
today, so this never fires — but if a future feature HARD-deletes a
`digest_specs` row, its manage thread silently degrades to a "setup"
thread (`spec_id` nulled, mode re-derives) while carrying the full manage
history, and the next `/api/chat` turn would serve it the setup
interview + `confirm_and_save`. Any hard-delete feature MUST also
archive (or delete) the bound chat thread in the same transaction.

---

## `connectors/`

Legacy search/RSS connectors. Most new code should go through
`server/sources/` instead.

- `brave-search.ts` — Brave Web Search wrapper with `source_cache`-backed
  daily cache. Used by the default search provider.
- `rss.ts` — legacy RSS poller (`recentRssForSpec`). Phase 6a moved
  curated-feed sourcing into `server/sources/rss/`; this remains as the
  default-provider entry point.

---

## `cost/record.ts`

Single emitter for `cost_events` rows. Every paid call (LLM, search, price)
must land here. Pricing tables are inline (USD per 1M tokens, USD per 1k
searches). Update when provider prices change.

Run-level cost rollup happens later by `SUM(cost_events.cost_usd)` over
`digest_run_id`.

---

## `cron/match.ts`

Pure tz-aware matcher: `shouldFireNow(zonedNow, spec)`. No DB, no `Date.now()`
— takes a `ZonedNow` and a spec, returns boolean. Tests in
`test/cron-match.test.ts` exhaustively cover DST jumps and weekly windows.

The dispatcher (`inngest/functions/cron-dispatch.ts`) is the only caller.

---

## `db/`

- `client.ts` — Drizzle + postgres-js singleton. Service role.
- `schema.ts` — every table, every column, with `// T-NNN` ticket refs.
  Read this file before designing any change.
- `migrations/NNNN_*.sql` — drizzle-kit-generated + hand-written RLS.
- `apply-NNNN.mjs` — per-migration runner with built-in verifier. The
  pattern: read SQL → run inside a transaction → assert post-state
  (column exists, constraint present, rows backfilled). Idempotent —
  safe to re-run.
- `seed-pricing-snapshots.mjs` — seeds the `pricing_snapshots` table
  from the `PACKS` constant. Idempotent on `(pack_id, effective_at)`.

---

## `digest/`

The brief pipeline.

- `run.ts` — `runDigestPipeline()`. The 893-line owner of the full flow.
  Both `digest.sampleNow` (manual) and `digestRunFn` (cron) call this.
  Read this top-to-bottom to understand the product.
- `errors.ts` — `sanitizeError(err)` (PII scrub) + `classifyError(err)`
  → `transient | permanent | unknown`. Drives retry behavior.
- `share.ts` — `briefPermalink(shortId)` — single source for `/b/<id>`.
- `sample-banner.ts` — prepends a "sample brief" banner the first time
  a user gets a brief from `sampleNow` post-link.
- `streak.ts` — pure quality-streak counter for the admin runs viewer.
- `sources/resolve.ts` — post-hoc URL resolvability check (basic
  grounding eval). HEAD then GET fallback.

---

## `email/`

- `send.ts` — minimal Resend HTTP client. No SDK dep. No-ops when
  `RESEND_API_KEY` is unset so dev/preview branches don't 500.
- `receipt-template.ts` — pure render. Wired only when Stripe lands.
- `refund-template.ts` — plain-text refund apology. Sent by `admin.refundRun`.

---

## `eval/` and `evals/`

Yes, two folders. Historical: `eval/` is the **feedback loop** evaluator;
`evals/` is the **Pro tier readiness gate**. Both produce signals into
`/admin/evals` and `/admin/feedback`.

- `eval/feedback-eval.ts` — weekly per-user health metrics over a rolling
  7-day window. Persists into `feedback_eval_runs`. Pure compute function
  + DB writer split for test isolation.
- `evals/pro-eval-gate.ts` — readiness verdict for flipping Pro tier to
  GA. Aggregates `digest_runs.metadata.manualRating` rows from the admin
  rate-brief UI. Observational only — does NOT flip flags.

---

## `inngest/`

- `client.ts` — single `inngest` client instance (`id: "cadence"`).
- `functions/`:
  - `cron-dispatch.ts` — every minute (`* * * * *`). The dispatcher.
  - `digest-run.ts` — `digest/run.scheduled` event handler. Retry policy.
  - `weekly-distill.ts` — Sunday cron. Aggregates `learning_log` → `distilled_prefs`.
  - `feedback-eval-cron.ts` — Sunday cron. Computes feedback eval metrics.
  - `rss-poll.ts` — pre-poll RSS to warm the cache.
  - `purge-soft-deleted-briefs.ts` — daily. Privacy: hard-deletes brief
    bodies for users soft-deleted >30d ago (security HIGH #4).
  - `smoke-summary.ts` — daily. Posts a "delivery layer alive?" summary.
  - `hello.ts` — registration smoke; not load-bearing.

---

## `observability/sentry-scrub.ts`

`beforeSend` hook for Sentry. Scrubs:
- Email addresses
- Telegram chat IDs / usernames
- User-content fields (`message.content`, `messages[].content`, etc.)
- Magic-link tokens

If you add a new sensitive field, extend the scrub list here AND add a
test fixture to `test/sentry-scrub.test.ts`.

---

## `rate-limit/check.ts`

Single-Postgres-roundtrip fixed-window rate limiter. UPSERT on
`(user_id, scope)`; CTE resets the window if stale, otherwise increments.

Currently used to gate `/api/chat` at 5 turns/minute per user (security
HIGH #2). Adding a new scope: pick a stable string (e.g. `chat`,
`spec_save`), call `checkRateLimit(userId, scope, limit, windowSeconds)`.

---

## `sources/`

Phase 6a free-data substrate. See README "Free data sources" for the
pattern overview.

- `types.ts` — locked `NormalizedSourceItem` Zod schema. THE contract
  every pattern returns.
- `index.ts` — `gatherSources(spec)` entry point. NEVER throws. Routes
  topic → RSS feeds + topic-conditional scrapers.
- `rss/`:
  - `feeds.ts` — 17 curated feeds with topic tags + `feedsForTopics()`.
  - `aggregate.ts` — parallel fetch via `rss-parser` with caps and SSRF guard.
- `scrape/`:
  - `playwright.ts` — Chromium launcher (`@sparticuz/chromium` in prod).
  - `scrapers/` — one file per source (MPOB, Bursa, Yahoo). Each
    returns `NormalizedSourceItem[]` and never throws.

**Extending**: add scraper / add feed — see CLAUDE.md sections.

---

## `supabase/`

Two clients with different trust profiles:
- `browser.ts` — `createSupabaseBrowserClient()`. RLS-enforced. Use in
  Client Components.
- `server.ts` — `createSupabaseServerClient()`. RLS-enforced (bound to
  the request's cookie). Use in Server Components, Route Handlers, tRPC
  context.

NOT a service-role client — that's `server/db/client.ts` (Drizzle).
Choose deliberately based on whether you want RLS to apply.

---

## `support/contact.ts`

Single `SUPPORT_EMAIL` constant. Every user-facing error/legal/account
surface routes here. Override via env `SUPPORT_EMAIL`.

---

## `telegram/`

- `client.ts` — grammY `Bot` singleton, lazy token read. Webhook-driven
  (no `bot.start()`).
- `dispatch.ts` — pattern-matches incoming `Update` payloads. Branches
  by message text / callback query type. Intentionally no grammY middleware.
- `format.ts` — pure markdown → ≤3800-char Telegram parts splitter.
- `feedback-callback.ts` — inline-keyboard vote recorder. Idempotent on
  `telegram_callback_id`.
- `keyboard.ts` — encodes vote into ≤64-byte `callback_data` (`fb:<vote>:<run_id>`).
- `link-token.ts` — 12-char Crockford base32 link tokens, 15-min TTL.
- `tune-command.ts` — `/tune <text>` handler → `learning_log` row.

---

## `trpc/`

- `root.ts` — index of every router. Append a new router here when adding one.
- `context.ts` — resolves the Supabase user from the request cookie.
- `trpc.ts` — `publicProcedure`, `protectedProcedure`, `adminProcedure`.
- `routers/` — one file per logical domain (account, admin, auth,
  billing, briefs, chat, digest, digestSpec, interest, learning,
  telegram).

---

## Module dependency rules

To keep the graph clean:

- `lib/` may NOT import from `server/`.
- `server/db/schema.ts` may NOT import from anywhere else in `server/`.
- `server/ai/providers/*` may NOT import from `server/digest/` —
  providers are leaf nodes; the pipeline orchestrates them, not the
  reverse.
- `app/` (App Router) may import from `server/` only in Server
  Components and Route Handlers. Client Components reach the server via
  tRPC.
- Tests under `test/` may import from anywhere.

If you find a cycle, the fix is usually to extract a pure type/schema
file into `lib/` or to invert a dependency by passing a value as a
function parameter instead of importing it.
