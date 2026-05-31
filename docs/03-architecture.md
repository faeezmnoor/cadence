# 03 — Architecture & Tech Stack

> **Bias:** solo founder, AI-assisted dev, fastest path to MVP, low fixed cost, future scalability. No infra Faeez can't operate alone.

## TL;DR — the stack (locked decisions)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript** | One framework, SSR + API routes, fastest AI-assisted dev. |
| UI | **Tailwind + shadcn/ui** | Minimal design lift, copy-paste components. |
| Backend | **Next.js Route Handlers + tRPC** | Type-safe end-to-end, no separate API server. |
| DB | **Supabase Postgres** (Singapore region) | Managed Postgres, RLS, free tier, scales to product-market fit. |
| Auth | **Supabase Auth (magic link)** | Built in; one less thing to ship. |
| ORM | **Drizzle ORM** | TypeScript-first, fast, lean. Beats Prisma for solo. |
| Background jobs | **Inngest** (free tier) OR **Trigger.dev** | Durable, retries, cron — no Redis to babysit. Default: **Inngest**. |
| LLM gateway | **Vercel AI SDK** (server) with provider switch | One API for OpenAI/Anthropic/Google; easy A/B. |
| Models | Composer: **Claude Haiku 4** (cost). Config agent: **GPT-4o-mini** (function-calling polish). | Cheap + capable. Re-evaluate quarterly. |
| Search API | **Brave Search API** (free tier 2k/mo) → **Perplexity** if exhausted | Cheap, no scraping. |
| Stock/commodity | **yfinance** via tiny Python microservice on Fly.io, OR **Twelve Data** free tier | yfinance is free but unofficial; Twelve Data is paid-ready. Start yfinance. |
| RSS | Native parsing via `rss-parser` (npm) | Trivial. |
| Telegram | **grammY** (TS Telegram framework) | Modern, typed, good DX. |
| Hosting (web + API) | **Vercel** | Zero-ops; Next.js native. |
| Hosting (workers) | Inngest cloud (managed) | No server to manage. |
| Hosting (Python yfinance) | **Fly.io** machine (256MB) | $0–3/mo. |
| Observability | **Axiom** (free 500GB) + **Sentry** | Structured logs + errors. |
| Email (magic link) | **Resend** | Cheap, dev-friendly. |
| Secrets | Vercel env + Doppler (optional) | Built-in. |
| Repo | Single repo, monorepo not needed at MVP | Solo-founder rule: one repo until pain. |
| Package manager | **pnpm** | Fast, deterministic. |
| Lang | TypeScript everywhere except yfinance microservice (Python). | Consistency. |

## Why not …

- **Why not Convex / Cloudflare D1 / Turso?** Postgres has the deepest tooling, RLS we'll want for multi-tenant, and Supabase gives auth + storage + realtime free. One vendor, three problems solved.
- **Why not Bun/Hono?** Next.js + Vercel is the lowest-friction full-stack for solo TS work. Bun stack saves cents per month, costs hours per week.
- **Why not LangChain / LlamaIndex?** Overhead for a single composer call. Vercel AI SDK + a few well-typed functions wins.
- **Why not Prisma?** Drizzle is faster, lighter, and its SQL-first model maps better to the kind of one-off queries we'll write.
- **Why not Temporal?** Massive overkill. Inngest is "Temporal-lite for indie hackers" and handles cron + retries.
- **Why not your own VPS?** Faeez has one job: ship the wedge. Operating a VPS is a 5%-improvement-for-50%-of-the-time trade. Reject.
- **Why not WhatsApp first?** Validation memory says users prefer WA, but WhatsApp Cloud API requires Meta approval and templated messages for outbound. Telegram has a bot in 10 minutes. Ship Telegram, learn, then earn the right to do WA properly.

## System diagram (ASCII)

```
┌──────────────────────────────────────────────────────────────────┐
│                       cadence.app (Vercel)                       │
│  ┌────────────────────────┐    ┌──────────────────────────────┐ │
│  │  Next.js (App Router)  │    │   tRPC routes (server)       │ │
│  │  - landing             │◄──►│   - auth, digestSpec, chat   │ │
│  │  - chat UI             │    │   - telegram-link, admin     │ │
│  │  - spec editor         │    └──────┬───────────────────────┘ │
│  │  - settings            │           │                         │
│  └────────────────────────┘           │                         │
└─────────────────────────────────┬─────┼─────────────────────────┘
                                  │     │
                                  ▼     ▼
                       ┌──────────────────────┐
                       │   Supabase Postgres  │  ← single source of truth
                       │   (Singapore)        │
                       │   + Supabase Auth    │
                       └──────────┬───────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
       ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
       │   Inngest    │  │  Telegram    │  │  yfinance svc    │
       │  - cron      │  │   bot        │  │  (Fly.io, py)    │
       │  - composer  │  │  (grammY,    │  │                  │
       │  - distill   │  │   webhook to │  │                  │
       │  - retries   │  │   Vercel)    │  │                  │
       └──────┬───────┘  └──────┬───────┘  └──────────────────┘
              │                 │
              ▼                 ▼
       ┌──────────────┐  ┌──────────────┐
       │   LLM APIs   │  │  Brave/      │
       │   Anthropic, │  │  Perplexity  │
       │   OpenAI     │  │  Search API  │
       └──────────────┘  └──────────────┘
```

## Request flows

