# AGENTS.md — Cadence
<!-- standard: 1.3.0 · tier: standard · ui: yes · db: yes · verified: 2026-10-06 -->
<!-- Budget 150 lines. Eight numbered sections plus this header line, this order. Concrete commands and paths; no tool-specific features (those go in CLAUDE.md or .claude/rules/). -->

## 1. What this is
Cadence is a periodical, self-learning market-research brief: the user configures it by chatting with an AI on the web and receives it in Telegram.
It is for small-business owners, operators and advisors who want their own researcher at a fraction of the cost (docs/product/brief.md).
Live: the web app on Vercel, Telegram delivery, the credit ledger. Not live: card checkout (Stripe). Advanced research is paused behind a flag.
What is live, next and blocked today: STATE.md.

## 2. Stack and commands
- Runtime: Node ≥ 20 (CI uses 22); pnpm 11.2.2 workspace. `apps/web`: Next.js 15, tRPC 11, Drizzle on Supabase Postgres, Inngest, grammY. `services/prices`: Python yfinance sidecar on Fly.io.
- Install: `pnpm install` · Dev: `pnpm dev` · Test: `pnpm test` · Typecheck: `pnpm typecheck` · Lint: `pnpm lint` · Build: `pnpm build` (needs apps/web/.env.local)
- One test file: `cd apps/web && npx vitest run test/<name>.test.ts`
- Migrations: `pnpm db:generate`, then a new runner `node apps/web/server/db/apply-NNNN.mjs` (docs/runbooks/apply-migration.md)
- Documentation lint: `bun .standard/standard-check.mjs .`
- Full verification (the gate for "done"): `pnpm typecheck && pnpm lint && pnpm test`

## 3. Read first, in this order (nothing else unless a brief cites it)
1. STATE.md — what is live, next and blocked
2. docs/README.md — where every fact lives
3. The current slice's docs/slices/<id>/brief.md

## 4. Boundaries
- Never: push to `main`, merge, deploy, force-push or `git reset --hard`; read `.env*` or print a secret value; call paid APIs (Anthropic, OpenAI, Perplexity, Brave, Telegram) outside a step the brief names.
- Never edit an applied `apps/web/server/db/apply-NNNN.mjs`; never `pnpm db:push` against production (lesson L-01, L-02).
- Generated, do not edit by hand: docs/architecture/schema.md, the generated blocks in docs/README.md, `apps/web/server/db/migrations/meta/`.
- Pinned, do not move: `prompts/` (read at runtime), the file names in docs/runbooks/ (cited by code and a test), apps/web/COPY_GUIDE.md (cited by code comments).
- Flag for review in the report: auth, credits and billing, secrets, row-level security, the Telegram webhook, admin routes, user-facing copy.
- Stay inside the task named in the brief. Report a needed scope change; do not make it.

## 5. Where facts live
- Current state: STATE.md · Owner items: docs/OWNER-QUEUE.md · Direction: docs/roadmap.md · Work items: Linear team CAD
- Product, pricing, glossary: docs/product/brief.md · Decisions: docs/decisions/ · Lessons: docs/lessons.md
- Architecture: docs/architecture/overview.md · Data model: docs/architecture/schema.md (generated) · Design tokens: DESIGN.md
- UI copy rules: apps/web/COPY_GUIDE.md · Operations: docs/runbooks/ · How work runs: docs/workflow.md
- Records (not reading): docs/records/, docs/_archive/

## 6. Working rules
- Migrations are forward-fix only: write a new `apply-NNNN.mjs`, never edit one; never `db:push` to production (lesson L-01, L-02)
- The Drizzle `db` client is the service role: filter every user-scoped query by user id (lesson L-03)
- Read flags only through `apps/web/lib/feature-flags.ts` (`isProTierAlpha()`, `isManageMode()`) (lesson L-04)
- Every paid call (LLM, search, price) records `cost_events` through `server/cost/record.ts` (lesson L-05)
- Write `digest_runs` rows only through `runDigestPipeline` in `server/digest/run.ts` (lesson L-06)
- Every public-by-link surface filters soft-deleted users (lesson L-07)
- tRPC never returns the service-role key, cost-to-us figures or another user's rows (lesson L-08)
- Refund amounts come from `resolveRefundAmount` in `server/billing/refund.ts`, never a fixed number (lesson L-14)
- `telegram_chat_id` stays unique: it is the trial-grant abuse fence (lesson L-10)
- Tests mock every network and LLM call; a live test is `.skip` with a note on when to enable it (lesson L-11)
- Change `pnpm-workspace.yaml` only on purpose: build approvals and security overrides live there (lesson L-09)
- No Brave-only feature without an exit plan; DuckDuckGo is the keyless fallback (lesson L-13; decision 0011)
- The user-facing noun is "brief" for the standing config and the delivered message; `digest_*` stays in code (decision 0003, 0005)
- "Cadence" is the brand noun: never genericise, translate or rename it (lesson L-21)
- Never "Pro" or "deep research" in user-facing text; Advanced sells specificity and fit, not better grounding (decision 0007, 0010)
- Lead with the value, never the channel: Telegram is a delivery detail (decision 0001)
- Credits only, no subscriptions: Standard 1 credit, Advanced 5; feedback and tune replies stay free (decision 0002, 0008)
- Advanced stays behind `PRO_TIER_ALPHA` until the eval gate clears `MIN_LEAD = 0.5` (decision 0009, 0012)
- A change to a pipeline subsystem reports a move-or-hold eval number (decision 0012)
- Paths holding private data, reading untrusted content and sending messages (the Telegram webhook) get the security review lane (lesson L-17)
- `prompts/` is read at runtime; `outputFileTracingIncludes` in apps/web/next.config.mjs must keep covering it (lesson L-19)
- Cadence and LiveWheel never mix: separate repos, Linear teams (CAD, LWL) and documents (lesson L-15)
- No secret value, person's name, e-mail or home path in a committed file; this repository is public (lesson L-16)
- Stage named paths; never `git add -A` or `--no-verify` (lesson L-20)
- If `pnpm test` hangs locally, diagnose with `cd apps/web && npx vitest run` (lesson L-12)

## 7. How work is done here
- Tier: standard. Workflow declaration: docs/workflow.md.
- Work is a slice in docs/slices/<id>-<slug>/ with a brief; Linear team CAD mirrors it; the repo wins on conflict.
- Branch from `main`. Merge only through a pull request whose CI jobs `check` and `standard-check` passed on that exact commit.
- Done means: the full verification command exits 0 at the final commit, and STATE.md is updated.

## 8. Repo map
- `apps/web/` — the Next.js app: `app/` routes, `components/`, `lib/` (shared; never imports `server/`), `server/` (pipeline, billing, AI, sources, tRPC, db), `test/` (Vitest), `scripts/` (smoke seeding, the Advanced bake-off)
- Busiest files: `apps/web/server/digest/run.ts` (the brief pipeline), `apps/web/server/db/schema.ts` (data model), `apps/web/components/chat/chat-client.tsx` (chat UI)
- `services/prices/` — Python yfinance price sidecar (Fly.io)
- `prompts/` — config-agent and extractor prompts, read at runtime
- `proposals/` — frozen design proposals cited by code comments
- `docs/` — documents; the map is docs/README.md
- `scripts/linear-status.sh` — sets a Linear issue state from the shell
- `cadence/blueprint/` — one sample brief kept from the old planning workspace
- `.standard/` — vendored documentation lint · `.claude/` — Claude Code settings, scoped rules, two specialists, one skill
- `.github/workflows/` — `ci.yml` (jobs `check` and `standard-check`), `db-backup.yml` (nightly database dump)
