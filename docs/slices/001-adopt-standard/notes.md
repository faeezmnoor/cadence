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
| AGENTS.md 28–34 | Locked guardrails 1–6 | "Cadence" brand noun → AGENTS.md §6 and lesson L-21 (fix round 1); AGENTS.md §6 lines citing decisions 0001, 0002, 0003, 0005, 0007–0010, 0012; evidence-first → docs/workflow.md and each subsystem rule file; security trifecta → lesson L-17 |
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
| AGENT_TEAM.md 181–191 | Guardrails 1–7 | AGENTS.md §6 (terminology, "Cadence" brand noun (L-21, fix round 1), positioning, credits, Advanced gate, migrations, LiveWheel); anti-positioning list → brief "Non-goals"; pack names → brief; "numbered docs are a mirror" retired (no such files exist); evidence-first → docs/workflow.md |
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

## T013 Mermaid check
- All six Mermaid blocks in docs/architecture/overview.md render with `npx -y @mermaid-js/mermaid-cli` (exit 0 each; verified 2026-10-06). The vendored lint 1.2.2 does not parse Mermaid (its Planning group is not in the bundle).

## T014 DESIGN.md token-to-source table (equality checked by hand)
| Frontmatter key | Value | Source |
| --- | --- | --- |
| colors.background … colors.ring (17 keys) | as written | apps/web/app/globals.css lines 7–23 (`:root`) |
| colors.brand, brand-foreground | hsl(14 72% 45%), hsl(0 0% 100%) | globals.css lines 29–30 |
| colors.success … warning-foreground | as written | globals.css lines 35–38 |
| dark values (prose) | as written | globals.css lines 42–65 |
| typography.display | serif stack | apps/web/tailwind.config.ts lines 74–84 |
| typography.body | Tailwind `font-sans` default | apps/web/app/layout.tsx line 33 (`font-sans`); no `fontFamily.sans` override |
| spacing.container | 2rem, 1400px | tailwind.config.ts lines 10–14 |
| rounded.lg / md / sm | 0.5rem, calc −2px, calc −4px | globals.css line 24; tailwind.config.ts lines 63–67 |
| shadows | Tailwind defaults in use | `grep shadow-` over apps/web/app and components (shadow-sm ×2, shadow-xl ×1) |
| motion | typing-dot 1.4s, chat-fade-in 120ms | tailwind.config.ts lines 85–98 |
| components | brand button, best-value badge, status text | inferred from token comments in globals.css lines 25–34 |
- Viewports 360×800 and 1440×900: 360px from the archived designer agent ("mobile parity at 360px", verified); 1440×900 from the standard template (inferred).

## T023 Path-only updates
- Changed: README.md line 88 (docs/ line no longer lists plans); apps/web/README.md lines 13–14, 102, 123, 360–362; comments in apps/web/server/db/schema.ts line 10, apps/web/lib/research-stack.ts line 101, apps/web/scripts/seed-smoke-spec.mjs line 25.
- Reported, not changed (runtime string): apps/web/components/telegram/link-telegram-client.tsx line 437 says "See docs/TELEGRAM_BOT_SETUP.md"; the file is docs/runbooks/TELEGRAM_BOT_SETUP.md (stale since before this slice).
- Reported, not changed (code comments outside the three the brief names, or frozen files): "CLAUDE.md" references meaning the archived app-level file in apps/web/app/api/chat/route.ts:501 and apps/web/test/{reply-capture,duckduckgo-parse,manage-mode-migration-0029,billing-request-credits,pro-search-execution}.test.ts; "ARCHITECTURE.md" in migration 0029's SQL comment (applied migrations are never edited); proposals/brief-manage-mode-plan.md (frozen). Their content now lives in .claude/rules/web-app.md and docs/architecture/overview.md.

