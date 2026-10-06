<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 · budget: 200 lines -->
# 001 · adopt-standard — brief (context pack)
Source: spec.md, plan.md, tasks.md, gates.md in this folder; $STANDARD_DIR/STANDARD.md §3–§13; $STANDARD_DIR/docs/lessons.md L-01–L-17. Tier A (Opus): first Standard-tier migration in a public repository, with a secret value and personal data to keep out of every new file. Stack: Next.js 15, tRPC 11, Drizzle on Supabase Postgres, pnpm 11; UI yes, DB yes.

Goal: every file the standard requires at Standard tier with UI and DB yes exists on its canonical path and `bun .standard/standard-check.mjs .` exits 0; no rule, decision or runbook step is lost; the 18 agents and 6 skills shrink to two specialists and one project skill, after the documents are on canonical paths.
In scope: tasks T001–T061 in tasks.md (documents, .claude/, .gitignore lines for .claude, one CI job, path-only comment fixes in three code files).
Out of scope: application code, tests, data, migrations; db-backup.yml; moving or editing cadence/blueprint/, prompts/, proposals/, services/prices/, scripts/; pushing, opening the PR, branch protection, Linear writes (orchestrator and bookkeeper).
Stop if: gen-schema is not on the standard repo's main at T040; a ruling on OQ-3 or OQ-4 is missing at T002; a gate other than G2 or G3 fails twice after a documents-only fix; any step would change application code beyond the three named comments; you find a secret value other than the known webhook secret.

## Rules that apply (copied in, with source)
- No person's name, e-mail or absolute home path in any committed file; use repo-relative paths or `$STANDARD_DIR` (STANDARD.md §3 line 72; §12 line 210 H1; lessons L-05, L-09). The repository is PUBLIC (verified: `gh repo view`, 2026-10-06), so this covers docs/_archive/ and .claude/ too.
- Never copy the Telegram webhook secret value, the Supabase project ref, the bot handle or personal data into any new file. Rotation is an owner item.
- Rehome every rule before archiving its source (§13 step 3, line 228; Risks held, line 232).
- Move, never delete: `docs/_archive/2026-10/<original path>` with a row in docs/_archive/index.md (original path, archived to, date, reason) (§12 line 214). Only files the plan names as replaced by the plugin are retired, and they are archived, not deleted, with reason "retired, replaced by shared role X" or "… shared skill Y".
- STATE.md is written from the live code, CI and Linear, never from a handover (§13 step 4). Its verified line is written last, naming the head it describes (L-10). Leave §Measurements to the orchestrator (L-13).
- Path-only link updates in README.md, docs and code comments are in scope; runtime strings are not (§13 step 5; L-12).
- AGENTS.md: the header line plus eight numbered sections, ≤ 150 lines, one-line rules with a lesson or decision link, no Claude-only terms (§6 lines 92–106; L-06).
- CLAUDE.md: line 1 `@AGENTS.md`, ≤ 20 lines (§6 line 108). New rule files carry a `paths:` filter, so unscoped rules stay at 0 lines (§6 line 108; chain budget).
- Generated files are never hand-written or hand-edited (§9 lines 153–156).
- The CI lint job is `name: standard-check` (L-15); report-only jobs exit 0 with a `::warning`, never `continue-on-error` (L-07).
- Gates read the exit code, never the last line of piped output (L-17). Run every gate command once by hand.
- Builder never reviews its own work, never pushes, deploys or merges; stage named paths, never `git add -A`; one commit per task ($STANDARD_DIR/agents/builder.md).
- Commits end with the attribution line the orchestrator gives in the dispatch.

## Approved wording
- None. User-facing product copy is not changed in this slice.

