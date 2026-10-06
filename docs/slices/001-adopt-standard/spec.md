<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 · budget: 300 lines -->
# 001 · adopt-standard — spec

Sources: $STANDARD_DIR/STANDARD.md §3 (lines 39–74), §4 (76–84), §6–§11 (90–204), §12 (206–222), §13 (224–232); $STANDARD_DIR/docs/lessons.md L-01–L-17. Facts are tagged (verified: how) or (inferred).

## Goal
Cadence is the first repository on the Standard tier with `UI: yes` and `DB: yes`. Every file the standard requires at that tier exists on its canonical path and the lint exits 0. No rule, decision or runbook step in the current documents is lost. The 18 local agents and 6 local skills shrink to two specialists and one project skill. The shared plugin roles take over only after the documents are on the canonical paths (runbook step 7).

## User stories (each independently testable)
- S1: As a fresh agent, I read AGENTS.md, CLAUDE.md, STATE.md, docs/README.md and the current slice brief, and I can say what is live, what is next and what waits on the owner, with no other file.
- S2: As the owner, I open one page (docs/OWNER-QUEUE.md) and see every open item that only I can do, most urgent first.
- S3: As a reviewer, I can trace every rule that lived in CLAUDE.md, AGENTS.md, HANDOVER.md, docs/AGENT_TEAM.md and apps/web/CLAUDE.md to exactly one new home, or to a recorded retirement with its reason.
- S4: As a builder of a later slice, I get the shared roles from the plugin and the Cadence-only knowledge from the two specialists, the project skill, the scoped rules and the overview.
- S5: As CI, I run `standard-check` on every pull request and it fails on a planted defect.

## Acceptance criteria
| Id | Criterion | Proven by |
| --- | --- | --- |
| AC-1 | The vendored lint exits 0 at the final commit | `bun .standard/standard-check.mjs .` exits 0 (gates G1) |
| AC-2 | The full verification command in AGENTS.md §2 exits 0 at the final commit | `pnpm typecheck && pnpm lint && pnpm test` exits 0 (G2). See Assumption A1: main is red today |
| AC-3 | The build command exits 0 | `pnpm build` exits 0 (G3) |
| AC-4 | No absolute home path in any committed document or agent file | G4 grep exits 0 |
| AC-5 | No owner name in any committed document, agent file or CI file (the repo is public) | G5 grep exits 0 |
| AC-6 | No 64-hex secret value in any committed document | G6 grep exits 0 |
| AC-7 | docs/architecture/schema.md exists, carries a `generated:` header, and a fresh run of the generator matches it | G7 and G8 |
| AC-8 | No file under .claude/agents/ is named like a shared role unless it is at most 40 lines; only the two specialists remain | G9 |
| AC-9 | No agent, skill, rule or settings file points at a missing path (Goal 6) | G10 path check |
| AC-10 | Retired paths are gone and their content is archived with an index row | G11 |
| AC-11 | Every decision 0000–0012 keeps its number and file name, has MADR frontmatter, and is ≤ 80 lines | G12 and the lint's B1 |
| AC-12 | Every runbook keeps its numbered steps; the Stripe runbook still satisfies its drift test | G13 (`apps/web/test/stripe-skus-runbook.test.ts`) and the reviewer's step diff |
| AC-13 | AGENTS.md has the header line plus eight numbered sections in order, ≤ 150 lines; CLAUDE.md starts `@AGENTS.md`, ≤ 20 lines | lint B1/B3 and G14 |
| AC-14 | The read-first chain is ≤ 600 lines | lint B5 |
| AC-15 | STATE.md is written from live code, CI and Linear; its verified line names the head commit and is the last change of the slice | G15 and reviewer check against `git log -1` and `gh run list` |
| AC-16 | The nothing-lost ledger in notes.md has one row per rule source line range, each with a home or a retirement reason | reviewer lane "correctness" samples ten rules (Goal 2) |
| AC-17 | CI has a job named `standard-check`; db-backup.yml is unchanged | G16 |
| AC-18 | The cold-start test passes and is recorded in STATE.md §Measurements | the cold-start skill run by the orchestrator (step 10) |
| AC-19 | Linear team CAD mirrors the repo: one issue for this slice, one per owner item | bookkeeper report at CLOSE (step 11) |

## The cold-start test (AC-18)
A fresh agent gets only AGENTS.md, CLAUDE.md, STATE.md, docs/README.md and this slice's brief.md. It answers three questions. The orchestrator checks each answer against STATE.md, docs/OWNER-QUEUE.md and Linear CAD on the day.
1. What is live? Expected shape: the web app on its Vercel URL; delivery to Telegram; credit ledger live and checkout not live; Advanced paused behind the flag.
2. What is next? Expected: the first rows of STATE.md §Next, matching Linear's open CAD issues by id.
3. What waits on the owner? Expected: the rows of docs/OWNER-QUEUE.md in order.
A wrong answer is a defect in STATE.md or docs/README.md, fixed in this slice.