## T040–T041 Generators and lint
- `bun run "$STANDARD_DIR/scripts/gen-schema.ts" .` exit 0 (drizzle adapter, apps/web/server/db/schema.ts). Its "Policies and roles" section reads "none found in schema files": the row-level-security policies live in SQL migrations (0001_rls_policies.sql, 0003_lock_shared_tables.sql, 0019_language_interest_events_rls.sql). Not hand-edited; finding for the standard repo (lesson L-20 there: the supabase adapter). The overview's "Data" section names the migrations.
- gen-decision-index and gen-roster ran (exit 0) and filled docs/README.md; the roster is regenerated after T050. The roster lists local agents only; it found no plugin agents to list (inferred: the generator reads the plugin from a path not present here).
- Lint findings fixed in documents only: overview "Key runtime flows" 65 > 60 lines (two prose lines moved to Cross-cutting, two diagram lines merged; diagrams re-rendered, exit 0); three dead links in the archived app instruction file (path-only); E5 on the archived AGENTS.md.
- Plan deviation (documents only): plan.md and STANDARD.md §12 archive a file at `docs/_archive/<yyyy-mm>/<original path>`, but lint rule E5 fails any file named AGENTS.md outside a package folder, the archive included. The archived copy is named docs/_archive/2026-10/AGENTS.pre-standard.md; the index row keeps the original path and says why. Finding for the standard repo: E5 should skip docs/_archive/ (or the archive rule should allow a suffix).

## Builder decisions
- Redaction reached beyond the archive: the live runbooks DEPLOY.md, SMOKE.md and stripe-skus-v2.md, the decision 0000 "Deciders" line and the three records files carried the owner's name, and SMOKE.md the owner's e-mail and Telegram chat id. Names became "the owner", the e-mail and chat id `[redacted]` or `<owner e-mail>` placeholders, with the overriding environment variable named (verified: G5 scans docs/; the brief bans names in any committed file). SMOKE.md's SQL and sample output use the placeholder, so the commands need the real address typed in.
- Decisions: every status is `accepted`, `decision-makers: the owner (ruled by owner)` for all thirteen (verified: each is a product ruling from the former Notion log; 0000 named the owner as decider). The original status and date lines are kept as one body line, so nuances such as "reversed" (0005) and "gate threshold superseded by 0012" (0009) are not lost. "Considered options" lists only options each text names.
- The new runbooks wrap only procedures the code confirms (verified by reading the runners, admin router, grant and refund modules, feature flags). Stuck-user step 3's "user blocked the bot" cause is inferred from the handover.
- Viewports 360×800 and 1440×900 (360 verified from the archived designer agent; 1440 inferred from the template), replacing plan.md's inferred 390×844.
- Advanced fallback refunds: written from apps/web/server/billing/refund.ts, not the handover's "2 credits" (verified; lesson L-14).
- Advanced composer model: the code uses Claude Sonnet 4.5 while decision 0006 says Sonnet 4.6; recorded as a debt in the overview, decision text untouched (verified: `PRO_COMPOSER_MODEL_ID`).
- No TTS (voice-note) code exists although the handover and an agent described one; recorded as a debt (verified by search).
- The .gitignore lines for `.claude/rules/` and `.claude/settings.json` landed with T007 instead of T052 because the rule files could not be committed otherwise; `!.claude/workflows/` was dropped at T052 (folder retired).
- CHANGELOG.md: besides the header and the dated entry, the preamble sentence naming the retired automated CLOSE phase now says the bookkeeper adds entries at CLOSE (inferred as in scope: it described retired machinery).
- Owner queue: the dogfood streak (CAD-209) is not a row because its Linear state is not in the export (not verified); the refund-policy launch gate is not a row because the terms page already states the refund rule (verified: apps/web/app/(marketing)/terms/page.tsx line 37). PITR and the bot rename are rows from the archived handover (state not machine-checkable; inferred still open).
- Roadmap CAD-238 row: kept because tasks.md T017 names it, marked "state not in the export".
- G3: `pnpm build` fails locally only because `DATABASE_URL` is absent from apps/web/.env.local ("DATABASE_URL is required in production" while collecting page data for the webhook route). Per ruling OQ-6 the Vercel preview build of the PR head is G3's evidence (pending: the PR is not open). Production's Vercel deployment of 001508c reported success (verified: commit status "Vercel success").

