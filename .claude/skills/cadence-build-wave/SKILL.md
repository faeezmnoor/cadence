---
name: cadence-build-wave
description: Cadence vertical-slice build — schema → server → tRPC → UI → tests, one commit per stage. Use for a multi-ticket feature or any change with a DB migration (≥3 tickets or a schema change). NOT for single-file fixes (use cadence-fix-pass) or pure UI polish. Claude-Code-native port of the OpenClaw build-wave.
---

# Cadence Build Wave — schema → tRPC → page → tests

## When to use
A multi-ticket build with a vertical stack: DB migration → server logic → tRPC procedure → UI page → tests. Examples: a new source connector + UI, a Pro-tier change, a channel adapter. NOT for single-file fixes (`cadence-fix-pass`) or pure polish.

## Recipe (Claude Code on this Mac — single repo, no OpenClaw machinery)
1. **Stage 0 — orient.** Repo root is `/Users/faeez/dev/projects/cadence`; app is `apps/web`; run pnpm/git from the repo root. Read the approved `docs/plans/CAD-N.md`, `HANDOVER.md` §4 (stack) + §8 (runbook), and the Linear epic. Confirm green baseline: `git status` clean, `git pull --ff-only`, `pnpm typecheck`.
2. **Stage 1 — schema.** Edit `apps/web/server/db/schema.ts`. `pnpm db:generate`. Write `apps/web/server/db/apply-NNNN.mjs` (next sequential number — check the dir for the highest). Apply with the service-role key from `.env.local`: `node apps/web/server/db/apply-NNNN.mjs`. Commit + push.
3. **Stage 2 — server logic.** Add provider/source/composer/channel logic under `apps/web/server/<area>/`. Conform to existing interfaces (`Provider` in `providers/types.ts`, `NormalizedSourceItem` for sources, `ChannelAdapter` for channels). The owning Layer-II specialist writes this; unit tests in sibling `*.test.ts`. Commit + push.
4. **Stage 3 — tRPC procedure.** Add to the right router under `apps/web/server/trpc/`. Zod-validate inputs. Commit + push.
5. **Stage 4 — UI page.** Build under `apps/web/app/<route>/`. Server component preferred; `useChat`/`useQuery` only where streaming/interactivity needs it. shadcn primitives. (Pair with `cadence-designer` for user-facing work.) Commit + push.
6. **Stage 5 — tests + eval + verify.** `pnpm typecheck && pnpm lint && npx vitest run`. If the change touches a subsystem, run its golden set via `/cadence-eval` and record the **G-eval** delta. Watch the Vercel preview deploy to green.
7. **Stage 6 — close.** Hand to `cadence-bookkeeper` (Linear → Done, Notion mirror, `ticket-map.json`).

## Pitfalls
- NEVER edit an applied `apply-NNNN.mjs` — forward-fix only.
- pnpm 11 silent build skip — if native deps fail, check `pnpm-workspace.yaml` `allowBuilds`.
- Brave Search free tier is dead — no new Brave features without a Phase-6b exit plan.
- Wide commits / forgetting to push between stages. One stage = one commit; push after each.
- Don't edit `docs/*` numbered files (generated mirror).
