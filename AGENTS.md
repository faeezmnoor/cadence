# AGENTS.md — Cadence

Tool-agnostic instructions for any AI coding agent. Claude Code reads this via `@AGENTS.md` in `CLAUDE.md`; Codex/Cursor/openclaude read it natively. Keep this lean — retrieve detail just-in-time from the linked docs.

## What Cadence is
A periodical, self-learning market-research **brief**, configured by chatting with an AI on the web and delivered to Telegram (WhatsApp next). The moat is two surfaces only: the **chat-config wedge** and the **self-learning loop** — not the data, not the channel. One-liner: *"Your own market researcher at a fraction of the cost."* Separate from **LiveWheel** — never mix.

## Stack & commands (run from repo root or `apps/web`)
- pnpm monorepo, Node ≥20. `apps/web`: Next.js 15 + tRPC v11 + Drizzle (Supabase Postgres). `services/prices`: Python yfinance (Fly.io).
- `pnpm dev` · `pnpm build` · `pnpm typecheck`. Tests: `cd apps/web && npx vitest run` — **NOT** `pnpm test` (can hang).
- DB migrations: idempotent `apps/web/server/db/apply-NNNN.mjs` runners. **Never edit an applied migration** (forward-fix only). Never `pnpm db:push` against prod.

## Repo map (where to look)
- `apps/web/` — the app. Read first: `server/db/schema.ts`, `server/digest/run.ts`, `server/ai/`. Deep map: `apps/web/server/ARCHITECTURE.md`.
- `docs/decisions/` — ADRs (the **why**; canonical decision record). `docs/plans/` — per-ticket plans (+ `_archive/`). `docs/runbooks/` — deploy/smoke/telegram/stripe ops. `docs/AGENT_TEAM.md` — how the agent team works.
- `prompts/` — versioned prompt source-of-record. `apps/web/COPY_GUIDE.md` — copy/voice/banned terms (every user-facing string obeys it).

## Conventions
- TypeScript ESM, `@/*` path alias. Drizzle from `@/server/db/client`; tRPC `protectedProcedure`/`adminProcedure` + Zod `.input()`.
- **Conventional Commits** (`feat:`/`fix:`/`docs:`/`chore:`/`refactor:`…). One logical change per commit. No `git add -A`, no `--no-verify`.
- Branch off `main`; never push to `main` directly. SHIP is human-gated.

## Boundaries
- ✅ **Always:** read code/docs, run typecheck/tests, write plans & ADRs, branch + commit.
- ⚠️ **Ask / flag for review:** schema & migrations, billing/credits, auth/RLS, the Telegram webhook, and any user-facing copy.
- 🚫 **Never:** push to `main`; edit an applied `apply-NNNN.mjs`; `db:push` to prod; ship without human SHIP; mix LiveWheel; sell Advanced as "deep research".

## Locked guardrails (the *why* is in `docs/decisions/`)
1. **Terminology** — `digest_*` in code; **"a brief"** in UI (names both the standing config and the delivered artifact). The "watch" rename is **rejected**. "Cadence" is a sacred brand noun. (ADR 0003, 0005)
2. **Positioning** — lead with the value prop, never the channel. (ADR 0001)
3. **Monetization** — pre-paid credits only, no subscriptions, **no "Pro"/"deep research"** in any user-facing form. Modes: **Standard (1cr) / Advanced (5cr) / Custom**. (ADR 0006, 0008, 0010)
4. **Advanced tier** — sells **specificity + fit, not grounding**; stays behind `PRO_TIER_ALPHA` until the eval gate (`MIN_LEAD = 0.5`) clears. (ADR 0007, 0009, 0012)
5. **Evidence-first** — research-and-cite before recommending on the 9 subsystems; no architecture-from-memory.
6. **Security** — sub-agents that touch private data + untrusted content + external comms hit Willison's "lethal trifecta" — require a human checkpoint (e.g. the Telegram webhook path).

## Sources of truth (on conflict, code/Linear win)
Work → **Linear** (`CAD-`). Strategy/PRDs → **Notion** "📡 Startup - Cadence". Decisions → **`docs/decisions/`**. Architecture → **`apps/web/server/ARCHITECTURE.md`**. Live state → **`HANDOVER.md`** (auto-regenerated at CLOSE).
