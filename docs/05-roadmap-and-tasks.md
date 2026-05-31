# 05 — Roadmap, Phases & Engineering Task Backlog

> Sized for a solo founder with heavy AI-assisted dev (Claude Code / Cursor). Effort estimates are **calendar days at ~3 focused hrs/day** since this is a side project. Multiply by ~2x if context-switching from LiveWheel is heavy.

---

## Phase map

| Phase | Goal | Exit criteria | Calendar estimate |
|---|---|---|---|
| **P0** Foundation | Repo, CI, deploy, auth, empty DB online | `pnpm dev` works, prod URL loads, Supabase connected, magic-link auth works end-to-end | 3 days |
| **P1** Config wedge | Chat agent produces and persists a valid `DigestSpec` | Faeez can sign up, chat his way to a spec, view it | 4 days |
| **P2** Telegram link + manual digest | Link bot, manually trigger a one-shot digest to TG | "Send sample now" works for Faeez with a real palm-oil spec | 4 days |
| **P3** Scheduled delivery | Daily cron sends digests at user's local time | 14-day streak of Faeez receiving daily palm-oil brief | 3 days |
| **P4** Feedback loop | Buttons + `/tune` → next run reflects feedback | Faeez tunes 3+ times and sees behavior change | 3 days |
| **P5** Design partners | Onboard 5 commodity SMEs | 5 users on 14-day streak | 2 weeks (sales + iteration, not coding) |
| **P6** Monetize | First paid user | One Stripe / FPX charge clears | 3 days build + sales time |
| **v1.1** Languages | Malay + Chinese | All 3 langs in composer + UI | 2 days |
| **v1.2** WhatsApp | WA Cloud API channel | One paid user on WA | 1 week |

**MVP = P0–P4.** Target: shippable in ~17 focused-hour-equivalent days. Realistic side-project calendar: **3–4 weeks**.

---

## Phase 0 — Foundation (3 days)

**Goal:** scaffolding so Phase 1 can start writing product code.

- T-001 — Init monorepo (pnpm workspaces, `apps/web`, `services/prices`, `docs`)
- T-002 — Next.js 15 app scaffold (App Router, TS, Tailwind, shadcn/ui)
- T-003 — Vercel project + autodeploy from `main`
- T-004 — Supabase project (Singapore), Drizzle wired, first migration committed
- T-005 — Supabase Auth magic link (Resend SMTP)
- T-006 — tRPC v11 wired, `auth.me` query green
- T-007 — Inngest local dev + `/api/inngest` endpoint, "hello" function deployable
- T-008 — Axiom + Sentry hooked up
- T-009 — Drizzle schema for `users`, `telegram_link_tokens`, `digest_specs`, `digest_runs`, `feedback_events`, `learning_log`, `chat_threads`, `chat_messages`, `rss_items`, `source_cache`, `cost_events` — committed migrations
- T-010 — RLS policies on user-scoped tables
- T-011 — Repo CI: typecheck + lint on push (GitHub Actions)
- T-012 — `.env.example` + Doppler or Vercel env wired

## Phase 1 — Config wedge (4 days)

**Goal:** the moat. Chat → `DigestSpec`.

- T-101 — Landing page (one screen, one CTA: "Get your daily brief")
- T-102 — Auth flow UI (email entry → magic link sent → callback)
- T-103 — `/chat` page shell with streaming message UI (Vercel AI SDK `useChat`)
- T-104 — Config-agent system prompt v1 in `prompts/config_agent_v1.md`
- T-105 — Tool implementations: `propose_spec`, `update_spec_field`, `ask_user`, `confirm_and_save`, `add_rss_feed`
- T-106 — Zod schema for `DigestSpec` v1 (matches doc 04)
- T-107 — `chat.startThread` + `chat.sendMessage` tRPC routes
- T-108 — Persist thread + messages; resume on reload
- T-109 — `/spec` page: rendered summary card + raw-JSON editor with schema validation
- T-110 — `digestSpec.getCurrent`, `digestSpec.updateRaw`, `digestSpec.listVersions`
- T-111 — Eval harness: 5 hand-crafted user transcripts → assert produced spec passes Zod + matches snapshot fields

## Phase 2 — Telegram link + manual digest (4 days)

**Goal:** Faeez can press a button and get a real digest in TG.

- T-201 — Register Telegram bot (`@cadence_bot` or chosen handle), token in env
- T-202 — grammY webhook at `/api/telegram/webhook` with secret-token verification
- T-203 — `telegram.createLinkToken` mutation + `/start <token>` handler
- T-204 — Link status realtime UI (Supabase realtime or 2s polling)
- T-205 — Brave Search connector + cache layer (`source_cache` table)
- T-206 — Python yfinance microservice on Fly.io (`GET /price?symbols=...`)
- T-207 — RSS parser connector (`rss-parser`) + hourly Inngest poll
- T-208 — Composer LLM function (Claude Haiku via Vercel AI SDK)
- T-209 — Telegram message formatter (Markdown ≤ 3800 chars, auto-split if needed)
- T-210 — `digest.sampleNow` mutation → enqueue `digest.sample_now` Inngest event
- T-211 — `digest.run` Inngest handler (load spec → fetch sources → compose → send → log run + cost)
- T-212 — Cost tracking writes to `cost_events` per LLM/search call

