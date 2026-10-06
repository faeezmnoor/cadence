<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 -->
# 001 · adopt-standard — notes

## T001 Freeze
- `gh pr list --state open`: empty (verified 2026-10-06).
- origin/main head after `git fetch origin`: 001508c "Fix CI: locate the searcher migration by suffix, not sequence number (#51)", 2026-10-06. The plan named 352b2e4; slice 002-fix-ci (test path fix plus the dependency security patches) merged on top of it the same day (verified: `git log origin/main`). This branch is rebased onto 001508c.

## T002 Preconditions
- Standard VERSION: 1.2.2 (verified: `$STANDARD_DIR/VERSION`). The vendored bundle `.standard/standard-check.mjs` is byte-identical to `$STANDARD_DIR/dist/standard-check.mjs` and carries `standard-check-version: 1.2.2` (verified: `cmp`, `head -3`). The declaration uses 1.2.2, not the 1.1.2 that spec.md A6 recorded.
- `$STANDARD_DIR/scripts/gen-schema.ts` exists on the standard repo's main (verified: merged in d12412f, "005 generators").
- Linear source: the orchestrator's export (brief.md "Linear CAD export" and linear-export.md); the builder read no Linear tools (ruling OQ-4).
- Orchestrator rulings copied from brief.md "Orchestrator rulings":
  - OQ-1 (a): slice 002-fix-ci lands first and makes main green; G2 unchanged. Status: merged as 001508c; CI on main green (run 37481884290, verified).
  - OQ-2: `decision-makers: the owner (ruled by owner)` and `the orchestrator`; roles, never names.
  - OQ-3 (a): redact archived copies (home paths → `<repo>/` or `<old-workspace>/`; the owner's name → "the owner"; e-mail, secret values, bot handles → `[redacted]`); index reason says "redacted for publication"; owner rotates the webhook secret; history never rewritten.
  - OQ-4: the export is the Linear source.
  - OQ-5: docs/OWNER-QUEUE.md with generic wording, Linear ids allowed, no URLs, no names.
  - OQ-6 (b): if `pnpm build` fails only for missing environment values, the Vercel preview of the PR head is G3's evidence.
  - OQ-7: archive `.claude` content under `docs/_archive/2026-10/_claude/…`.
  - OQ-8: public; §12 Hygiene applies in full.

## T003 Inventory (tracked files not in plan.md's disposition table)
| Path | Disposition | Reason |
| --- | --- | --- |
| docs/slices/002-fix-ci/ (brief, gates, notes) | K, untouched | Merged slice; its move to docs/records/slices/ is that slice's CLOSE (bookkeeper), not this slice |
| docs/records/reviews/002-fix-ci.md | K, untouched; indexed in docs/records/index.md | Review record of slice 002 |
| docs/slices/001-adopt-standard/linear-export.md | K; header layer changed records → knowledge | Lint S4: slice files are knowledge while open |
| .standard/standard-check.mjs, .standard/VERSION | K | Vendored lint 1.2.2 (commit f474ecc) |
| .github/workflows/db-backup.yml | K, untouched | Out of scope by dispatch |
| scripts/linear-status.sh, vercel.json, .env.example, .npmrc, pnpm-workspace.yaml | K | Code and config; listed in AGENTS.md §8 where useful |
| LICENSE (absent) | none | Lint S1 WARN only. The repository is deliberately all-rights-reserved (inferred from the owner's portfolio notes); a LICENSE file stating that is an owner decision, reported, not added |

## T009 Nothing-lost ledger
Source line numbers are those of the original files at 001508c (archived copies carry one extra header line). "Retired" rows give the reason.

| Source (lines) | Rule or content | Destination or retirement |
| --- | --- | --- |
| CLAUDE.md 7–13 | Skill routing | CLAUDE.md (new) skill routing; the four `cadence-*` pipeline commands retired (replaced by the shared deliver, bookkeeping and cold-start skills); `/cadence-eval` kept |
| CLAUDE.md 15–23 | Three-layer, 18-agent team; pipeline and gates; SHIP is human | Retired: replaced by the shared roles (STANDARD.md §11) and docs/workflow.md (cast, specialists, G-eval, Advanced release gate); "merge only by the owner" is AGENTS.md §4/§7 |
| CLAUDE.md 25–27 | Decisions immutable, plans from a template, G-plan | Standard decision rules (STANDARD.md §9) and slices (§8); docs/workflow.md |
| CLAUDE.md 28 | Automated CLOSE (archive plan, regenerate HANDOVER, Notion sync, gbrain sync) | Retired: replaced by the shared bookkeeping skill; HANDOVER retired (STANDARD.md §7); Notion none |
| CLAUDE.md 29 | Ratchet rule | Retired: replaced by docs/lessons.md and the shared improve skill (STANDARD.md §12 "Lessons and inbox") |
| AGENTS.md 5–6 | What Cadence is; moat; never mix LiveWheel | AGENTS.md §1; docs/product/brief.md (job, bets); lesson L-15 |
| AGENTS.md 8–11 | Stack, commands, test fallback, migrations | AGENTS.md §2, §4; lessons L-01, L-02, L-12 |
| AGENTS.md 13–16 | Repo map, read-first files, COPY_GUIDE | AGENTS.md §5, §8; .claude/rules/web-app.md "Read first"; docs/README.md |
| AGENTS.md 18–21 | ESM, `@/*`, Drizzle client, tRPC procedures; Conventional Commits; no `git add -A`; branch off main | .claude/rules/web-app.md; docs/workflow.md (commit style); lesson L-20; AGENTS.md §4, §7 |
| AGENTS.md 23–26 | Always / ask / never lists | AGENTS.md §4 (never list, flag-for-review list); §6 |
| AGENTS.md 28–34 | Locked guardrails 1–6 | AGENTS.md §6 lines citing decisions 0001, 0002, 0003, 0005, 0007–0010, 0012; evidence-first → docs/workflow.md and each subsystem rule file; security trifecta → lesson L-17 |
| AGENTS.md 36 | Sources of truth | AGENTS.md §5; Notion retired (STANDARD.md §7: not machinery); live state → STATE.md |
| HANDOVER.md 25–29 | Three things: nested repo path; Cadence ≠ LiveWheel; moat | Nested path retired (old machine; repo is a single checkout); L-15; brief "Bets in force" |
| HANDOVER.md 79–87 | Positioning rules (locked) | Decision 0001 (already holds them); AGENTS.md §6; brief "Non-goals" and "Who it is for" (anchor audiences, product stays industry-agnostic) |
| HANDOVER.md 89–109 | Personas | brief "Who it is for" (audiences 1–3 anchor, 7–9 not served at launch) |
| HANDOVER.md 110–189 | Stack, Mermaid, request flow, code layout | Redrawn from code in docs/architecture/overview.md (the old diagram showed the retired 3-credit tier); stack line → AGENTS.md §2 |
| HANDOVER.md 190–262 | State scoreboard, monetisation, launch gates | STATE.md from live sources; brief "How it earns its keep" from packs.ts and decisions 0006, 0008, 0010; open gates → OWNER-QUEUE (KYC, refund text) and roadmap |
| HANDOVER.md 264–310 | Open questions | Archive only; none is open as a Linear issue in the export |
| HANDOVER.md 311–313 | "Always cd to the nested app path" | Retired (old machine) |
| HANDOVER.md 314–337 | Add template, RSS source, scraper, provider | .claude/rules/web-app.md "How-tos" (paths re-verified: templates live in lib/digest-spec/templates.ts, feeds in server/sources/rss/feeds.ts, scrapers in server/sources/scrape/scrapers/) |
| HANDOVER.md 339–350 | Apply a migration | docs/runbooks/apply-migration.md |
| HANDOVER.md 352–357 | Flip the Advanced flag | docs/runbooks/advanced-flag.md |
| HANDOVER.md 359–366 | Admin dashboards; admin allowlist | overview "Cross-cutting" (allowlist env var `CADENCE_ADMIN_EMAILS`; the address itself redacted) |
| HANDOVER.md 368–372 | Grant or refund credits | docs/runbooks/grant-credits.md |
| HANDOVER.md 374–376 | Roll back a deploy | docs/runbooks/DEPLOY.md "Rollback" |
| HANDOVER.md 378–383 | Stuck or broken user | docs/runbooks/stuck-user.md |
| HANDOVER.md 384–417 | Glossary | brief "Glossary", corrected to decisions 0003, 0005, 0006, 0010 (no "Pro tier"; Advanced 5 credits) |
| HANDOVER.md 418–449 | People and accounts; env vars | Service and env-var names → overview "Configuration and secrets"; Linear team → docs/workflow.md; personal data, bot handle, project ref, team id and the secret value → nowhere (redacted in the archive) |
| HANDOVER.md 450–488 | What to ship next | docs/roadmap.md and docs/OWNER-QUEUE.md from the Linear export; items with no open Linear issue stay in the archive |
| HANDOVER.md 492 | pnpm 11 builds; pnpm-workspace.yaml | Lesson L-09 |
| HANDOVER.md 494, 498 | Notion status type; `ntn` CLI for Notion writes | Retired: Notion is not machinery (STANDARD.md §7) |
| HANDOVER.md 496 | Nested repo | Retired (old machine) |
| HANDOVER.md 500 | `npx vitest run` fallback | Lesson L-12 |
| HANDOVER.md 502 | Brave free tier dead | Lesson L-13; .claude/rules/research-search.md |
| HANDOVER.md 504, 514, 518 | Compaction model; gateway install; "status?" shortcut | Retired: old harness, not this repository (inferred) |
| HANDOVER.md 506 | Rename the bot before launch | docs/OWNER-QUEUE.md OQ-07 |
| HANDOVER.md 508 | PITR off | docs/OWNER-QUEUE.md OQ-06; overview "Constraints and debts" |
| HANDOVER.md 510 | Fallback refunds 2 credits | Corrected as lesson L-14 (verified in refund.ts) |
| HANDOVER.md 512 | `telegram_chat_id` unique | Lesson L-10 |
| HANDOVER.md 516 | Migrations one-way | Lesson L-01 |
| HANDOVER.md 520 | Cadence ≠ LiveWheel | Lesson L-15 |
| AGENT_TEAM.md 22–41 | Nine subsystems, code areas, metrics | overview "Subsystems" table; .claude/rules/<subsystem>.md |
| AGENT_TEAM.md 96–105 | Eval-driven development, G-eval | docs/workflow.md "G-eval"; decision 0012; skill cadence-eval |
| AGENT_TEAM.md 107–114 | Operating principles | Thin harness, leash, specs → STANDARD.md §6, §8, §11; ratchet → lessons and improve skill; trifecta → L-17; doc lifecycle → STANDARD.md §12 |
| AGENT_TEAM.md 139–149 | Gates G-plan, G-review, G-eval, G-verify, G-cadence | Shared roles' gates (planner, reviewer, qa); G-eval and the Advanced release gate → docs/workflow.md; G-cadence → AGENTS.md §6 |
| AGENT_TEAM.md 181–191 | Guardrails 1–7 | AGENTS.md §6 (terminology, positioning, credits, Advanced gate, migrations, LiveWheel); anti-positioning list → brief "Non-goals"; pack names → brief; "numbered docs are a mirror" retired (no such files exist); evidence-first → docs/workflow.md |
| AGENT_TEAM.md 256–263 | Pitfalls | Specialist on hard subsystem → path-scoped rules load automatically; "better with no number" → decision 0012; stale old-machine paths retired; cast by work type and one writer per branch → STANDARD.md §11 |
| apps/web/CLAUDE.md 10–15, 19–48 | Companion docs, read-first files, where-X-lives table | .claude/rules/web-app.md "Read first"; overview "Where code lives"; AGENTS.md §5 (COPY_GUIDE) |
| apps/web/CLAUDE.md 51–118 | Drizzle, tRPC, errors, logging, testing, imports | .claude/rules/web-app.md; lessons L-03, L-11 |
| apps/web/CLAUDE.md 122–150 | Things not to do 1–10 | 1 → L-12; 2 → L-09; 3 ticket-map → retired (file and script absent, verified); 4 Notion → retired; 5 → L-04; 6 → L-05; 7 → L-06; 8 → L-07; 9 → L-08; 10 → L-02 |
| apps/web/CLAUDE.md 154–200 | Provider, RSS, scraper how-tos | .claude/rules/web-app.md "How-tos" |
| apps/web/CLAUDE.md 203–223 | Testing philosophy | .claude/rules/web-app.md "Tests"; L-11 |
| server/ARCHITECTURE.md 9–75 | End-to-end data flow | overview F-01 and F-04 |
| server/ARCHITECTURE.md 76–413 | Module sections | overview "Where code lives", "Cross-cutting", "Data"; chat-thread delete tripwire (199–208) → .claude/rules/web-app.md and overview debts; per-module prose stays in the archive |
| server/ARCHITECTURE.md 414–430 | Module dependency rules | .claude/rules/web-app.md "Imports and module boundaries" |
| 18 agent bodies | Cadence-specific rules | Two specialists kept and trimmed; eight subsystem bodies → .claude/rules/<subsystem>.md; security hot spots → cadence-security.md; eval/evals distinction → L-18; designer viewports and contrast → DESIGN.md; sensitive server areas → docs/workflow.md security lane; debugger triage → docs/runbooks/stuck-user.md; QA core flows → docs/workflow.md runtime checks; the rest retired, replaced by shared roles |
| 6 skill bodies | Pipeline procedures | cadence-eval kept; deliver, bookkeeping, build-wave, fix-pass, handover retired (replaced by the shared skills of the same purpose; handover by cold-start) |
| .claude/workflows/cadence-deliver.js | Pipeline script | Retired, replaced by the shared deliver skill |
