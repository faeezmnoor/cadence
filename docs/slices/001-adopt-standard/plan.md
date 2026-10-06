<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 · budget: 200 lines -->
# 001 · adopt-standard — plan

## Approach
Run STANDARD.md §13's thirteen steps (lines 228) in order on branch slice/001-adopt-standard. Rehome every rule before archiving any file (step 3). Write canonical files from $STANDARD_DIR/templates. Move, never delete: superseded files go to `docs/_archive/2026-10/<original path>` with an index row; historical evidence (audits, draft plans, proposals of record) goes to `docs/records/`. Agents switch to the plugin only after the documents sit on canonical paths (step 7). "A" = archive, "R" = records, "K" = keep in place. Facts verified by reading on 2026-10-06 unless tagged (inferred).

## Disposition table — documents
| Path (lines) | Destination | Reason |
| --- | --- | --- |
| AGENTS.md (37) | Rewritten from template in place; content rehomed per the rule table below | Entry file, §6 shape |
| CLAUDE.md (29) | Rewritten: `@AGENTS.md` + ≤ 19 Claude-only lines (skill routing); old text to A | §6 "what stays out" |
| README.md (105) | K; path-only fix at line 88 (`docs/` line lists plans) | Public face; portfolio standard |
| CHANGELOG.md (16) | K; add records header; existing Unreleased block kept as a dated entry "2026-06-19"; slice entry added at CLOSE | Standard tier file |
| HANDOVER.md (524) | Split per the section table below, then A (retired path, lint S2) | §7 "HANDOVER.md is retired" |
| PLATFORM-AUDIT-2026-06-11.md (66) | R: docs/records/audits/platform-audit-2026-06-11.md; its §D founder asks checked against Linear for the owner queue | Dated proposal, evidence |
| docs/AGENT_TEAM.md (263) | Split per the agent table below, then A | Retired path (§3 line 74) |
| docs/roadmap.md (20) | Rewritten from template from Linear CAD; old to A | 30-line STATE file |
| docs/decisions/0000–0012 (13 files) | K, converted to MADR in place (decision table below) | Numbers and names kept |
| docs/plans/_TEMPLATE.md (39) | A | Replaced by slice templates |
| docs/plans/_archive/README.md (10) | A | Replaced by docs/records/slices/ |
| docs/plans/eval-harness-upgrade.md (211) | R: docs/records/plans/eval-harness-upgrade.md; roadmap "Later" row CAD-238 cites it; path-only fix in decision 0012 | Unapproved draft epic plan |
| docs/runbooks/DEPLOY.md, SMOKE.md, TELEGRAM_BOT_SETUP.md, gbrain.md, stripe-skus-v2.md | K at the same paths and names; header added; six sections wrap the existing text; steps unchanged | Code and a test cite these paths |
| docs/screenshots/*.png (4) | K; classified "README assets" in docs/README.md | Public README embeds them |
| apps/web/server/ARCHITECTURE.md (430) | Cut into docs/architecture/overview.md (cut plan below), then A | One home for architecture |
| apps/web/CLAUDE.md (223) | Rules → .claude/rules/web-app.md (`paths: apps/web/**`) and AGENTS.md §6; navigation table → overview; then A | Nested instruction file is not in the map |
| apps/web/COPY_GUIDE.md (154) | K (pinned: code comments cite "COPY_GUIDE §n"); docs/README.md names it the home for UI copy rules; brief glossary links its §4–§5 | Moving breaks citations |
| apps/web/COPY_FIXES_PROPOSED.md (68) | R: docs/records/copy/copy-fixes-proposed-2026-06-11.md | Proposed backlog of record (inferred: not owner work) |
| apps/web/README.md (362) | K; path-only fixes at lines 13, 102, 360–362 | Package README |
| apps/web/scripts/PRO-BAKEOFF.md (124) | K (pinned beside its script); classified in docs/README.md | Script documentation |
| services/prices/README.md (29) | K; classified | Package README; its "deferred" status is checked in the overview debts |
| cadence/blueprint/, prompts/, proposals/ | K; classified in docs/README.md (sample artifact; runtime prompts read by next.config.mjs; frozen design proposals cited by code comments) | Out of scope beyond classification |
| scripts/linear-status.sh | K; listed in AGENTS.md §8 | Script |

## HANDOVER.md split (section → home)
| Section (lines) | Home |
| --- | --- |
| Header 1–9, §1 TL;DR 11–31 | State facts → STATE.md (re-verified from code/CI/Linear, never copied); "three things" 25–29 → AGENTS.md §1 and §6 (nested-repo line retired: dead machine) |
| §2 Product overview 32–88 | docs/product/brief.md: who, job, promise, anti-positioning → non-goals; positioning rules 79–87 → decision 0001 already holds them; AGENTS.md §6 one-liner |
| §3 Personas 89–109 | brief "Who it is for" (anchor ICPs 1–3, not-for 7–9), ≤ 20 lines |
| §4 Stack and architecture 110–189 | overview containers and flows, rebuilt from code; the Mermaid block 138–158 is stale (Pro, Perplexity) and is redrawn, not copied; stack line → AGENTS.md §2 |
| §5 State 190–232 | STATE.md from live sources only; history stays in the archive |
| §6 Monetisation 233–262 | brief "How it earns its keep": pack table from apps/web/server/billing/packs.ts with display names from decision 0010; credit costs from 0008; launch gates G1–G7 → open ones to OWNER-QUEUE or STATE |
| §7 Open questions 264–310 | Archive only; a question still open in Linear becomes an owner row |
| §8 Runbook 311–380 | apply-migration, grant-credits, advanced-flag, stuck-user → new docs/runbooks/*.md (commands re-verified against code, home paths removed); rollback → DEPLOY.md §Rollback; dev how-tos (template, RSS, scraper, provider) → .claude/rules/web-app.md; admin dashboards → overview cross-cutting |
| §9 Glossary 382–417 | brief glossary, corrected to decisions 0003/0005/0006/0010 (no "Pro tier"), ≤ 30 lines |
| §10 People and accounts 418–449 | Service names and env-var names → overview "Configuration and secrets"; Linear team → docs/workflow.md; personal data, the bot handle and the secret value → nowhere |
| §11 What to ship next 450–488 | docs/roadmap.md and OWNER-QUEUE.md, re-verified against Linear |
| §12 Known pitfalls 490–522 | docs/lessons.md entries plus AGENTS.md §6 one-liners (rule table below) |

## Rule rehome (summary; the line-level ledger goes in notes.md)
- AGENTS.md §6 one-liners, each with a lesson or decision: migrations forward-fix only; never `db:push` to production; Drizzle `db` is service role, filter by user id; read the Advanced flag only via `isProTierAlpha()`; LLM paths write `cost_events`; digest rows only via `runDigestPipeline`; public-by-link surfaces filter soft-deleted users; tRPC never returns service-role key, cost-to-us or others' rows; "brief" never "digest"/"watch" (0003, 0005); never "Pro"/"deep research", Advanced sells specificity and fit (0007, 0010); value prop before channel (0001); credits only, feedback free (0002, 0008); Advanced behind flag until MIN_LEAD 0.5 (0009, 0012); subsystem changes carry a move-or-hold eval number (0012); Telegram webhook and other private-data plus untrusted-input paths get the security lane; Cadence and LiveWheel never mix; leave `pnpm-workspace.yaml` onlyBuiltDependencies alone; `telegram_chat_id` uniqueness is the trial-abuse fence; tests mock network and LLM calls; no Brave-only feature without an exit plan; no `git add -A` or `--no-verify`. The Advanced fallback refund amount is verified in apps/web/server/digest/run.ts before it is written (the handover's "2 of 3" predates 0008).
- .claude/rules/web-app.md (scoped): Drizzle, tRPC, error-classification, logging, import and testing conventions; module dependency rules (ARCHITECTURE.md 414–430); dev how-tos.
- Retired with a reason in the ledger: nested-repo path (dead machine); Notion status-type and CLI rules, Notion index sync (Notion is not machinery, STANDARD.md §7 line 124); compaction-model, gateway-install and "status?" shortcut rules (old harness, not this repo; inferred); ticket-map.json rules (file absent); "docs/* numbered files are a mirror" (none exist); HANDOVER regeneration, CLOSE automation and ratchet rule (replaced by the bookkeeping and improve skills and docs/lessons.md); skill map, file manifest, collaboration sections (replaced by the deliver skill).
- Owner-queue rows (verified against Linear before writing): Stripe MY KYC; Advanced eval ratings; dogfood streak CAD-209; set the `DATABASE_URL` Actions secret (backup red); rotate the Telegram webhook secret, which sits in HANDOVER.md in a public repo; verify Sentry DSN in production; Supabase point-in-time recovery before paid users; rename the bot before launch; refund policy text (G7).

## Agents (18) and skills (6)
| File | Disposition |
| --- | --- |
| cadence-eval-quality.md, cadence-security.md | Stay as specialists (STANDARD.md §11 line 196); rewrite context lines to live paths (no AGENT_TEAM, HANDOVER or home path); owner name → "the owner"; ≤ 80 lines |
| cadence-research-search, -retrieval-consolidation, -llm-composer, -multi-llm-provider, -channels-delivery, -content-format, -self-learning, -agent-harness | One row each in the overview's subsystem table (code area, metrics, golden set); Cadence-specific working rules → `.claude/rules/<subsystem>.md` with `paths:` on the code area; file to A |
| cadence-architect | A; "retired, replaced by shared role planner" |
| cadence-builder, -reviewer, -bookkeeper, -debugger, -designer, -qa | A; "retired, replaced by shared role <same name>" |
| cadence-cofounder | A; "retired, replaced by the shared deliver skill (orchestrator) and STATE.md" |
| skills/cadence-eval | Stays (project pipeline: G-eval); fix its AGENT_TEAM reference to docs/workflow.md and the overview; owner name → "the owner" |
| skills/cadence-deliver, -bookkeeping, -build-wave, -fix-pass, -handover | A; "retired, replaced by shared skill deliver / bookkeeping / build-wave / fix-pass / cold-start" |
| workflows/cadence-deliver.js | A (records layer); replaced by the deliver skill |
| Archive path for .claude content | `docs/_archive/2026-10/.claude/…` per §12, or `_claude/…` if OQ-7 is ruled (keeps archived skills from being discovered) |
| settings.json (untracked; .gitignore line 46 ignores `.claude/*`) | Reduced to permissions (add `pnpm lint`, `pnpm test`, the lint command); SessionStart echo removed (cites retired paths); add `!.claude/settings.json` and `!.claude/rules/` to .gitignore so both are committed |
| launch.json (ignored) | Untouched |

## Decisions → MADR
Frontmatter: status, date (first date in the file), decision-makers. Body headings: "Context and problem statement" (old Context), "Considered options" (only options the text names; else "Not recorded when ruled."), "Decision outcome" (old Decision, verbatim), "Consequences" (verbatim). The `notion: D-NNN` line becomes one body line "Former id: D-NNN (retired Notion log)". Statuses (inferred from text): 0000–0004, 0006–0012 `accepted`; 0005 `accepted` (it decides "brief" stays; the reversed proposal is named in Considered options). Partial amendments (0002 by 0006/0008; 0009 by 0012) stay `accepted` with the existing text. decision-makers: `owner (ruled by owner)` pending OQ-2. Path-only fix: 0012's plan link → docs/records/plans/.

## ARCHITECTURE.md → overview.md cut (≤ 300 lines)
Survives, rewritten into the template sections: "End-to-end data flow" 9–75 → Key runtime flows as Mermaid sequenceDiagrams F-01 daily brief run, F-02 chat configuration, F-03 Telegram link, F-04 feedback and weekly distill (≤ 60 lines); module headings 76–413 → Containers table plus a "where code lives" table, one line per server module (≤ 50); auth 132–139, cost 228–238, observability 322–334, rate-limit 335–345, inngest 306–321 → Cross-cutting (≤ 50); db 249–263 → Data in words, linking schema.md (≤ 20). Added: the nine-subsystem table (from AGENT_TEAM §1 22–41), environments (DEPLOY.md, vercel.json, Fly.io, Inngest), constraints and debts (CI red test, backup secret, PITR off, Brave grandfathered key, pure-white surface token, system fonts). Moves: dependency rules 414–430 → .claude/rules/web-app.md; per-module prose → stays in the archived copy. Code-comment path fixes: apps/web/server/db/schema.ts line 10, apps/web/lib/research-stack.ts line 101, apps/web/scripts/seed-smoke-spec.mjs line 25.

## DESIGN.md phase one (UI yes)
Frontmatter mirrors today's tokens, not new ones: colors from apps/web/app/globals.css lines 7–39 (light) with the dark values noted in prose (43–65); `brand` 14 72% 45%; radius 0.5rem with md and sm offsets (tailwind.config.ts 63–67); typography: system sans body, serif display stack (tailwind.config.ts 74–84); motion from keyframes and animation (85–97). Prose in Google DESIGN.md order (STANDARD.md §10 line 166). Do's and don'ts record the two debts (pure-white background token; no loaded typeface) as "change only by decision". Viewports declared in Layout: 390×844 and 1440×900 (inferred). The builder lists in notes.md each frontmatter value beside its source line (equality check by hand until a token generator exists).

## Schema
`bun run $STANDARD_DIR/scripts/gen-schema.ts .` writes docs/architecture/schema.md. If slice 005's generator is not on the standard repo's main when the builder reaches T-schema: stop and report. Never hand-write it. Also run gen-decision-index and gen-roster if merged; otherwise leave the template markers.

## docs/workflow.md declaration
Tier standard. Shared roles enabled: planner, builder, reviewer, challenger, qa, designer, debugger, bookkeeper, search (challenger before production data changes; designer and qa when a screen changes; inferred). Specialists: cadence-eval-quality (G-eval verdict), cadence-security (security lane on auth, credits, secrets, RLS, the webhook, admin). Overrides: none. Verification: `pnpm typecheck && pnpm lint && pnpm test`. Runtime checks: Vercel preview of the PR head at the declared viewports; Telegram delivery via docs/runbooks/SMOKE.md. Project gates: G-eval (cadence-eval skill), the Advanced release gate (MIN_LEAD and the dogfood bar). References file: none. Linear team CAD. Notion: none.

## CI and branch protection
Add a job to .github/workflows/ci.yml with `name: standard-check`, Bun set up, running `bun .standard/standard-check.mjs .` (L-15). The existing job's display name is `check` (ci.yml line 9, no `name:`). db-backup.yml untouched. After the first PR run, read the job names from it, then the orchestrator (admin rights) protects main with contexts `check` and `standard-check`. Protecting `check` while main's test is red blocks every merge: sequence with OQ-1.

## Risks and pre-mortem
- Linear CAD reconciliation needs Linear reads; the roadmap's ids (CAD-233, -209, -222, -235–238) are dated 2026-06-19 → read Linear first; repo wins on conflict, bookkeeper fixes Linear (step 11).
- HANDOVER's dead-machine paths and home-path lines → never copied; archived copies redacted per OQ-3 or H1 fails.
- Stale pricing: decisions 0006, 0008, 0010 win over HANDOVER §6 and §9 (Pro tier, 3 credits, "Pro pack").
- Public repo: the webhook secret value and personal data are in HANDOVER.md today and in history → owner rotates; nothing new repeats them (G6).
- Odd folders: `cadence/blueprint/` is a one-file remnant of the old outer workspace; `.gstack/` is ignored; `prompts/` is runtime input → classify only.
- A test reads docs/runbooks/stripe-skus-v2.md → its strings survive the reshape (G13).
- Read-first chain: AGENTS 150 + CLAUDE 20 + STATE 80 + docs/README 100 + brief ≤ 150 + unscoped rules 0 → every new rule file is `paths:`-scoped.
- Generated schema may omit RLS policies held in SQL migrations → finding to the standard repo, not a hand edit.

## Review lanes
Correctness (nothing-lost ledger, ten sampled rules, decision text diff, runbook step diff, dead paths) and security and privacy (no secret, no personal data, public-repo hygiene). Reviewer did not do the moves.

## Step order (STANDARD.md §13)
1 Freeze: no open PRs (verified); no bot commits on main. 2 Inventory: this table against `git ls-files`. 3 Rehome. 4 Canonical files (STATE.md last). 5 Moves and path-only fixes. 6 Generators and the vendored lint. 7 Agents and skills. 8 Settings. 9 CI job; rebase onto origin/main immediately before the PR (L-16); PR; read job names; protection. 10 Cold-start. 11 Linear. 12 CLOSE: verified line last (L-10); slice folder to docs/records/slices/ after merge. 13 LEARN in the standard repo (orchestrator).

## Gate ledger skeleton
See gates.md (G1–G17), written before any move.
