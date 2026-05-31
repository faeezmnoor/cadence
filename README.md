# Cadence

Periodical, self-learning market-research digests delivered to Telegram.
Configured via web chat. One-person ops, multi-tenant.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- tRPC v11
- Supabase Postgres (Singapore) + Supabase Auth (magic link via Resend)
- Drizzle ORM
- Inngest (background jobs + cron)
- Vercel AI SDK (composer = Claude Haiku; config agent = GPT-4o-mini)
- grammY (Telegram bot, webhook on Vercel)
- Fly.io Python sidecar (yfinance) — Phase 2

See `/docs` (mirrors `cadence/blueprint/`) for the full plan.

## Repo layout

```
cadence/
├── apps/
│   └── web/                # Next.js app
├── services/
│   └── prices/             # Python yfinance microservice (Phase 2)
└── docs/                   # mirrored blueprint
```

## Local dev

Prereqs: Node 20+, pnpm 9+.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local  # fill in keys
pnpm dev
```

## Scripts

- `pnpm dev` — run the web app
- `pnpm build` / `pnpm start` — production build/serve
- `pnpm typecheck` / `pnpm lint`
- `pnpm db:generate` — generate Drizzle migrations from schema changes
- `pnpm db:migrate` — apply migrations to the configured Postgres