## Phase 3 — Scheduled delivery (3 days)

**Goal:** daily cron at user's local time.

- T-301 — `cron/minute.tick` Inngest cron, scans `users` for due delivery (tz-aware via `date-fns-tz`)
- T-302 — Idempotency: unique `(user_id, run_date)` on `digest_runs`; skip if exists
- T-303 — Retry policy (3x exponential), permanent failure flags `state='delivery_broken'`
- T-304 — `/admin` route (email allowlist) listing last 100 runs + replay button
- T-305 — `admin.replayRun` re-runs composer with same `sources_bundle` snapshot
- T-306 — Manual smoke: schedule self, receive daily for 3 consecutive days

## Phase 4 — Feedback loop (3 days)

**Goal:** the self-learning promise becomes real.

- T-401 — Inline keyboard on delivered messages (👍 👎 🎯 🔍)
- T-402 — Callback query handler → write `feedback_events` row, ack < 1s
- T-403 — `/tune <text>` command handler → write `learning_log` row
- T-404 — Composer prompt injection: last 20 distilled + last 5 raw notes
- T-405 — `learning.distill` weekly Inngest function (Haiku call → ≤5 bullets → `users.distilled_prefs`)
- T-406 — Confirmation reply from bot after `/tune` echoing learned preference
- T-407 — Eval: simulate 5 tune commands, verify next composer call's prompt contains them

## Phase 5 — Design partners (2 weeks, mostly non-code)

- T-501 — Polish onboarding copy + landing
- T-502 — Build a "starter spec" library for 5 commodities (palm oil, chicken, wheat, cooking oil, CPO futures)
- T-503 — Recruit 5 commodity SMEs (validation interviews → onboard)
- T-504 — Weekly check-in template + retention dashboard (`admin.userCostThisMonth` + last-active)
- T-505 — Bug-fix queue from real usage

## Phase 6 — Monetize (3 days)

- T-601 — Stripe Checkout for SGD/MYR billing (or Billplz/Chip for local FPX)
- T-602 — `users.plan` + `subscriptions` table, webhook to flip plan
- T-603 — Paywall: free trial 14 days → require payment → grace 3 days → pause
- T-604 — Pricing page

## v1.1+ deferred

- T-V11-1 — Malay + Chinese composer prompts + UI strings
- T-V11-2 — Language detection in config agent
- T-V12-1 — WhatsApp Cloud API channel adapter (replaces Telegram delivery layer; reuse composer)
- T-V12-2 — Per-channel template approval workflow (WA quirk)

---

## Engineering task spec (template for Notion DB rows)

Each task below has: **id, title, phase, size, dependencies, acceptance**. Sizes: XS (<2h), S (2–4h), M (½ day), L (1 day), XL (2+ days).

