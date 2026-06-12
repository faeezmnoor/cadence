# Brief manage mode — PR notes (running, per-chunk)

Companion to `proposals/brief-manage-mode-plan.md`. Chunk C (client/UI,
work item 6 of §5) adds this file; later chunks (evals + docs) append.

---

## FOUNDER SIGN-OFF

Two strings-freeze checkpoints from plan §5 item 6 / §3.6 / §3.3 — both
shipped as specced and flagged for explicit founder confirmation at PR
review. If either is rejected, only that wording/placement changes —
nothing structural.

1. **Persona-free credit line (PM risk 1, §3.6).** When `send_sample(deliver: true)`
   hits zero credits, the user-visible line is:

   > **"Out of credits — top up to send a sample."**

   Rationale: money lines never wear "I", even on the chat surface
   (COPY_GUIDE §6 person ruling — the researcher persona never handles
   payment). The agent's surrounding sentences stay in "I" voice; this one
   line is plain. Sign-off question: is the voice break acceptable
   mid-conversation, or should the whole zero-credit turn drop the persona?

2. **At-cap disabled "+ New brief" placement (Design risk 6, §3.3).** On a
   brief's chat (manage header), "Start over" is replaced by "+ New brief"
   (outline, → `/chat?new=1`), gated by the same `briefs.canCreate` rule as
   `/briefs`. At cap it renders DISABLED with the shipped title
   "Multiple briefs are coming soon." — same treatment as `/briefs`, but in
   a more visible, always-on-screen position (chat header). Default is
   ship-as-specced. Sign-off question: acceptable, or hide it entirely at
   cap on this surface?

---

## Chunk C — client/UI (work item 6)

### What shipped

- `briefActionsState` 4th state: `hidden | confirm | actions | reconfirm`
  with optional `pendingChanges` input. The three legacy truth-table rows
  are byte-identical (`pendingChanges` defaults false); legacy vitest rows
  untouched, new rows appended.
- Reconfirm panel (§3.5): exactly ONE brand-primary button
  "Looks good — update this brief" appending a USER chat message (PR #40
  confirm contract; FINDING-011 — no stacked/disabled CTAs), plus the
  "or keep changing it below" escape hatch. No preview/send affordances in
  this state.
- `specDiff(saved, staged)` (display-row-level, same `buildRows`
  projection the rail renders) + spec-rail pending treatment (§3.4):
  warning dot + "was …" caption per changed row, "N changes pending"
  footer pill, warning collapsed-rail dot, mobile summary variant.
- `SamplePreviewCard` (§3.2): renders when a `send_sample` tool result
  carries markdown; existing `<Markdown>` whitelist renderer; eyebrow
  "Sample — not delivered" in the micro-label class; `max-h-96` scroll
  cap. Delivered sends render no card.
- Panel yield rule (§3.1 item 4): pure `panelYielded` derivation — the
  actions panel stops rendering once the user speaks after the triggering
  save event. Reconfirm is exempt (it is the path to saving staged edits).
- Deterministic chip fallback (C5): `resolveChips` pure matrix — model
  chips win; manage fallback "Preview a sample" / "Send one to Telegram"
  (linked only) / "Change something"; suppressed during confirm/reconfirm
  and on archived briefs; setup behavior byte-identical.
- `savedSpecId` precedence (exec advisory 12): `initialSavedSpecId`
  (= `thread.specId`, server-authoritative, passed by `app/chat/page.tsx`)
  beats the transcript scan; the scan additionally recognizes
  `save_changes` results (same `{spec_id, version}` shape).
- Manage header (§3.3): "Briefs" breadcrumb → `/briefs`, brief name via
  `briefDisplayName`, Active/Paused badge, "+ New brief" → `/chat?new=1`
  (canCreate-gated), truncation-safe at 390px (`min-w-0` + `truncate`,
  shrink-0 chrome).
- Archived state (§3.6/C3): banner + disabled composer (+`aria-disabled`)
  + suppressed chips + suppressed panel, driven by server-passed
  `briefStatus` AND latched client-side from the 409
  `{error:"brief_archived"}` envelope (archive-while-tab-open, AC8.1).
  The generic error-retry bubble is suppressed for that envelope.