## Tasks skipped (not the builder's)
- T062 (orchestrator: rebase, push, PR), T063 (reviewers: correctness and security lanes, G17), T064 (orchestrator: branch protection with `check` and `standard-check`), T065 (orchestrator: cold-start test, STATE.md Measurements), T066 (bookkeeper: Linear issues for this slice and each owner-queue row), T067 (bookkeeper: CLOSE, CHANGELOG entry, move this folder to docs/records/slices/), T068 (orchestrator: LEARN in the standard repo).

## Gate results at the builder's last pre-STATE head (run by hand; EVIDENCE left empty)
- G1 lint: exit 1 before STATE.md exists (its only FAIL is "STATE.md missing"); re-run after the STATE commit (see the report). LICENSE WARN only.
- G2 `pnpm typecheck && pnpm lint && pnpm test`: exit 0 (130 files passed, 4 skipped; 1224 tests passed, 25 skipped).
- G3 `pnpm build`: exit 1, environment only (see Builder decisions); evidence moves to the Vercel preview.
- G4, G5, G6: exit 0; each planted once (home path, name, 64-hex string in a scratch docs file) and exited 1, then the plant was removed.
- G7, G8 (`gen-schema --check`), G9, G10, G11 (with `_claude`), G12, G13 (5 tests passed), G14, G16: exit 0.
- G15: needs STATE.md; run after the STATE commit.
- G17: reviewers' gate; exits 1 until their verdict lines exist.

## Not checked
- Whether `PRO_TIER_ALPHA`, `SENTRY_DSN` and `MANAGE_MODE` are set in production (no Vercel access; owner queue OQ-03).
- Linear issues outside the export (CAD-209, CAD-238, Backlog and Done states).
- Whether the shared plugin is installed and enabled for this repository (assumption A2); gen-roster listed no plugin agents.
- The Vercel preview build of the PR head (G3) — the PR does not exist yet.
- Mermaid parsing by the lint (not in bundle 1.2.2); checked with mermaid-cli instead.

## Findings for LEARN (standard, templates, lint, plan)
- Lint E5 fails an archived AGENTS.md under docs/_archive/, contradicting §12's "<original path>" archive rule.
- Lint T5 needs a link in every owner-queue row, while public repos may hold no URLs: relative links to runbooks and decisions satisfy it; the standard should say so.
- gen-schema reports "none found" for policies on a Supabase repo whose policies live in SQL migrations (known, L-20 in the standard).
- gen-roster lists only local agents when the plugin is not visible, so the "Cast" table understates the cast.
- The migration plan assumed names only in the handover and agents; live runbooks and decisions carried them too. A planner check: run the G5 grep over the whole tree at inventory.
- docs/runbooks/ file names are upper case (pinned by code and a test) while the map wants lower case under docs/.
- The template's 600-line chain and the lint count the current slice's brief; a migration brief near 100 lines is fine, but STATE plus README plus AGENTS for a Standard repo already sit near 200.
- Code comments citing "CLAUDE.md" (the archived app file) in six application files are outside a migration's allowed edits; the standard could allow comment-only path fixes found by grep, not only those the plan names.

## Cold-start answer (builder's own, from AGENTS.md, CLAUDE.md, STATE.md, docs/README.md and this brief)
1. What is live? The web app on Vercel (production deployed from main 001508c on 2026-10-06), Telegram delivery with feedback and weekly distillation, and the credit ledger with admin grants and refunds; card checkout is not live (Stripe KYC) and Advanced research is paused behind its flag.
2. What is next? This slice's review and PR; then the owner's triage of the four stale In Progress issues (CAD-222, CAD-215, CAD-216, CAD-210); then CAD-70 to CAD-72 (Urgent) and CAD-228 (High).
3. What waits on the owner? In order: rotate the webhook secret; set the `DATABASE_URL` Actions secret; confirm Sentry and Inngest traces after the dependency update; look at the social preview image; decide the four stale issues; rate Advanced briefs; finish Stripe KYC; enable PITR; rename the bot.