### Daily digest generation
1. Inngest cron triggers every minute → scans `users` for `delivery_time_local` == now in tz.
2. For each due user, enqueues `digest.run` event with `user_id`.
3. `digest.run` handler (Inngest function):
   1. Load `DigestSpec`, `LearningLog` distilled set, source list.
   2. In parallel: query Brave search, fetch prices (yfinance svc), parse RSS items.
   3. Compose via Vercel AI SDK → Claude Haiku.
   4. Format Telegram markdown.
   5. POST to Telegram Bot API; store `digest_runs` row.
4. On failure: Inngest retries 3x, then writes failure row + Sentry event.

### Telegram inbound (button or /tune)
1. Telegram → webhook to `/api/telegram/webhook` (Next.js Route Handler) → grammY router.
2. Route to handler:
   - Callback query → insert `feedback_events` row, ack.
   - `/tune <text>` → insert into `learning_log`, reply confirmation.
   - `/start <token>` → resolve linkage token → set `telegram_chat_id`.
   - `/sample` / `/pause` / `/resume` → state mutations.

### Web chat configuration
1. User opens `/chat` → tRPC `chat.message` mutation per user turn.
2. Server: append to thread, call config agent with tools `proposeDigestSpec`, `updateField`, `confirm`.
3. On `confirm` tool call → write new `digest_specs` row (versioned), return summary.

## Per-layer responsibilities

### Frontend (Next.js + Tailwind + shadcn)
- Landing page (one screen, one CTA).
- Auth via Supabase magic link.
- `/chat` — conversational config UI (streaming responses via Vercel AI SDK).
- `/spec` — spec card + raw JSON editor.
- `/settings` — Telegram link status, pause/resume, delete.
- `/admin` — Faeez-only run inspector (route-gated by email allowlist).

### Backend (tRPC routes inside Next.js)
- `auth.*` (mostly delegates to Supabase).
- `digestSpec.get / update / list-versions`.
- `chat.message` (streams agent responses).
- `telegram.createLinkToken`.
- `digest.sampleNow`.
- `admin.listRuns / replayRun`.

### Database (Supabase Postgres)
- See doc 04 for schema.
- RLS policies: user can only read/write own rows.
- Service role used by Inngest workers.

### AI/LLM pipeline
- **Config agent** — GPT-4o-mini with tool-calling. System prompt versioned in `prompts/config_agent_vN.md`.
- **Composer** — Claude Haiku 4. System prompt = base + tone preset + distilled learning + last 5 raw notes.
- **Distiller** — Claude Haiku 4, weekly job, condenses raw notes into ≤5 stable prefs.
- All prompts checked into repo under `/prompts` and version-tagged.

### Telegram integration
- grammY bot deployed as Vercel webhook endpoint.
- Outbound = HTTP POST from Inngest workers using bot token.
- Inbound = webhook → Next.js route → grammY handler.
- Bot token in Vercel env.

### Background jobs (Inngest)
- `cron.scheduler` — every minute.
- `digest.run` — per-user composition + delivery.
- `learning.distill` — weekly per user.
- `rss.poll` — hourly across all RSS feeds.
- `source.cache.gc` — daily TTL cleanup.

## Cost model (back-of-envelope, 100 users)

| Item | Daily | Monthly @ 100 users |
|---|---|---|
| Composer LLM (Haiku, ~4k input + 1k output) | ~$0.008/user | ~$24 |
| Search API (Brave free 2k/mo across users via cache) | $0 | $0 (until exhausted, then ~$3/mo Brave) |
| yfinance svc (Fly.io) | — | $3 |
| Vercel | — | $0 (hobby until paid; Pro $20 when needed) |
| Supabase | — | $0 (free tier covers MVP) |
| Inngest | — | $0 (free 50k steps) |
| Sentry / Axiom | — | $0 |
| **Total at 100 users** | | **~$30/mo** |

If we charge $9/mo and convert 10% of 100 = 10 paid users = $90/mo. **Gross-margin positive from user #4.** That's the unit-economics promise.

## Repo layout

```
cadence/
├── apps/
│   └── web/                  # Next.js app (the only app at MVP)
│       ├── app/
│       │   ├── (marketing)/
│       │   ├── (app)/chat/
│       │   ├── (app)/spec/
│       │   ├── (app)/settings/
│       │   ├── (admin)/
│       │   └── api/
│       │       ├── trpc/[trpc]/
│       │       └── telegram/webhook/
│       ├── components/
│       ├── server/
│       │   ├── trpc/
│       │   ├── db/ (drizzle schema + client)
│       │   ├── inngest/ (functions)
│       │   ├── llm/ (composer, config-agent, distiller)
│       │   ├── connectors/ (search, prices, rss)
│       │   └── telegram/ (bot, formatter)
│       └── prompts/
├── services/
│   └── prices/               # tiny Python yfinance svc
├── docs/                     # mirror of blueprint, source of truth in repo
├── pnpm-workspace.yaml
└── README.md
```

Monorepo via pnpm workspaces purely to keep the Python svc co-located. No Turbo needed at this size.

## Deployment

- **web**: Vercel, autodeploy from `main`.
- **prices**: Fly.io, `fly deploy` from `services/prices/`.
- **Inngest functions**: live inside `apps/web/server/inngest/` — Inngest auto-discovers via `/api/inngest` endpoint.
- **DB migrations**: Drizzle Kit, committed migration files, run via Vercel build hook OR manually via `pnpm db:migrate` against Supabase.

## Environments

- `local` — local Next.js, Supabase local stack via Docker, Inngest Dev Server, ngrok for Telegram webhook.
- `prod` — Vercel + Supabase prod project + Inngest cloud + Fly prices svc.
- **No staging** at MVP. Solo founder, one prod, fast rollback via Vercel preview deployments.