- Transition moment (§3.1 item 1): deterministic client-rendered
  post-save message via `saveTransitionMessage` (sibling of the lifted
  `humanizeSchedule`, exec advisory 6) — "Saved. Your first brief arrives
  tomorrow at {time} ({tz})." with the "tomorrow morning" fallback.
  Anchored to the persisted `confirm_and_save` tool result so reloads
  render the same transcript. Chunk B intentionally left this line out of
  the prompts.
- `app/chat/page.tsx`: passes `manageMode`, `mode`, brief name/status,
  saved spec + scheduling, `initialSavedSpecId={thread.specId}`,
  `userTimezone`. Missing/unowned bound spec fails closed to the archived
  rendering (mirrors the route gate).
- `app/briefs/briefs-client.tsx`: Chat action FIRST on the card (outline
  recipe matching Pause, `MessageCircle` 3.5, no layout shift, hidden when
  flag off via server-passed prop); "+ New brief" hrefs → `/chat?new=1`.
- COPY_GUIDE additions per §3.7: §4c ("your brief's chat" + banned
  "manage mode"/"thread"/"session"; canonical cooldown sentence pair;
  "Chat" as the canonical card-action label), §5 honesty row (capability
  gaps owned verbally — the feed-add line), §7 micro-label class, §8 page
  rows (Config chat re-jobbed; Briefs row added).

### Deviations from the plan (trust-the-code rule)

- **Hydration of persisted tool results** (`HYDRATED_RESULT_TOOLS` in
  `chat-client.tsx`): the shipped hydration dropped ALL tool invocations;
  sample cards, the transition anchor, and the yield derivation need
  `send_sample`/`confirm_and_save`/`save_changes` results to survive
  reload. Minimal, additive — `ask_user`/`suggest_quick_replies` stay
  excluded (chips remain a live-turn surface; the deterministic manage
  fallback covers reloads).
- **No "Archived" badge** in the manage header — §3.3 specs Active/Paused
  only; the archived banner carries that state (no double signal).
- **Archived brief also suppresses the BriefActions panel** (not just
  chips/composer): a Preview/Send affordance would promise an action the
  server refuses (same bug class FINDING-011 closed). §3.6 lists chips +
  composer; the panel suppression is the same principle applied.
- **Empty-bubble skip extended to save results** (`message-bubble.tsx`):
  a text-less assistant turn carrying a `confirm_and_save`/`save_changes`
  result no longer paints an empty bubble shell (the soft notice /
  transition message is the surface). Live and reloaded transcripts now
  agree; text-carrying turns are unchanged.
- **specDiff baseline frozen at save time** (`chat-client.tsx`
  `sessionBaseline`): the plan's "last ready draft" live-session baseline
  would have diffed the staged draft against itself (reconfirm unreachable
  in-session). The baseline now snapshots the just-saved draft whenever a
  NEW save event lands; mount-time history events defer to the
  server-passed saved spec.

### Visual-QA state list (static-HTML repro, §6 visual row)

1. Manage header: long brief name @390px (truncates, breadcrumb + badge
   + "+ New brief" intact); Active badge; Paused badge; at-cap disabled
   "+ New brief"; focus rings (light + dark — white-halo check).
2. Reconfirm panel: default; busy/disabled; keyboard path
   Tab→confirm→escape-hatch→composer focus; both themes.
3. Spec rail: 0/1/2 pending changes (dot + "was …" caption dark-mode
   legibility); footer pill singular/plural; collapsed warning dot;
   mobile `<details>` summary "Your brief — 2 changes pending".
4. Sample preview card: short sample; long sample (scroll cap engages);
   eyebrow contrast both themes; B3 serif/citation parity vs the panel
   preview body.
5. Archived state: banner + visibly disabled composer + no chips + no
   panel.
6. Chip strip @390px: linked set (3 chips) vs unlinked set (2 chips), no
   third line.
7. /briefs card: Chat first, no layout shift vs flag-off; archived briefs
   have no card at all.
8. Transition replay: save → one deterministic message → chips → panel;
   after next user turn the panel yields, chips remain.

### For chunk D (evals + docs)

