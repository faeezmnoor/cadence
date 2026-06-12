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
