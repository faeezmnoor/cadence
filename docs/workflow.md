<!-- layer: knowledge · status: living (by decision) · verified: 2026-10-06 · budget: 120 lines -->
# Workflow — Cadence

Tier: standard. UI: yes. DB: yes. The generic contract (stages, roles, review, gates, model tiers) is the house standard; this file declares only what is specific here.

## Cast
- Shared roles enabled: planner, builder, reviewer, challenger, qa, designer, debugger, bookkeeper, search.
  - challenger before any production data change (migration, credit grant at scale, backfill);
  - designer and qa when a screen or the delivered brief's layout changes.
- Specialists (.claude/agents/):
  - cadence-eval-quality — golden sets, judge calibration, the G-eval verdict for pipeline subsystem changes.
  - cadence-security — security lane on auth and sessions, credits and the ledger, secrets and environment variables, row-level security, the Telegram webhook, bring-your-own keys, admin routes. Server areas without a subsystem owner (`server/{billing,auth,cost,email,support}`) always take this lane.
- Overrides: none.
- Project skill: cadence-eval (.claude/skills/cadence-eval/SKILL.md) — runs or extends a golden set and prints the metric delta.
- Path-scoped rules: .claude/rules/web-app.md and one file per pipeline subsystem (docs/architecture/overview.md "Subsystems").

## Project facts shared agents read
- Verification command: `pnpm typecheck && pnpm lint && pnpm test`
- Build: `pnpm build` (needs apps/web/.env.local; otherwise the Vercel preview build of the pull-request head is the evidence).
- Runtime checks: the Vercel preview deployment of the pull-request head at the declared viewports; Telegram delivery via docs/runbooks/SMOKE.md. Core flows that must not regress: chat configuration → spec save → Telegram link → sample brief.
- Viewports: 360×800 and 1440×900 (DESIGN.md "Layout").
- Navigation paths: `apps/web/app/**` (flows.md is a Full-tier file; Standard records flows F-01 to F-04 in docs/architecture/overview.md).
- User-facing string paths: `apps/web/app/**/*.tsx`, `apps/web/components/**/*.tsx`, Telegram message text in `apps/web/server/**` — copy rules in apps/web/COPY_GUIDE.md.
- References file for shared skills: none.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`), one logical change per commit.
- Evidence first: before changing a pipeline subsystem's approach, research the state of the art and the provider's documentation and cite them in the slice plan.

## Project stages and gates
- G-eval: a change to any pipeline subsystem (overview "Subsystems" 1–9) reports its golden-set metric, baseline and new value; it must move or hold before VERIFY (decision 0012). Run by cadence-eval-quality with the cadence-eval skill; evidence in the slice's notes.md.
- Advanced release gate: Advanced stays behind `PRO_TIER_ALPHA` until the composite lead is at least `MIN_LEAD = 0.5` with at least five blinded ratings per arm in a trailing 7-day window (`apps/web/server/evals/pro-eval-gate.ts`; decisions 0009, 0012). The owner's ratings are final; the LLM judge stays log-only until validated.
- Dogfood bar: 14 consecutive clean daily briefs before public signup opens (CAD-209).
- Security lane: required on the paths listed under the cadence-security specialist.

## Tracking
- Linear team: CAD (`CAD-<n>`); the repo wins on conflict and the bookkeeper fixes Linear in the same run.
- Notion: none.