- The client appends the user message **"Looks good — update this brief"**
  (no trailing period — button label verbatim per §3.5); the live eval's
  scripted panel-confirmation path must use exactly that string.
- The transition message is CLIENT-rendered (deterministic), anchored to
  the latest `confirm_and_save` result. Live eval case 6 ("exactly one
  post-save message") asserts the AGENT side (one message then stop) —
  the prompt must keep the agent from also announcing the schedule, or
  users see two saved-lines.
- `resolveChips` is the single chip-decision point; if the manage prompt's
  `suggest_quick_replies` emission changes, no client change is needed.
- New unit suites: `test/brief-actions-manage.test.ts` (yield +
  savedSpecId precedence + scan), `test/spec-diff.test.ts`,
  `test/manage-chips.test.ts`, appended rows in
  `test/brief-actions-state.test.ts` and `test/schedule-humanize.test.ts`
  (`saveTransitionMessage`).
- Docs (work item 8): ARCHITECTURE.md thread-lifecycle note still owed;
  COPY_FIXES_PROPOSED.md had no conflicts surface in this chunk.

---

## Chunk D — evals + docs (work items 7–8)

### Eval summary (merge gate, plan §4.4)

All four suites green. Full outputs committed for PR pasting:
`proposals/eval-output-setup.txt`, `proposals/eval-output-manage.txt`.

| Suite | Where | Result |
|---|---|---|
| `test/config-agent.eval.test.ts` (deterministic setup) | CI | 6/6 PASS — untouched, byte-frozen registry guard intact |
| `test/config-agent-manage.eval.test.ts` (deterministic manage, NEW) | CI | 13/13 PASS — edit golden set fixtures 1–5 + behavioral fixtures 6–9 + registry guard |
| `test/eval-template-live.test.ts` (live setup) | local | 10/10 PASS, **UNCHANGED** — extraction golden set + ≤3-question interview contract prove the setup surface untouched |
| `test/eval-manage-live.test.ts` (live manage, NEW — 7 scenarios) | local | 8/8 PASS (scenarios 2 and 6 share the panel-confirmation run; 2 runs as 2a panel + 2b typed) |

Live runs: `RUN_LIVE_EVALS=1 OPENAI_API_KEY=... EXTRACTOR_TIMEOUT_MS=20000`,
gpt-4o-mini, ≈ $0.02 total. Manage suite passed twice consecutively
(iteration-3 run + the verbose artifact run).

**Prompt iterations (3, within the §4.4 budget)** — all on
`prompts/config_agent_manage_v1.md`, agent-instruction lines only; every
eval-asserted user-visible string stayed byte-identical (re-checked against
COPY_GUIDE canon; the client confirmation token "Looks good — update this
brief" untouched, no trailing period):

1. **Scenario 5 lapse:** model answered "Out of credits — top up to send a
   sample." WITHOUT calling `send_sample` (hallucinated a failure state).
   Fix: sample-semantics hard rule — every sample request gets a
   `send_sample` call first; never report an outcome you did not receive.
2. **Scenario 5 again:** wrote bolded lowercase "connect Telegram". Fix:
   the no_telegram phrasing now spells out the exact casing/no-markdown
   requirement for the **Connect Telegram** link token. **Scenario 6:**
   post-save next steps written as text bullets, no chips call — first
   strengthening of confirm-contract step 5.
3. **Scenario 6 again:** reordered the post-save procedure — FIRST call
   `suggest_quick_replies`, THEN write the one post-save line; requirement
   also pinned on the tool-list entry. gpt-4o-mini follows the procedural
   ordering reliably (8/8 after this).

**Deviation (trust-the-code):** plan fixture 6 assumed "invalid edit
(empties topics) → `finalizeDraft` rejects". In reality the DRAFT schema
already requires ≥1 topic, so the empty-topics edit is rejected at
STAGING inside `update_spec_field` (stronger: the bad value can never
even sit on the draft). The deterministic suite asserts the actual
staging-time rejection AND keeps a finalizeDraft-level case (incomplete
draft from degraded hydration) so both gates stay pinned.

§6 rows owed by earlier chunks were verified already present: two-brief
cross-surface cooldown fixture (`test/digest-sample-core.test.ts`),
route-guard matrix incl. the flag-off RC5 row
(`test/manage-thread-gate.test.ts`), `resetThread` specId carry-over
transaction (`test/chat-reset-thread.test.ts`). No gaps remained.

Full suite after chunk D: **117 files / 1119 tests passed** (baseline
116/1106 — additions only); `tsc --noEmit` and `pnpm lint` clean.

### Docs landed (work item 8)

- `apps/web/server/ARCHITECTURE.md`: new `chat/` section — thread
  lifecycle (mode DERIVED from `spec_id`, never stored; `completed` =
  legacy-only; kill-switch fail-closed behavior) and the explicit
  **ON DELETE SET NULL tripwire** (hard-deleting a spec would silently
  degrade its manage thread to a setup thread carrying full manage
  history — fine while specs are archive-only; any future hard-delete
  feature must archive/delete the bound thread in the same transaction).
  Plus a manage-mode pointer in the `ai/config-agent/` section.
- COPY_GUIDE / COPY_FIXES_PROPOSED: **no conflicts surfaced** in chunk D —
  the three prompt iterations changed agent-instruction lines only; all
  COPY_GUIDE-canonical strings verified byte-identical post-iteration.

### Ship-sequence checklist (§7.1, verbatim from the plan)

1. Isolated worktree (`git worktree add` — parallel sessions share `~/code/cadence`, never assume sole tree ownership). Re-verify migration number first.
2. Land commits per §5; CI green; live evals green locally (output in PR).
3. Branch-DB rehearsal of **all three script phases** (schema, reactivate, rollback) incl. idempotency proofs.
4. **Pre-merge prod apply: `apply-0028.mjs` (default `--phase=schema`) ONLY** — column, indexes, `spec_id` backfill, throttle column. **No status UPDATE runs pre-merge** (checkable: the schema phase contains none). Forward-safe with live legacy code: nullable column + partial indexes; legacy code never reads `spec_id`, and — the part that made the split necessary — no thread's `status` changes, so legacy `/chat` resolution behavior is byte-identical.
5. PR with: eval outputs, backfill counts, CTO flag **and explicit ack** on the cost-events commit, founder sign-off confirmations (credit-line voice; "+ New brief" disabled placement), the post-ship PM query (§2 success trigger), and the **founder heads-up note**: the post-deploy reactivation step (7) revives old completed threads, so the first post-reactivation bare-`/chat` visit may land in an old conversation — intended per decision 3.
6. Set `MANAGE_MODE` in Vercel env, then squash-merge after CPO+CTO approval; Vercel auto-deploy ships flag-on.
7. **Post-deploy, after verifying the new code is serving:** run `apply-0028.mjs --phase=reactivate` against prod. The NOT-EXISTS guard skips any spec whose user already lazy-created an active manage thread between deploy and now; record reactivated/skipped counts in the PR thread.
8. Post-deploy smoke: open a reactivated legacy thread via `/chat?brief=<id>`, send "show me a sample" → preview card; check `/briefs` Chat action; check one `manage_thread_resumed` and one chat-turn `cost_events` row landed; send two quick "preview" asks → second returns the dry-run wait line (throttle live).

### Founder heads-up — reactivated threads

The post-deploy reactivation step (§7.1 step 7) revives old `completed`
setup threads as live manage threads. The first post-reactivation visit
to bare `/chat` may therefore land a user in an OLD conversation (their
brief's thread, with its history) instead of a fresh chat. This is
intended per locked decision 3 (persistent per-brief threads; bare
`/chat` resumes the most-recently-active thread) — not a bug. If it
surprises in practice, the `/briefs` → Chat path remains the primary,
unambiguous door; no code change needed to tolerate it.

### Post-ship PM query (§2 success trigger — paste into the post-ship checklist)

Owner: PM, at the +2-week review. If edit→applied conversion < ~60%
after 2 weeks of real traffic, the manage prompt goes back through the
eval loop before any other iteration. New-thread creations per user per
week on `/chat` should drop to ~0 for users with saved briefs:

```sql
SELECT user_id, count(*)
FROM chat_threads
WHERE created_at > now() - interval '7 days'
  AND purpose = 'initial_config'
GROUP BY 1
```

joined against users with ≥1 non-archived spec.

## Exec PR review round 1 (2026-06-13)

**Verdicts:** CPO — approve-with-changes. CTO — approve-with-changes,
**including the explicit CTO ACK on the cost-events commit** (`fd2b160`,
chat-turn `cost_events` rows, the §4.3.5 isolated/cherry-pickable commit) —
the baseline shift is accepted.

### Required changes — all four landed

| # | Finding | Disposition |
|---|---------|-------------|
| CPO#1 | Panel path (tRPC `digest.sampleNow`) wrote no ACX.5 analytics while the chat tool wrote `sample_requested`/`sample_blocked` | **Fixed** (`d5aa0c0`). `sampleNow` now logs `sample_requested {via:'panel_button', dry_run}` and `sample_blocked` with the shared reason vocabulary; `sampleBlockedReason` single-sourced in `server/digest/sample.ts` (chat tool repointed); router test locks the event shape. Checkable: `grep -rn panel_button apps/web --include="*.ts"` → write site + test. |
| CPO#2 | AC6.2 (at-cap "also brief me on X" inside a manage thread) had no live eval | **Fixed** (`a5dade5`). Live case 8: "Also brief me on lithium prices." → zero `update_spec_field`/`save_changes`/`send_sample`, draft byte-identical, semantic match on the manage prompt's at-cap line, negative regex on upgrade-CTA language. Suite now 9 cases. **Green on the FIRST live pass — zero prompt iterations needed** (then 9/9 again on the recorded verbose pass). |
| CTO R1 | 0028b reactivation aborts post-rollback: two completed bound threads per spec both pass the snapshot-evaluated NOT EXISTS guard → `chat_threads_spec_active_uq` violation aborts the statement | **Fixed** (`dd9f081`). One-per-spec subselect (`ORDER BY t3.updated_at DESC, t3.id DESC LIMIT 1` — id tiebreak because rollback stamps one shared `now()`); structural test pins the subselect; REHEARSAL-0028 gains the two-completed-threads fixture (expect 1 reactivated + 1 skipped, converges) and a rollback→reactivate round-trip check. |
| CTO R3 | `onFinish` flag-on→{specId, stays active} vs flag-off→{status:'completed'} write decision inline at route.ts with no test | **Fixed** (`83f8152`). Extracted to pure `onFinishThreadWrite(manageOn, savedSpecId, draft)` in `server/chat/on-finish-write.ts`; both rows + draft-persist + touch-only + no-updatedAt pinned in `test/chat-onfinish-write.test.ts`. Behavior byte-identical (extract + test only). |

### Advisories — taken

- **CTO A5** (`c7da726`): `void recordCost(...)` in `onFinish` → `await` —
  recordCost never throws, but serverless can drop unawaited work.
- **CTO A3** (`c7da726`): manage turns persisted `draftSpec =
  specToDraft(savedSpec)` even when equal to the saved spec (stale-snapshot
  landmine). Now: when the working draft hasn't diverged from the bound
  spec, `draft_spec` is **cleared** rather than skipped — one deliberate
  step past the advisory: clearing also heals threads already carrying a
  redundant snapshot and covers a staged edit the user reverted. Real
  staged edits persist exactly as before; setup turns untouched.

### Advisories — consciously deferred (no code change this round)

CTO **A1, A2, A4, A6, A7, A8** and **CPO's two advisories** — all
non-blocking per both reviewers, deferred by the cost/benefit call in the
exec session. Verbatim text lives in the exec review transcript (round 1);
ship operator: pull the one-liners from there if this PR description needs
them inline. None of them gates merge.

### Post-fix verification (this round)

- `npx tsc --noEmit` clean; `pnpm lint` clean.
- Full `npx vitest run`: **118 files / 1131 tests passed** (round-0
  baseline 117/1119 — additions only: +9 onFinish helper rows, +2 panel
  analytics router rows, +1 0028b structural row).
- Live evals (env via `vercel env pull`, deleted after the run along with
  `.vercel/`): setup **10/10 unchanged**; manage **9/9** (new at-cap case
  included) — first pass green, no prompt iterations, outputs refreshed in
  `proposals/eval-output-manage.txt` + `proposals/eval-output-setup.txt`.