## Nothing-lost checks (Goal 6)
Each source below is rehomed (runbook step 3) before any file is archived. The builder writes the ledger in notes.md: source path and line range → destination path and section, or "retired: reason". Source ranges (verified: read 2026-10-06):
- CLAUDE.md 7–29: skill routing, agent team, doc lifecycle, ratchet rule.
- AGENTS.md 8–36: commands, migration rules, conventions, boundaries, locked guardrails 1–6, sources of truth.
- HANDOVER.md §1 lines 25–29 ("three things"), §2 79–87 ("Positioning rules (locked)"), §8 311–380 (runbook how-tos), §12 490–522 ("Known pitfalls"). HANDOVER has no section named "Working rules"; §2 and §12 are its rule sections (verified).
- docs/AGENT_TEAM.md §3 96–116 (G-eval, operating principles), §4 gates 139–149, §7 181–191 (guardrails), §11 256–263 (pitfalls).
- apps/web/CLAUDE.md 51–153 (conventions, "Things NOT to do") and 203–223 (testing philosophy).
- The 18 agent bodies and 6 skill bodies under .claude/: any Cadence-specific rule (for example the security hot spots, the eval/evals directory distinction).
Further checks:
- Every decision keeps its number and file name; its body text is kept word for word under the MADR headings (only the frontmatter, headings and path-only links change).
- Every runbook keeps every numbered step and every command; new sections wrap the existing text.
- Every archived file has an index row in docs/_archive/index.md: original path, archived path, date, reason.
- Files replaced by the plugin are archived, not deleted, with the reason "retired, replaced by shared role X" or "retired, replaced by shared skill Y".

## AGENTS.md shape (AC-13)
Header comment line (section 0), then `## 1. What this is` through `## 8. Repo map`, in the order and budgets of STANDARD.md §6 (lines 94–104): 5, 15, 8, 15, 10, 25, 10, 15. Total ≤ 150 lines. Concrete commands and paths only; no Claude-only terms (slash commands, hooks, model names) — those go to CLAUDE.md or .claude/rules/. Every §6 rule is one line ending with (lesson L-NN) or (decision 00NN).

## STATE.md source rule (AC-15)
STATE.md is written from the live code (git log on main, the files), CI (`gh run list` for ci.yml and db-backup.yml) and Linear team CAD (open issues by state). It is never copied from HANDOVER.md, whose state is dated 2026-06-09 and partly stale (verified: it still describes a 3-credit "Pro" tier that decisions 0006, 0008 and 0010 retired). Facts known today (verified 2026-10-06):
- main head 352b2e4 (2026-08-18); no open pull requests.
- CI on main has failed since 2026-08-18: one test, `test/searcher-registry.test.ts` "migration 0028 CHECK + apply runner cover every registered id", opens `0028_digest_specs_searcher.sql`, which exists as `0031_digest_specs_searcher.sql`. Typecheck and lint passed in the same run.
- The scheduled DB backup has failed daily since at least 2026-10-01 because the `DATABASE_URL` Actions secret is not set.
- main has no branch protection.
- The repository is public on GitHub (verified: `gh repo view` → PUBLIC), not private as the dispatch stated.

## Edge cases
- gen-schema is not merged when the builder reaches step 6 → stop and report; never hand-write schema.md.
- The Drizzle adapter reads apps/web/server/db/schema.ts, but row-level-security policies live in SQL migrations (`0001_rls_policies.sql`, `0003_lock_shared_tables.sql`, `0019_…_rls.sql`). If the generated "Policies and roles" section says none were found, the builder records it as a finding for the standard repo and does not hand-edit the generated file.
- A file moved to docs/_archive/ contains an absolute home path, the owner's name or address, or a secret value → see Open question OQ-3 in brief.md; the lint's H1 walks every file under docs/ including the archive (verified: scripts/lib/hygiene.ts lines 7–12).
- A code file cites a moved document → path-only update in comments only (three files listed in plan.md); a path inside a runtime string is not changed and is reported.
- Upstream commits reach main during the build → rebase immediately before the PR and carry any change to a moved document into its new home (L-16).
- `pnpm test` hangs locally → run `cd apps/web && npx vitest run` to diagnose; the gate still runs the AGENTS.md §2 command (CI runs `pnpm test --run` without hanging, verified in the 2026-08-18 run log).

## Assumptions
- A1: AC-2 cannot pass until the stale migration path in `apps/web/test/searcher-registry.test.ts` is fixed; that is a code change, out of this slice's scope (verified by a local run, 1 failed of 12). Ruling needed: OQ-1.
- A2: The plugin is installed at user scope, so step 7 needs no per-project enablement (inferred from the user plugin registry naming house-standard).
- A3: The builder can read Linear team CAD, or the orchestrator passes an export of open CAD issues in the dispatch (inferred; OQ-4).
- A4: `pnpm build` needs environment values present locally in apps/web/.env.local; Vercel's preview build of the PR head is the fallback evidence (inferred; OQ-6).
- A5: Decision statuses map as plan.md states; 0005 becomes `accepted` because its text decides "brief stays" (inferred).
- A6: The standard version written in the declaration is the content of $STANDARD_DIR/VERSION on the day the builder starts (1.1.2 today, verified).

## Flows cited
None. docs/product/flows.md is not required at Standard tier with UI yes (STANDARD.md §3 line 72; lint UI_FILES in scripts/lib/structure.ts line 11, verified).

## Measurable outcome
`bun .standard/standard-check.mjs .` exits 0 on the merged head, with the read-first chain ≤ 600 lines and two files in .claude/agents/.

## Out of scope
- Application code, tests, data and migrations (the one failing test included; see OQ-1). Path-only comment updates in three files are the only code-tree edits.
- Scheduled workflows: db-backup.yml is not touched.
- The nested `cadence/blueprint/`, `prompts/` and `proposals/` folders, `services/prices/` and `scripts/`: classified in docs/README.md, not moved or edited. `prompts/` is read at runtime (verified: apps/web/next.config.mjs line 13).
- Rotating secrets, renaming the Telegram bot, setting Actions secrets, branch-protection calls that need admin rights: owner or orchestrator actions, listed in docs/OWNER-QUEUE.md or the plan.
- The public README's product copy (portfolio standard); only path-only link fixes.
- docs/product/flows.md, docs/design/, code-map.md (Full tier only).