## Files to read (only these)
- $STANDARD_DIR/STANDARD.md lines 39–74 (map), 90–112 (entry file), 114–124 (state), 126–147 (planning), 149–162 (technical), 164–176 (design), 178–204 (agents), 206–222 (hygiene), 224–232 (migration)
- $STANDARD_DIR/templates/: AGENTS.md, CLAUDE.md, STATE.md, DESIGN.md, docs/README.md, docs/OWNER-QUEUE.md, docs/roadmap.md, docs/workflow.md, docs/inbox.md, docs/lessons.md, docs/product/brief.md, docs/architecture/overview.md, docs/decisions/_template.md, docs/runbooks/_template.md, docs/_archive/index.md, .claude/rules/README.md, .github-ci-minimal.yml lines 16–22
- This folder: spec.md, plan.md, tasks.md, gates.md
- CLAUDE.md 1–29; AGENTS.md 1–36; README.md 85–105
- HANDOVER.md 11–31, 32–109, 110–189 (stale; redraw from code), 233–262, 311–380, 382–417, 418–449 (names of services and env vars only), 450–488, 490–522
- docs/AGENT_TEAM.md 22–41, 96–116, 139–149, 181–191, 243–263
- apps/web/CLAUDE.md 19–50, 51–153, 154–202, 203–223
- apps/web/server/ARCHITECTURE.md 9–75, then the module sections by the ranges in plan.md, 414–430
- docs/decisions/0000–0012 (all, 14–17 lines each); docs/roadmap.md 1–20; docs/runbooks/*.md (all); apps/web/test/stripe-skus-runbook.test.ts 18–50
- .claude/agents/*.md frontmatter and "How you work"; .claude/skills/cadence-eval/SKILL.md; .claude/settings.json; .gitignore 45–49; .github/workflows/ci.yml
- Code, to verify facts you write: package.json 6–21; apps/web/package.json 5–17; apps/web/drizzle.config.ts; apps/web/server/billing/packs.ts 20–50; apps/web/app/globals.css 1–70; apps/web/tailwind.config.ts 55–100; apps/web/lib/feature-flags.ts; apps/web/server/digest/run.ts (refund fallback, by grep); apps/web/next.config.mjs 10–16
- Live sources for STATE.md: `git log origin/main`, `gh run list --workflow ci.yml`, `gh run list --workflow db-backup.yml`, Linear team CAD open issues

## Carry-overs from earlier migrations ($STANDARD_DIR/docs/lessons.md)
- L-04: UI and DB add files by tier: at Standard, DESIGN.md and schema.md only; no flows.md, no docs/design/.
- L-05, L-09: no home paths or names in committed files, review records included; describe a probe, never quote it.
- L-06: "eight numbered sections plus the header line".
- L-07: report-only CI via `::warning`.
- L-08: run the AGENTS.md §2 verification command as a gate (G2).
- L-10: STATE.md verified line last. L-11: records and archive files carry the header comment too.
- L-12: path-only link updates are in scope. L-13: Measurements are the orchestrator's.
- L-14: template lines marked "Standard tier and up" apply here (Standard).
- L-15: protection contexts use display names; read them from the first run.
- L-16: rebase immediately before the PR and carry upstream changes to moved files (orchestrator, T062).
- L-17: read the result anywhere, by exit code.

## Decisions already made (do not reopen)
- Tier standard, UI yes, DB yes (slice stub; STANDARD.md §4 line 81).
- Specialists kept: cadence-eval-quality and cadence-security (STANDARD.md §11 line 196); project skill kept: cadence-eval. Every other agent and skill is archived per plan.md.
- Verification command: `pnpm typecheck && pnpm lint && pnpm test` (dispatch; CI runs `pnpm test --run`, verified). The older "never `pnpm test`, it hangs" line becomes a lesson with the local fallback `cd apps/web && npx vitest run` (inferred).
- Linear team CAD; Notion none (STANDARD.md §7 line 124).
- Decisions keep their numbers and file names; pricing facts follow decisions 0006, 0008, 0010 and apps/web/server/billing/packs.ts, never HANDOVER §6 or §9.
- Runbook file names stay as they are (code and a test cite them), although the map prefers lower case under docs/ (inferred; reported for LEARN).
- apps/web/COPY_GUIDE.md stays in place as the UI-copy home (code comments cite its sections).
- DESIGN.md phase one mirrors today's tokens; debts are recorded, not fixed.
- The schema comes only from the generator.

## Open questions (for the orchestrator; rule before the builder starts)
- OQ-1 CI on main is red: `apps/web/test/searcher-registry.test.ts` opens `0028_digest_specs_searcher.sql`, which exists as `0031_…` (verified locally: 1 failed of 12). G2 cannot pass without a code change. Options: (a) a separate fix PR merged first; (b) allow this one-line test path fix in this slice as a named exception; (c) merge with G2 red and protect only `standard-check`. Recommended: (a).
- OQ-2 The decision template writes the owner's name in `decision-makers`; §12 bans owner names in public repos. Recommended: `owner (ruled by owner)` here and a template fix at LEARN.
- OQ-3 Archived copies (HANDOVER, agents, skills, the workflow script, apps/web/CLAUDE.md) contain absolute home paths (lint H1 walks docs/_archive/), the owner's name and e-mail, and the webhook secret value. Options: (a) redact in the archived copy (paths → `<repo>/` or `<old-workspace>/`; name → "the owner"; e-mail, secret, bot handle → `[redacted]`) and say so in the index reason; (b) keep verbatim and change the standard to exempt the archive from H1 and the name check. Recommended: (a); git history still holds the originals, so the owner must rotate the secret either way.
- OQ-4 Who reads Linear CAD for STATE.md and the roadmap: the builder through Linear read tools, or the orchestrator through an export (id, title, state, assignee) in the dispatch? Recommended: the export.
- OQ-5 §1 says public repos hold no internal queues, yet Standard tier requires docs/OWNER-QUEUE.md. Recommended: keep the file with neutral action wording and Linear links, no names; raise the conflict at LEARN.
- OQ-6 `pnpm build` may need environment values; if it fails only for that, is the Vercel preview build of the PR head acceptable evidence for G3? Recommended: yes, recorded in notes.md.
- OQ-7 Archiving `.claude/skills/*/SKILL.md` under `docs/_archive/2026-10/.claude/…` keeps them discoverable as directory-scoped skills (inferred from how nested `.claude/skills` folders are listed). Recommended: archive under `docs/_archive/2026-10/_claude/…` and keep the original path in the index row; G11 and T050 then use `_claude`.
- OQ-8 The dispatch called the repository private; it is public. Confirm that public-repo rules (§12 Hygiene) apply in full.

## Report
Fixed format, under 300 words: Verdict · Commits · Gates met/total · Findings · Decisions I made (verified/inferred) · Needs the owner.

## Orchestrator rulings (6 October 2026; the builder does not reopen these)
- OQ-1: (a). A separate slice 002-fix-ci lands first and makes CI green on main; this slice rebases onto it before its PR (L-16). G2 stays as written.
- OQ-2: `decision-makers: the owner (ruled by owner)` and `the orchestrator`; roles, never names (standard template updated).
- OQ-3: (a). Redact in every archived copy: home paths → `<repo>/` or `<old-workspace>/`; the owner's name → "the owner"; e-mail, secret values, bot handles → `[redacted]`; say "redacted for publication" in the index reason. The owner is asked to rotate the Telegram webhook secret (owner queue item, urgent). History is never rewritten.
- OQ-4: the export below is the Linear source for STATE.md and the roadmap; the builder reads no Linear tools.
- OQ-5: docs/OWNER-QUEUE.md exists with generic wording, Linear issue ids allowed, no URLs and no names; decision-page links live in the standard repo's private registry.
- OQ-6: (b). If `pnpm build` fails only for missing environment values, the Vercel preview build of the PR head is the evidence for G3; record it in notes.md with the deployment URL's status, not the URL.
- OQ-7: archive under `docs/_archive/2026-10/_claude/…`; G11 and T050 use `_claude`.
- OQ-8: confirmed public; §12 Hygiene applies in full, including G4–G6 over docs/_archive/ and .claude/.
- Owner queue items this slice must write (generic wording): rotate the Telegram webhook secret that appeared in a committed document; set the `DATABASE_URL` Actions secret so the nightly database backup (db-backup.yml) stops failing; decide the four In Progress Linear issues below that have had no update since June.

## Linear CAD export (6 October 2026, read by the orchestrator)
In Progress (started), none assigned, last updated June 2026: CAD-222 "[W3] Pro integrity bake-off → tier decision"; CAD-210 "Platform Audit 2026-06-11 — 3-wave ship plan (epic)"; CAD-216 "[W1] Nightly pg_dump of ledger + specs (offsite)"; CAD-215 "[W1] Credit bridge + Advanced tier pause".
Todo (unstarted), 18 issues: CAD-228 web-search providers (High); CAD-122 to CAD-130 Phase 6a/6b free data sources (epic CAD-123); CAD-70 to CAD-77 config-agent and composer tasks (CAD-70, 71, 72 Urgent; 73–76 High; 77 Medium).
No issues in Review or Done were exported; the roadmap's Now reads from the four In Progress items and the handover's shipped list is NOT a source (stale).