| ID | Title | Phase | Size | Depends | Acceptance |
|---|---|---|---|---|---|
| T-001 | Init pnpm monorepo | P0 | S | — | `pnpm i` clean; `apps/web` + `services/prices` exist |
| T-002 | Next.js 15 + Tailwind + shadcn scaffold | P0 | M | T-001 | `/` renders, dark mode toggle works |
| T-003 | Vercel autodeploy from main | P0 | S | T-002 | push to main → prod URL updates |
| T-004 | Supabase project + Drizzle wired | P0 | M | T-001 | `pnpm db:push` creates `users` table |
| T-005 | Magic-link auth via Supabase + Resend | P0 | M | T-004 | sign in via email → session cookie set |
| T-006 | tRPC v11 + `auth.me` | P0 | S | T-005 | `auth.me` returns user JSON |
| T-007 | Inngest dev + `/api/inngest` registry | P0 | S | T-002 | "hello" function visible in Inngest dashboard |
| T-008 | Axiom + Sentry wired | P0 | S | T-002 | log + error visible in respective dashboards |
| T-009 | Drizzle schemas + migration for all MVP tables | P0 | L | T-004 | migration file committed; tables exist in Supabase |
| T-010 | RLS policies on user-scoped tables | P0 | M | T-009 | anon role cannot read other users' rows |
| T-011 | GitHub Actions: typecheck + lint | P0 | S | T-002 | PR check green |
| T-012 | `.env.example` + Vercel env setup | P0 | XS | T-002 | new clone can boot with documented vars |
| T-101 | Landing page | P1 | M | T-002 | one-screen hero + CTA, mobile responsive |
| T-102 | Auth UI flow | P1 | M | T-005 | email → magic link → app shell |
| T-103 | `/chat` streaming UI | P1 | M | T-102 | streams tokens via Vercel AI SDK |
| T-104 | Config-agent prompt v1 | P1 | M | — | committed in `prompts/`; documented |
| T-105 | Config-agent tools implemented | P1 | L | T-104, T-106 | all 5 tools callable, draft state in session |
| T-106 | `DigestSpec` Zod schema | P1 | S | — | schema parses doc-04 example; rejects invalid |
| T-107 | `chat.startThread` + `chat.sendMessage` | P1 | M | T-006, T-105 | thread persists; messages stored |
| T-108 | Thread resume on reload | P1 | S | T-107 | refresh page → conversation continues |
| T-109 | `/spec` view + raw editor | P1 | M | T-110 | summary card + JSON editor with validation |
| T-110 | `digestSpec.*` tRPC routes | P1 | S | T-106 | get/update/list-versions green |
| T-111 | Config-agent eval harness | P1 | M | T-105 | 5 transcript fixtures pass |
| T-201 | Register Telegram bot | P2 | XS | — | bot token in env; bot responds to `/start` |
| T-202 | grammY webhook + secret verification | P2 | M | T-201 | unsigned requests rejected |
| T-203 | Link token flow | P2 | M | T-202 | `/start <token>` links chat to user |
| T-204 | Link status realtime UI | P2 | S | T-203 | web shows "Linked ✓" within 5s |
| T-205 | Brave Search connector + cache | P2 | M | T-009 | query returns ≤20 deduped results; 2nd call hits cache |
| T-206 | yfinance Fly.io service | P2 | M | — | `GET /price?symbols=CPO=F,SDP.KL` returns JSON |
| T-207 | RSS connector + hourly Inngest poll | P2 | M | T-007 | items stored, deduped by guid |
| T-208 | Composer LLM function | P2 | L | T-104, T-106 | given spec+sources → Markdown ≤ 3800 chars |
| T-209 | Telegram formatter + splitter | P2 | S | T-208 | over-length messages split on section boundary |
| T-210 | `digest.sampleNow` mutation | P2 | S | T-211 | rate-limited 3/day; enqueues event |
| T-211 | `digest.run` Inngest handler | P2 | L | T-205,T-206,T-207,T-208 | end-to-end run produces TG message |
| T-212 | Cost tracking | P2 | S | T-211 | every call logs `cost_events` row |
| T-301 | tz-aware minute cron | P3 | M | T-211 | scans + fans out due users |
| T-302 | Run idempotency | P3 | S | T-301 | duplicate cron in same minute = 1 message |
| T-303 | Retry + `delivery_broken` flag | P3 | M | T-301 | 3 failures → flag flipped, no further attempts |
| T-304 | `/admin` runs viewer | P3 | M | T-211 | last 100 runs with status/cost |
| T-305 | `admin.replayRun` | P3 | S | T-304 | replays composer with snapshot |
| T-306 | 3-day self smoke | P3 | XS | T-301 | Faeez gets 3 daily briefs at 8am MYT |
| T-401 | Inline keyboard on messages | P4 | S | T-209 | every digest has 4 buttons |
| T-402 | Callback handler → `feedback_events` | P4 | S | T-401 | tap → row + ack toast |
| T-403 | `/tune` command | P4 | S | T-202 | text appended to `learning_log` |
| T-404 | Composer feedback injection | P4 | M | T-208,T-402,T-403 | next run's prompt contains recent notes |
| T-405 | Weekly distill function | P4 | M | T-404 | `distilled_prefs` ≤5 bullets after run |
| T-406 | Bot echo confirmation | P4 | XS | T-403 | bot replies "Got it: less crypto" |
| T-407 | Feedback eval | P4 | M | T-405 | synthetic feedback → prompt diff verified |

**Total MVP (P0–P4):** ~43 tasks. With AI-assisted dev, realistic at 3 hrs/day = ~3–4 weeks.

---

## Notion Engineering Backlog database — recommended schema

Create a new database under the Cadence root (don't reuse "Roadmap & Ideas" — that's for product ideas, not tickets):

- **Title** — title (e.g. `T-001 Init pnpm monorepo`)
- **Phase** — select: `P0 Foundation`, `P1 Config Wedge`, `P2 Telegram & Manual`, `P3 Scheduled`, `P4 Feedback`, `P5 Design Partners`, `P6 Monetize`, `v1.1`, `v1.2`
- **Status** — select: `Backlog`, `Ready`, `In Progress`, `In Review`, `Done`, `Blocked`
- **Size** — select: `XS`, `S`, `M`, `L`, `XL`
- **Area** — multi-select: `Frontend`, `Backend`, `DB`, `AI`, `Telegram`, `Infra`, `Ops`
- **Depends On** — relation (self) — for blocking dependencies
- **Acceptance** — rich text
- **Description** — rich text (body of page)

Alternative: drop these as rows into the existing **Roadmap & Ideas** database (data_source `f70798c8-0a87-48ec-9b48-bcd3c324dd05`), tagged so they don't collide with product-level ideas. **My recommendation: separate DB.** Engineering tickets and product ideas have different lifecycles; mixing them in one DB will make both worse within a month.
