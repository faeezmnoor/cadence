# Brief Manage Mode — Implementation Plan (rev. 2, post exec review)

**Feature:** persistent per-brief chat threads with manage mode (sample + edit) for Cadence.
**Repo:** `/Users/faeez/code/cadence`, app code in `apps/web/`. Verified against `main` @ `74fc25c` (2026-06-12). All paths below are relative to `apps/web/` unless they start with `prompts/` (repo root).
**This revision** incorporates all 7 required changes and all 14 advisories from CPO+CTO review. Disposition mapping in Appendix B. No required change conflicted with a locked founder decision, so there are no exception notes — every change is incorporated. The one nuance against decision 7 ("migration applied before merge") is called out inline in §4.1/§7.1: the **schema** migration still applies pre-merge; only the **data reactivation step** moves post-deploy, at the execs' direction, because pre-merge reactivation is a verified prod hazard.

**Repo facts re-verified during synthesis and exec-review revision** (trust these over the role plans where they differed):
- 409 guard at `app/api/chat/route.ts:132` (`thread.status !== "active"`); completion writer at lines 394–399 (`onFinish` sets `status: "completed"` when `session.savedSpecId` is set). `chat.completeThread` has zero callers outside the router.
- `savedSpecId` is persisted on the saving assistant turn's `content` jsonb (route.ts:379) → message-based backfill is feasible.
- Latest migration is `0027_tier_pro_websearch.sql` → this wave is **0029** (re-verified 2026-06-12; re-verify again at implementation time — parallel sessions share the tree).
- `PURPOSES = ["initial_config", "reconfigure"]` already exists in `server/trpc/routers/chat.ts:21`; `reconfigure` is unwired.
- `next.config.mjs:12–14`: `outputFileTracingIncludes: { "/api/chat": ["../../prompts/**/*.md"] }` — globs the whole prompts dir, so a new manage prompt file works on Vercel with no config change.
- `digest.sampleNow` (`server/trpc/routers/digest.ts`): `SAMPLE_NOW_COOLDOWN_MS = 5*60_000`; cooldown applies only to non-dry-runs; the spec guard excludes **archived** specs only — paused specs are sampleable. **The cooldown query has no spec filter — the window is per-user across ALL briefs** (matters for multi-brief Pro users; see §3.6/§6).
- **Exec hazard confirmed (RC1/RC4/RC5):** legacy `/chat` resolution (`app/chat/page.tsx:50–63`) selects ANY `status='active'` `initial_config` thread, and `route.ts` serves any active thread with the setup agent — where `confirm_and_save → saveSpecForUser` (`server/ai/config-agent/save-spec.ts:77–82`) can archive-and-replace the user's live brief at cap. Reactivating backfilled threads while legacy code is live, or flagging off while reactivated threads are active, both walk into this.
- **`humanizeSchedule` is module-PRIVATE and duplicated** (verified): `app/briefs/briefs-client.tsx:533` and `app/briefs/[id]/brief-detail-client.tsx:794`, both inside `"use client"` modules — NOT importable from server code today (RC2 confirmed).
- **Archived briefs never render cards** (now verified, was previously asserted): `app/briefs/page.tsx:57` queries `inArray(digestSpecs.status, ["active", "paused"])` — archived rows never reach the client, so they can never get a Chat action.
- **Dry-run economics confirmed (RC6):** `server/digest/run.ts:277` — "dryRun stays rowless by design" (no `digest_runs` row); `run.ts:302–305` — the credit gate (`shouldSkipForCredits`) is bypassed entirely for `dryRun`. So an unthrottled `send_sample(deliver:false)` is a zero-credit, rowless, full-pipeline LLM compose, loopable inside one agent turn (maxSteps=6).
- `briefActionsState` (`components/chat/brief-actions.helpers.ts`) is the pure 3-state resolver `{ready, saved} → hidden|confirm|actions`; the deterministic eval (`test/config-agent.eval.test.ts:70`) asserts the exact sorted key list of `configAgentTools` (6 tools incl. `suggest_quick_replies`).
- `cost_events` schema: `userId`, `digestRunId` (nullable), `kind`, `provider`, token counts, `costUsd`, timestamps — chat-turn rows (ACX.1) fit without schema change.

---

## 1. Overview & locked decisions

### 1.1 Problem
After setup completes, the thread is `status='completed'` and `/api/chat` returns 409; returning to `/chat` silently creates a new thread, orphaning the old one. Users cannot conversationally request a sample or edit their brief from the session where they built it.

### 1.2 Locked decisions (do not reopen)
1. **Session model:** persistent per-brief thread. `spec_id` FK on `chat_threads` binds the thread to its `digest_specs` row. After `confirm_and_save`, the same thread becomes a manage thread (sample + edit).
2. **Edit semantics:** in-place update of `digest_specs.spec` JSONB + `version` increment. Same spec id forever. No revision/snapshot table.
3. **Navigation:** `/briefs` is the hub; each card gets a "Chat" action → `/chat?brief=<id>`. Bare `/chat` resumes the most-recently-active thread, else starts setup. "New brief" always spawns a fresh setup thread.
4. **Sampling:** new agent tool `send_sample` wrapping `digest.sampleNow` logic (dry-run → markdown preview in chat; real → Telegram). Cooldown surfaced conversationally.
5. **Scope:** manage mode = sample + edit only. Pause/resume/archive stay on `/briefs`.
6. **Legacy threads:** backfill `spec_id` from `savedSpecId` in messages; otherwise lazy-create a seeded manage thread on first `/chat?brief=<id>`.
7. **Ship:** isolated git worktree, one PR squash-merged after CPO+CTO approval, prod **schema** migration applied via script BEFORE merge (exec-mandated split: the thread-reactivation data step runs as an explicit POST-deploy step — §4.1, §7.1), Vercel auto-deploy.

### 1.3 Resolved contradictions between role plans

| # | Conflict | Resolution | Why |
|---|---|---|---|
| C1 | Eng said "`briefActionsState` resolver untouched"; Design adds a 4th `reconfirm` state. | **Extend the resolver** to `hidden \| confirm \| actions \| reconfirm` with a new `pendingChanges` input. The three existing truth-table rows are byte-identical in behavior; existing vitest rows stay green unmodified; new rows are appended. | The "do not regress PR #40/#42" constraint means *behavioral* freeze of the setup rows, not a file freeze. Bypassing the resolver for manage mode would fork the panel logic the founder just had fixed (FINDING-011) — worse than extending it. |
| C2 | Eng's live eval expects the agent to ask a confirming question and wait for "yes, save it"; Design specifies a deterministic reconfirm panel with one brand button. | **Both, via the existing confirm contract:** the `reconfirm` panel's brand button appends a **user chat message** ("Looks good — update this brief"), which the agent treats as confirmation and answers with exactly one `save_changes(user_confirmed: true)`. Free-typed confirmations ("yes, save it") work identically. The live eval scripts both paths. | This is exactly how the setup confirm flow already works (button appends a user message per the `config_agent_v1.md` contract). One mechanism, two entry points, no new plumbing. |
| C3 | Eng: archived-brief manage thread → friendly 409 envelope. Design: read-only banner + disabled composer. | **Both layers ship.** Server: the route returns 409 `{error:"brief_archived"}` for manage threads whose spec is archived (backstop, also catches archive-while-tab-open). Client: `/chat` page load detects archived spec server-side and renders the banner + disabled composer + suppressed chips, so the 409 is never *seen* in the normal path. | Server enforcement makes the banner copy honest (COPY_GUIDE honesty boundary, Design risk 4); the banner makes the state legible without an error round-trip. |
| C4 | PM: unowned/unknown `?brief=<id>` → "fall back to bare-/chat behavior with a notice". Eng: redirect to `/briefs`. | **Redirect to `/briefs`** (no toast this wave). | `/briefs` is the orientation surface and shows the user's real briefs — strictly more useful than dropping them into an arbitrary thread with a notice we'd have to design. Deterministic, RLS-clean, one line of code. PM's underlying goal ("never 404 the whole chat surface") is met. |
| C5 | Design's quick-reply chips depend on flaky model compliance (`suggest_quick_replies`, dogfood 2026-06-09); PM/Design both lean on chips for capability introduction. | **Deterministic client fallback:** in manage mode, when the last transcript item is an assistant message and no model-suggested chips are present, `ChatClient` renders the static manage chip set ("Preview a sample" / "Send one to Telegram" *(linked only)* / "Change something"). Model-suggested chips, when emitted, take precedence. Live eval still asserts chip emission on the save transition, but the UX no longer *depends* on it. | Kills Design risk 3 structurally instead of hoping the eval holds the model to it. |
| C6 | Eng: `resetThread` carries `specId` onto the replacement thread. Design: the "Start over" affordance must not exist on manage threads. | **UI removes "Start over" in manage mode** (replaced by "+ New brief", §3.3); **server `resetThread` is still hardened** to carry `specId` and archive-then-insert in one transaction (satisfies the partial unique index; protects against stale clients/direct tRPC calls). | Defense in depth; neither plan's goal is sacrificed. |
| C7 | Design's rail diff requires staged edits; Eng's `save_changes` flow stages edits on `session.draft` / `thread.draftSpec`. PM's AC3.4 requires no partial writes. | **Confirmed compatible — this is the locked mechanism:** manage-mode edits stage onto `session.draft` (persisted to `chat_threads.draftSpec`, existing plumbing). `digest_specs.spec` is written **only** by `save_changes` in one transaction. `pendingChanges = specDiff(savedSpec, draftSpec).length > 0`, computed client-side from props. | Settles Design risk 1 before UI build; gives PM's no-partial-write guarantee for free (abandoned edits live only in `draftSpec`, the saved spec is byte-identical). |
| C8 | PM wants 9 analytics signals; Eng plan had none. | Ship the **4 event writes** (`manage_thread_resumed`, `sample_requested`, `sample_blocked`, `brief_edit_applied`) following the existing `template_selected`/`brief_saved` pattern. The remaining signals (retention join, cost-per-turn, backfill health) are **derived offline** from existing tables (`cost_events`, `learning_log`, `digest_runs`, migration script output) — no new infra. | Four insert calls is cheap; building dashboards is not this wave. |

---

## 2. Use cases & acceptance criteria

Examples use COPY_GUIDE-compliant domains (commodities, regulation, competitors — never crypto/flights/betting as promoted examples).

### J1 — Just saved → "show me a sample" (preview in chat)
User finishes setup, saves, then types "can I see a sample?" in the same thread. Agent calls `send_sample(deliver: false)` → markdown preview renders inline as a tool-part card.
- **AC1.1** Posting to a thread with `spec_id` set returns 200 (no 409) after `confirm_and_save`.
- **AC1.2** `send_sample(deliver:false)` invoked; markdown rendered in transcript; no 5-minute *delivery* cooldown consumed; no `digest_runs` row (dry-runs are rowless by design, verified `run.ts:277`).
- **AC1.3 (rewritten per exec RC6 — dry-runs never hit the credit gate, verified `run.ts:302–305`):** a dry-run preview succeeds at zero credit balance with **no debit and no balance gate**; zero-credit messaging applies only to delivered sends (AC2.6). In exchange, dry-run composes on the chat path are **server-throttled**: minimum 60s between dry-run composes per user (`DRY_RUN_COOLDOWN_MS`, atomic claim in the shared core — §4.5). A throttled call returns typed `{ok:false, code:'cooldown', scope:'dry_run', retryAfterMs}`; the agent relays the short wait conversationally, never a raw error. This bounds the maxSteps=6 agent loop to one compose per window.
- **AC1.4** BriefActions "actions" state still renders post-save and both buttons work; existing `briefActionsState` test rows pass unmodified. The panel "Preview" button (tRPC path) is **not** subject to the new dry-run throttle this wave (origin-scoped, §4.5).

### J2 — "send it to my Telegram"
`send_sample(deliver: true)` → shared sample core: cooldown check, credit gate, spec guard, `trigger='sample'`, delivery.
- **AC2.1** `digest_runs` row `status='delivered'`, `trigger='sample'`; agent confirms ("Sent — check Telegram." semantics).
- **AC2.2** Within the 5-min window the agent surfaces the cooldown conversationally with the computed retry time; assert no raw `TOO_MANY_REQUESTS`/error-code text reaches the user; preview offered as the out. **Phrasing rule:** the cooldown window is per-user across ALL briefs (verified — the `digest_runs` query has no spec filter), so the agent's wording must never claim "this brief" caused the wait (§3.6, eval-asserted).
- **AC2.3** Unlinked user → agent explains, client renders the verbatim "Connect Telegram" CTA (→ `/app/link`); no failure-run spam (existing `no_telegram_link` handling).
- **AC2.4** Tool targets the thread's bound spec id; ownership + not-archived enforced; archived/missing spec fails closed.
- **AC2.5 (cross-surface cooldown)** Cooldown tripped via the panel button is reported correctly by the chat tool and vice versa — same window, shared core, copy reads correctly from either side. Integration test includes a **two-brief fixture**: delivering a sample for brief A blocks brief B's chat send for the window, and the agent copy survives that case (PM risk 6 + exec advisory 11).
- **AC2.6 (moved from old AC1.3):** `deliver:true` with zero credits → pipeline credit gate skips compose, typed `{ok:false, code:'no_credits'}`, agent states consequence + top-up action (persona-free money line); no charge, no retry loop.

### J3 — Days later, bare `/chat` → edit ("too much on corn, drop it")
Bare `/chat` resumes the most-recently-active thread. Edit stages onto the draft; reconfirm panel (or typed confirmation) → `save_changes` applies in place.
- **AC3.1** Applied edit mutates `digest_specs.spec` for the **same row id**, `version` +1 per applied save.
- **AC3.2** No new `digest_specs` row, no status change, no cap-gate invocation (assert `saveSpecForUser` / `maxBriefsForEmail` never called on the edit path — module-mock assertion).
- **AC3.3** Invalid resulting spec (fails `DigestSpecV1` validation in `finalizeDraft`) → no write, version unchanged, plain-language explanation.
- **AC3.4** Abandoned mid-edit leaves `digest_specs.spec` byte-identical (staged edits live only in `draftSpec`); on return, pending markers render from `draftSpec` and the agent re-confirms before applying.
- **AC3.5** Manage-mode eval suites pass (deterministic + live, §4.4); setup-interview suites pass **unchanged** (separate prompt file; `configAgentTools` byte-identical). Local live runs use `EXTRACTOR_TIMEOUT_MS=20000`.
- **AC3.6** Ambiguous edit → exactly one clarifying question (≤12 words) before any staging; never re-runs the setup interview.

### J4 — Returns via `/briefs` → tweaks delivery time
Card "Chat" action → `/chat?brief=<id>` → bound thread → "make it 8am" → schedule updated in place, `nextRunAt` recomputed.
- **AC4.1** Every active and paused brief card shows "Chat" → `/chat?brief=<id>`; archived briefs never render cards — **verified** at `app/briefs/page.tsx:57` (`inArray(status, ["active","paused"])` in the page query, server-side), so archived rows can never get the action (exec advisory 2 closed by verification; if any future surface renders archived rows, the Chat action must be explicitly excluded there).
- **AC4.2** `/chat?brief=<id>` opens the thread whose `spec_id` matches; with 2+ briefs each card opens its own thread.
- **AC4.3** Bare `/chat` resumes most-recently-active thread (any purpose); no threads at all → new setup thread (current new-user behavior preserved).
- **AC4.4** Unowned/unknown/archived brief id → redirect `/briefs` (C4); all queries via canonical Drizzle client with explicit `userId` filter (the `db` client is service-role — RLS does NOT protect Drizzle queries).
- **AC4.5** Delivery-time confirmation uses computed time + timezone, never a hard-coded clock string; schedule wording routes through the **lifted `humanizeSchedule`** helper (§4.7) so chat and card strings cannot diverge.

### J5 — Sample before linking Telegram
- **AC5.1** Dry-run preview succeeds with no Telegram link.
- **AC5.2** At most one Connect-Telegram nudge per conversation segment (asserted in the live eval transcript, not vibes).

### J6 — Free user at cap edits their one brief (CAD-212)
- **AC6.1** Edit succeeds; non-archived `digest_specs` count for the user unchanged before/after; no archived duplicate created.
- **AC6.2** Free user at cap asking the manage chat for "another brief on X": agent does not silently mutate the existing brief; states the cap plainly and offers to change this brief; no invented upgrade CTA. (Prompt scope fence + live eval case.)
- **AC6.3** "New brief" at cap: existing `canCreate` gate behavior unchanged (disabled with the shipped "Multiple briefs are coming soon." title).

### J7 — Legacy thread / lazy manage thread
- **AC7.1** Backfill sets `spec_id` for threads whose messages contain `savedSpecId` (ambiguity rule §4.1); idempotent re-run is a no-op; apply-0026-pattern script run against prod BEFORE merge, printing counts. **The pre-merge apply contains NO status UPDATE** (exec RC1/RC4 — checkable by inspection and by test); thread reactivation is a separate post-deploy phase (§4.1 phase 2, §7.1 step 7).
- **AC7.2** First `/chat?brief=<id>` with no bound thread lazy-creates **exactly one** manage thread (partial unique index + re-select on violation, with a Sentry breadcrumb logged when the re-select path fires — it's the one race unreproducible in QA), seeded with two deterministic assistant messages containing no banned vocabulary (digest/spec/config) — enforced by unit test on `buildManageSeedSummary`, not convention.
- **AC7.3** Agent in a lazy-created thread answers "what does this brief watch?" correctly — from the per-turn spec context overlay (§4.3.4), which is the load-bearing context (the seed is for the *user's* orientation).

### J8 — Archived brief
- **AC8.1** `send_sample` and `save_changes` both refuse on `status='archived'` with the calm pointer to `/briefs`; no `digest_runs` row, no spec write. Archive-while-tab-open → next message gets the 409 `brief_archived` envelope, client swaps to the archived banner state — never a stale success.

### J9 — "New brief" coexistence
- **AC9.1** "New brief" (→ `/chat?new=1`) always creates/reuses a fresh zero-message `initial_config` setup thread; manage threads untouched; mid-setup user can open an old brief's chat and return — both threads coexist, draft persists.
- **AC9.2** Full setup→save E2E unchanged: existing wave regression tests green (incl. `wave4-bundled-regressions.test.ts`, brief-actions tests).

### J10 — "Add this feed too" (RSS ask in manage chat — exec RC3)
There is currently NO post-save path to add an RSS feed anywhere in the product, and `add_rss_feed` is (correctly, per locked decision 5's sample+edit scope) excluded from the manage registry.
- **AC10.1** A feed-add ask in a manage thread produces **zero spec/sample tool calls** and **no false success claim**. The agent states the true limitation honestly per COPY_GUIDE's honesty-boundary anatomy (what happened → what it means → one action), with no invented workaround — e.g. "I can't add feeds here yet — that was only possible while setting up. I can change what this brief watches, or its schedule." Asserted by a dedicated live eval case (§4.4 live case 7).

### Cross-cutting
- **ACX.1** Every chat-turn LLM call writes a `cost_events` row (both modes; closes a pre-existing gap, §4.3.5 — isolated commit, **explicit CTO ack required in PR review**, not treated as settled).
- **ACX.2** All new interactive elements: `focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-background`; semantic tokens only (`--brand/--success/--warning`), no raw colors.
- **ACX.3** No raw `api.sendMessage` outside the Telegram adapter dir; no raw snake_case in JSX (labels.ts moat) — lazy-seed schedule text uses the **lifted** `humanizeSchedule` (§4.7), never raw cron/JSON.
- **ACX.4** No user-visible string says "digest", "spec", "config", "manage mode", "thread", or "session" (COPY_GUIDE §4a + new §4c row); brief counts never phrased as a balance.
- **ACX.5** Analytics events fire: `manage_thread_resumed {source: briefs_card|bare_chat|post_save_same_session|lazy_created}`, `sample_requested {via: chat_tool|panel_button, dry_run}`, `sample_blocked {reason: cooldown|dry_run_cooldown|no_telegram|no_credits|archived}`, `brief_edit_applied {fields_changed, version_from, version_to}`.
- **ACX.6 (exec RC7 — context-window strategy):** manage-mode turns send a **capped transcript** to the model: `capManageTranscript(messages, N=20)` keeps the last N messages; the system prompt + per-turn spec overlay (§4.3.4) are always included and are the load-bearing state, so truncation never loses the spec. Unit-tested; the new chat-turn `cost_events` rows (ACX.1) are the monitoring signal that per-turn cost stays flat as threads age.
- **ACX.7 (exec RC5 — fail-closed kill switch):** with `MANAGE_MODE` off, the route 409s **any** thread with `spec_id != null` (regardless of status) and `/chat` resolution skips spec-bound threads entirely. A spec-bound thread can never fall through to the setup prompt/registry (and its archive-and-replace path) under flag-off. Route-guard matrix test row: "flag off + spec-bound active thread → 409".

**Success review trigger (post-ship, PM-owned):** if edit→applied conversion < ~60% after 2 weeks of real traffic, the manage prompt goes back through the eval loop before any other iteration. New-thread creations per user per week on `/chat` should drop to ~0 for users with saved briefs — **instrumented as a named query with a named owner** (exec advisory 5): PM runs `SELECT user_id, count(*) FROM chat_threads WHERE created_at > now() - interval '7 days' AND purpose = 'initial_config' GROUP BY 1` joined against users with ≥1 non-archived spec, at the +2-week review; the query text lives in the PR description's post-ship checklist so it cannot be lost.

---

## 3. UX spec

All deterministic strings below are final-candidate copy per COPY_GUIDE (sentence case, no exclamation marks, agent voice "I" / money+error lines persona-free, em dash spaced, error anatomy = what happened → what it means → one action). Agent-voiced lines live in the manage prompt and are eval-asserted (§4.4).

### 3.1 The transition moment (save succeeds, thread stays alive)
1. After a successful save the agent sends **exactly one** message, then stops:
   > "Saved. Your first brief arrives tomorrow at 7:00 (Asia/Kuala_Lumpur)." — computed time per COPY_GUIDE §4; fallback "Saved. Your first brief arrives tomorrow morning." The time/tz rendering routes through the **lifted `humanizeSchedule`** helper (§4.7) so the transition message, the chat seed, and the `/briefs` card can never disagree about the same schedule (exec advisory 6; matches the shipped `tzLabel` pattern at `briefs-client.tsx:541–542`).
2. **Chips carry the capabilities** (no prose tour): "Preview a sample" · "Send one to Telegram" *(only when linked — never render a chip that can't work)* · "Change something". Emission: `suggest_quick_replies` (eval-asserted) with the deterministic client fallback per C5.
3. **Header changes identity** (§3.3) — strongest "thread survived" signal, zero copy cost.
4. The existing `actions` panel still renders after first save, exactly as shipped. **Panel yield rule (explicit render-position implementation, Design risk 2):** the panel renders only while no *user* message exists after the message carrying its triggering save event; once the user sends any manage-mode message, the panel stops rendering for that event (chips and conversational asks remain the path back). Pure client-side derivation from message order — no state change, unit-testable.

### 3.2 Sample preview card
- New `components/chat/sample-preview-card.tsx`, rendered in the message list when a tool part has `toolName === 'send_sample' && state === 'result' && result.markdown`. Reuses the **existing `<Markdown>` whitelist renderer** (same path as `brief-actions` preview body): `rounded-md border border-border bg-background p-4 text-sm leading-relaxed`, B3 serif/citation styling where it already applies.
- Eyebrow caption: **"Sample — not delivered"** in `text-[10px] uppercase tracking-wide text-muted-foreground`. Load-bearing honesty. This is formalized as the **micro-label class** in COPY_GUIDE (§3.7 item 5) rather than left as an unwritten exception (exec advisory 3).
- Long samples: `max-h-96 overflow-y-auto`.
- Real send (`deliver: true`) renders no card — agent confirmation message only.

### 3.3 Header & navigation
- **Manage mode header, left:** breadcrumb-lite — muted text link **"Briefs"** (→ `/briefs`, underline-on-hover, full focus ring), `/` separator, brief display name as H1 (`truncate`). Display name via a shared helper extracted from `briefs-client.tsx` `displayName` logic (name → first topic → "Untitled brief") — extraction is mechanical, covered by a unit test, so chat header and card can never drift (Design risk 7: confine the refactor to lifting the function verbatim into `lib/` and importing it back; no resolver-adjacent code touched).
- Status badge after the name reusing `StatusBadge` styles: **Active** (`bg-success/15 text-success`) or **Paused** (muted). Paused briefs are fully chattable (verified: `sampleNow` excludes archived only).
- **Header right:** CreditPill stays; "Start over" replaced by **"+ New brief"** (outline, → `/chat?new=1`, gated by the same `canCreate` rule, disabled with the shipped "Multiple briefs are coming soon." title). **Founder sign-off checkpoint at PR review:** confirm the disabled state is acceptable in this more visible position (Design risk 6 — flagged, default is ship-as-specced).
- **Setup mode:** header stays "Set up your brief" exactly as shipped.
- **/briefs card:** "Chat" button **first** in the action row (before Pause/Archive), outline-secondary recipe matching the Pause button (`h-8 border border-border bg-background text-xs font-medium text-foreground`), lucide `MessageCircle` at `h-3.5 w-3.5`, **not** `bg-brand` (one CTA per surface — the page's brand button is "+ New brief"). Label: **"Chat"**. Link: `/chat?brief=<id>` via Next `Link` with the full focus-ring recipe.

### 3.4 Edit-in-progress — spec rail
- Rail header "Your brief" (drop "so far" once saved); subtitle **"Saved — tell me what to change."**
- Changed rows: new value in `text-foreground`; caption **"was {old value}"** in `text-[11px] text-muted-foreground`; `bg-warning` dot before the label (same size/position grammar as the existing `bg-success` ready-dot). Text + colour, never colour-only.
- Footer pill: `border-warning/40 bg-warning/10 text-warning` — **"2 changes pending"** (numeral). Collapsed-rail dot turns `bg-warning` while pending. Mobile `<details>` summary: **"Your brief — 2 changes pending"**.
- Pure helper `specDiff(saved, staged) → ChangedRow[]` beside `spec-sidebar.helpers.ts` (vitest-pinned, no jsdom, same pattern as `buildRows`).

### 3.5 Reconfirm panel (4th resolver state)
```ts
export type BriefActionsState = "hidden" | "confirm" | "actions" | "reconfirm";
briefActionsState({ ready, saved, pendingChanges })
// !ready                  → "hidden"
// ready && !saved         → "confirm"    (unchanged)
// saved && pendingChanges → "reconfirm"  (new)
// saved && !pendingChanges→ "actions"    (unchanged)
```
`pendingChanges` = `specDiff(savedSpec, draftSpec).length > 0`. One voice per state: `reconfirm` shows ONLY the update pair (no preview/send — sampling a half-edited brief is the pre-save disabled-button bug class):
- Heading: **"Update this brief?"**
- Body: **"Your changes apply from the next delivery. Nothing already sent changes."**
- Brand button: **"Looks good — update this brief"** (same `bg-brand` recipe + focus ring; appends a user chat message per the confirm contract — C2).
- Escape hatch: **"or keep changing it below"** (focuses composer, same `onTweak` mechanic).
- Post-save agent line: **"Updated. Your next brief reflects this."** Pending markers clear to the new saved baseline.

### 3.6 Edge-state UI
- **Delivery cooldown (agent voice):** "I sent one a few minutes ago. I can send another at {time}." (fallback "…in a few minutes.") + chip **"Preview it here instead"**. **Wording rule (exec advisory 11):** the window is per-user across all briefs, so the line is deliberately brief-agnostic ("I sent one…") — the prompt forbids attributing the wait to "this brief", and the live eval's two-brief phrasing check covers it. The deterministic panel keeps its shipped string. A canonical cooldown sentence pair (chat + panel variants) lands in COPY_GUIDE so the surfaces can't diverge.
- **Dry-run throttle (new, exec RC6):** "Give me a moment — I can show another preview in about a minute." Short window (60s), so no computed clock time; no panel variant needed (panel path unthrottled this wave).
- **Unlinked send:** agent: "Your brief needs somewhere to land first." + the **existing brand link CTA verbatim**: "Connect Telegram so your brief has somewhere to land →" (→ `/app/link`); then "Preview it here" chip. One nudge per segment.
- **Out of credits (deliver:true only — dry-runs are ungated, AC1.3/AC2.6):** **"Out of credits — top up to send a sample."** — persona-free (money lines never wear "I" even on the chat surface). **Founder/UX-writer sign-off required before strings freeze** (PM risk 1 — explicit checkpoint in work item 6; if rejected, only this row's wording changes, nothing structural).
- **Feed-add ask (exec RC3):** agent: "I can't add feeds here yet — that was only possible while setting up. I can change what this brief watches, or its schedule." True limitation, one action, no invented workaround. Lives in the manage prompt's scope fence; eval-asserted (live case 7).
- **Archived brief:** composer `disabled` + `aria-disabled`, chips suppressed, banner above the composer (`border-border bg-muted/40`): **"This brief is archived, so this chat is closed. Your conversation is kept here."** + text link **"Back to your briefs"** (→ `/briefs`). No "restore" promise. Server 409 backstop per C3.
- **Lazy-created thread seed** (deterministic server-side rows, no LLM, first paint never waits on a model):
  > Bubble 1: "Here's your brief: {topics, plain-joined}, {humanized schedule}." (via the lifted `humanizeSchedule` — never raw cron/snake_case)
  > Bubble 2: "Ask me for a sample, or tell me what to change."
  Chips: static manage set via the C5 deterministic rule (manage thread, zero user messages).
- **At-cap "another brief" ask in chat:** "Your free start covers 1 brief. I can change this one — tell me what to watch instead."

### 3.7 COPY_GUIDE additions (land in the same PR — it's canon, update it)
1. §4c vocabulary row: the post-save conversation is "**your brief's chat**"; banned in UI copy: "manage mode", "thread", "session" ("manage mode" stays internal vocabulary like `digest`).
2. §8 page-role map: Config chat row → "configure one brief, then keep it tuned"; add Briefs row (the hub — one job: get to the right brief's chat).
3. Canonical cooldown sentence (chat + panel variants), explicitly brief-agnostic.
4. "Chat" as the canonical card-action label.
5. **Micro-label class (exec advisory 3):** define the one legitimate uppercase micro-label pattern (`text-[10px] uppercase tracking-wide text-muted-foreground`, reserved for load-bearing state captions like "Sample — not delivered") so the exception is written down and the next surface can't cite it informally as general uppercase precedent.
6. Honesty-boundary entry for capability gaps the agent must own verbally (the feed-add line, §3.6).
Update `COPY_FIXES_PROPOSED.md` if conflicts surface in review.

---

## 4. Technical design

### 4.1 DB migration — split into two phases (exec RC1 + RC4)

**Why split (verified hazard):** legacy `app/chat/page.tsx:50–63` selects ANY active `initial_config` thread and `route.ts` serves any active thread with the **setup** agent. If the reactivation UPDATE ran pre-merge, live legacy code would resume reactivated threads as setup conversations with `confirm_and_save` available — at cap, `saveSpecForUser` (`save-spec.ts:77–82`) archives-and-replaces the user's live brief, which also invalidates the `spec_id` binding just backfilled. The original "legacy code never reads `spec_id`" forward-safety claim was wrong because **legacy code reads `status`**. Therefore: pre-merge applies only inert parts; reactivation runs post-deploy with `MANAGE_MODE` on.

**Pre-flight (before writing the migration):**
- Re-check `ls server/db/migrations | tail -1` and renumber if another wave landed (parallel worktrees share the repo; 0029 verified free as of 2026-06-12).
- Spot-check prod backfill coverage: `SELECT count(*) FROM chat_messages WHERE role='assistant' AND content ? 'savedSpecId';` — if sparse, lazy-create (decision 6) already covers the gap; proceed either way but record the count in the PR.

**Phase 1 — `server/db/migrations/0029_chat_thread_spec_binding.sql` (pre-merge prod apply; contains NO status UPDATE — checkable by inspection):**

```sql
-- 1. Column + FK. ON DELETE SET NULL: a dangling manage thread degrades
--    to setup, never errors. NOTE (documented in ARCHITECTURE.md, §5 item 8):
--    specs are archived, never hard-deleted today — if a future feature hard-
--    deletes specs, SET NULL silently turns a manage thread into a setup
--    thread carrying full manage history. Acceptable now; do not let a
--    delete feature trip over it unknowingly.
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS spec_id uuid REFERENCES digest_specs(id) ON DELETE SET NULL;

-- 2. Lookup index for /chat?brief=<id> resolution.
CREATE INDEX IF NOT EXISTS idx_chat_threads_spec
  ON chat_threads (spec_id) WHERE spec_id IS NOT NULL;

-- 3. Backfill with a two-sided ambiguity rule (PM risk 7):
--    (a) per THREAD: if a thread saved multiple specs historically, it binds
--        to its LATEST savedSpecId only;
--    (b) per SPEC: if multiple threads saved the same spec, the MOST RECENT
--        thread wins (prereq for the unique index in step 4).
--    Ownership cross-checked via digest_specs.user_id. Losers are logged by
--    the apply script, then covered by lazy-create.
--    Note: content->>'savedSpecId' returns SQL NULL for jsonb null, so
--    {"savedSpecId": null} rows are correctly skipped with no extra
--    predicate (pinned by a migration-test fixture).
WITH per_thread AS (
  SELECT DISTINCT ON (m.thread_id)
         m.thread_id, (m.content->>'savedSpecId')::uuid AS sid, m.created_at
  FROM chat_messages m
  WHERE m.role = 'assistant' AND m.content->>'savedSpecId' IS NOT NULL
  ORDER BY m.thread_id, m.created_at DESC
), per_spec AS (
  SELECT DISTINCT ON (sid) thread_id, sid
  FROM per_thread
  ORDER BY sid, created_at DESC
)
UPDATE chat_threads t
SET spec_id = b.sid
FROM per_spec b
WHERE t.id = b.thread_id
  AND t.spec_id IS NULL
  AND EXISTS (SELECT 1 FROM digest_specs s
              WHERE s.id = b.sid AND s.user_id = t.user_id);

-- 4. Invariant: at most ONE live manage thread per brief (lazy-create race
--    guard). INVARIANT NOTE (exec advisory 9): this index is provably safe
--    to create here only because (a) the per-spec DISTINCT ON rule in step 3
--    binds at most one thread per spec, and (b) at phase-1 time every bound
--    thread is still status='completed' (reactivation is phase 2), so the
--    partial predicate matches zero backfilled rows. A future edit to the
--    backfill MUST preserve the one-thread-per-spec rule or this CREATE
--    fails / the reactivation phase conflicts.
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_spec_active_uq
  ON chat_threads (spec_id) WHERE spec_id IS NOT NULL AND status = 'active';

-- 5. Per-user dry-run sample throttle ledger (exec RC6, §4.5). One nullable
--    column; RLS-neutral (only the service-role core touches it).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_sample_dry_run_at timestamptz;
```

**Phase 2 — `server/db/migrations/0029b_reactivate_manage_threads.sql` (post-deploy, run ONLY after Vercel is serving the new code with `MANAGE_MODE` on — §7.1 step 7):**

```sql
-- Reactivate backfilled threads whose brief is still live so they resume as
-- manage threads ('completed' stays legacy-terminal otherwise).
-- NOT EXISTS guard: a user may have lazy-created an active manage thread for
-- this spec between deploy and this script — skip those specs (their legacy
-- thread stays completed; history preserved) instead of violating
-- chat_threads_spec_active_uq. Idempotent.
UPDATE chat_threads t
SET status = 'active', updated_at = now()
FROM digest_specs s
WHERE t.spec_id = s.id AND t.status = 'completed'
  AND s.status IN ('active','paused')
  AND NOT EXISTS (SELECT 1 FROM chat_threads t2
                  WHERE t2.spec_id = t.spec_id AND t2.status = 'active');
```

- **`apply-0029.mjs` (clone the apply-0026 pattern):** `--phase=schema` (default) runs phase 1 only and **contains no status UPDATE on any path**; `--phase=reactivate` runs phase 2; `--phase=rollback` runs the reactivation inverse (`UPDATE chat_threads SET status='completed' WHERE spec_id IS NOT NULL AND status='active'`) — required before any post-reactivation `git revert`, see §7.2. Each phase verifies its objects (`information_schema.columns`, `pg_indexes`) and prints counts (threads bound, ambiguous threads skipped; phase 2: threads reactivated, specs skipped due to existing active thread). Idempotent — proof = run each phase twice against the branch DB, second run reports 0 changes. Run `node --env-file=.env.local server/db/apply-0029.mjs` (phase 1) against prod BEFORE merge. Never `db:push`.
- Threads pointing at archived specs (legacy archive-then-replace churn) stay `completed`/unbound — lazy-create covers them; no data loss.
- No `chat_threads.status` CHECK change needed (vocabulary stays `active|completed|archived`).
- RLS: column additions need no policy change; backfill runs as service role via the script. Every new app query uses the canonical Drizzle client (`server/db/client`) with explicit `eq(chatThreads.userId, user.id)` (service-role client — RLS does not protect Drizzle queries).
- Schema mirror in `server/db/schema.ts`: `specId: uuid("spec_id").references(() => digestSpecs.id, { onDelete: "set null" })` + both indexes (move `chatThreads` to the `(t) => ({...})` config form); `lastSampleDryRunAt` on `users`.

### 4.2 Thread lifecycle

**Mode is derived, not stored:** `mode = thread.specId != null ? 'manage' : 'setup'`. `completed` becomes legacy-only (no new writer). Setup threads keep `purpose='initial_config'`; lazy-created manage threads use the existing unwired `'reconfigure'` purpose (provenance only — mode never reads purpose).

**Route guard (`app/api/chat/route.ts:132`):** keep `status !== 'active'` → 409 (protects archived/reset threads and legacy completed threads the user deep-links). Then, **flag check first (exec RC5):**
```ts
if (!isManageMode() && thread.specId != null) {
  // Fail closed: a spec-bound thread must NEVER reach the setup prompt +
  // setup registry (confirm_and_save → saveSpecForUser archive-and-replace).
  return 409; // generic envelope
}
const mode = thread.specId ? "manage" : "setup";
if (mode === "manage") {
  // load spec row (id, user_id check, status, spec, version, name) — also
  // feeds the context overlay (§4.3.4);
  // missing or status === 'archived' → 409 { error: "brief_archived",
  //   message: <COPY-approved string> }
  // NOTE (exec advisory 8): body.messages is client-supplied model history
  // (pre-existing trust posture). Manage-mode WRITES never derive from it —
  // save_changes applies only the server-hydrated session.draft
  // (thread.draftSpec), and user_confirmed + draft-exists gates bound any
  // model lapse to "nothing saved". Comment lives in the route.
}
```

**`onFinish` (route.ts:394–403):** when `session.savedSpecId` is set, write `{ specId: session.savedSpecId, draftSpec: null, updatedAt: now }` — **status stays `active`**. Touch `updatedAt` on every turn, **and also on the user-message insert** (exec advisory 10) so an aborted stream still updates bare-`/chat` recency. Behind the flag (§7.2) the legacy `status='completed'` write is preserved.

**`/chat` resolution (`app/chat/page.tsx`):**
- **Flag off (exec RC5):** all thread lookups add `isNull(chatThreads.specId)`; `?brief=` redirects `/briefs`; behavior is byte-equivalent to legacy for unbound threads, and spec-bound threads are invisible to resolution (so reactivated threads can't be resumed by the setup path).
- `?brief=<id>` (flag on): validate uuid; load spec `and(eq(id), eq(userId, user.id))` with status in (`active`,`paused`) — else **redirect `/briefs`** (C4). Find thread `and(eq(userId), eq(specId), eq(status,'active'))` order `desc(updatedAt)` limit 1. None → lazy-create `{purpose:'reconfigure', status:'active', specId}` + seed two assistant `chat_messages` rows from `buildManageSeedSummary(spec)` (new pure helper, `server/chat/manage-seed.ts`, COPY-compliant, banned-vocab unit-tested, schedule text via lifted `humanizeSchedule`). On unique-index violation (double-tab race, or racing the phase-2 reactivation script), re-select and use the winner, **logging a Sentry breadcrumb** (exec advisory 14) — it's the one race we can't reproduce in QA and we want prod evidence the path works.
- bare `/chat` (flag on): most recent `status='active'` thread, **any purpose**, `desc(updatedAt)`. None → create setup thread (current behavior).
- `?new=1` ("New brief" target): reuse an existing zero-message active setup thread if present (refresh-spam guard), else insert fresh `initial_config`. `briefs-client.tsx` "+ New brief" href changes `/chat` → `/chat?new=1`; cards gain the "Chat" action.
- `?template=` deep-link flow untouched (always lands on a setup thread; default unchanged).
- Server passes `mode`, bound `specId`, spec name/status, saved `spec` (for `specDiff` baseline), and `initialSavedSpecId={thread.specId}` to `ChatClient`. `key={thread.id}` stays load-bearing — **QA item:** SPA navigation `/chat?brief=A` → `/chat?brief=B` must remount with no stale message bleed.
- **tRPC (`routers/chat.ts`):** `resetThread` carries `specId` onto the replacement, archive-old-then-insert **inside one transaction** (ordering matters for the partial unique index; covered by a router test). `getThread` returns `specId` via the existing `select()`. `completeThread` (zero callers, grep-confirmed) is deleted — **in its own commit** for clean revert granularity (exec advisory 13).

### 4.3 Agent changes

#### 4.3.1 Prompt — separate file
New `prompts/config_agent_manage_v1.md` (repo root) + `loadManageAgentSystemPrompt()` in `server/ai/config-agent/system-prompt.ts` (second cached loader, same candidate-path logic). `outputFileTracingIncludes` already globs `../../prompts/**/*.md` — verified, no config change. Rationale: `prompts/config_agent_v1.md` is eval-gated by the interview contract; a separate file keeps setup evals provably byte-identical.

Manage prompt covers: identity (managing an EXISTING brief — never re-interview); the manage toolset; the confirm-before-save contract (stage via `update_spec_field`, preview via `propose_spec`, treat the appended user message "Looks good — update this brief" **or** an explicit typed yes as confirmation, then exactly one `save_changes(user_confirmed:true)`); sample semantics ("show/preview" → `deliver:false` in chat; "send to Telegram" → `deliver:true`); cooldown phrasing rules (relay the wait conversationally with the computed time, never raw errors; **never attribute the delivery cooldown to "this brief"** — the window is per-user across all briefs); one-clarifying-question discipline; one Connect-Telegram nudge per segment; paused acknowledgment ("It's paused — your edits are saved for when you resume"); the at-cap second-brief line; and the **scope fence**: (a) pause/resume/archive/delete → point to `/briefs` (no such tools exist); (b) **RSS/feed-add asks (exec RC3)** → no tool exists and no post-save feed path exists anywhere in the product — state the true limitation honestly (the §3.6 feed-add line's semantics), never claim success, never stage a bogus topic edit as a workaround. The transition message, cooldown line, feed-add line, and post-update line are eval-asserted; **if eval iteration forces rewording, the new wording goes back through a COPY_GUIDE check before merge** (explicit step in work item 7).

#### 4.3.2 Tool registry — second registry, setup untouched
`tools/index.ts` keeps `configAgentTools` byte-identical (the deterministic eval asserts its exact keys). Add:
```ts
export const manageAgentTools = {
  propose_spec,           // reused: preview the edited draft
  update_spec_field,      // reused: stage edits onto session.draft
  ask_user,
  suggest_quick_replies,
  send_sample,            // NEW
  save_changes,           // NEW — in-place update, no cap
} as const;               // no confirm_and_save, no add_rss_feed (RSS edits out of
                          // scope this wave — prompt scope fence handles the ask, §4.3.1)
```
`runtime.ts`: `buildAiSdkTools(ctx, mode)` selects the registry (each wrapped in `safeExecute`). The route picks prompt + registry off `mode`.

#### 4.3.3 New tools
- **`send_sample({ deliver: boolean })`** (`tools/send_sample.ts`): calls the shared core (§4.5) with `{userId, specId: ctx.session.boundSpecId, dryRun: !deliver, origin: 'chat_tool'}`. Returns typed results — `{ok:true, markdown}` / `{ok:true, delivered:true}` / `{ok:false, code:'cooldown', scope:'delivery'|'dry_run', retryAfterMinutes}` / `{ok:false, code:'no_telegram'|'no_credits'|'archived'|...}` — so the model phrases failures; cooldown is a typed return, never a throw. Fires `sample_requested` / `sample_blocked` events.
- **`save_changes({ user_confirmed: boolean })`** (`tools/save_changes.ts`): mirrors `confirm_and_save`'s defended gate (`user_confirmed` must be true; draft must exist), `finalizeDraft(session.draft)`, then injected `ctx.updateSpec` → **`updateSpecInPlace`** (`server/ai/config-agent/update-spec.ts`):
  - One transaction: `UPDATE digest_specs SET spec, version = version + 1, name = deriveBriefName(spec), [scheduling/nextRunAt recomputed iff cadence changed], updated_at` WHERE `and(eq(id, specId), eq(userId), ne(status,'archived'))`. Same id forever; **zero cap interaction** (never imports `saveSpecForUser`/`maxBriefsForEmail`).
  - Returns `{id, version}`; tool sets `session.savedSpecId = id` (the existing persistence path stamps `content.savedSpecId`, keeping the backfill invariant true going forward) and clears `draftSpec`. Fires `brief_edit_applied`.
  - **B2-hard note (no scope expansion):** `save_changes` is deliberately the same agent-mediated-save class as `confirm_and_save`; the future deterministic-server-save hardening covers both via the same choke points (`updateSpecInPlace` / `saveSpecForUser`). Documented in the tool header so reviewers don't conflate the two.
- `ConfigAgentContext` (`types.ts`) widens: `session.boundSpecId?`, injected `updateSpec` / `sendSample` (kept injected like `saveSpec` so the deterministic eval stubs them without DB).

#### 4.3.4 Manage-mode turn context + transcript cap (exec RC7)
Per manage turn the route injects `buildManageContextBlock({name, version, spec})` (same pattern as `buildPriorContextBlock`): compact JSON of the current spec + "edits are staged on a draft; nothing changes until save_changes." `session.draft` hydration: `thread.draftSpec` if present (staged edits survive reload), else seeded from the saved spec via a pure `specToDraft()` helper.

**Context-window strategy:** persistent per-brief threads — especially reactivated legacy threads — grow without bound, and `route.ts` passes `body.messages` straight to `streamText`. Since the per-turn spec overlay (not the transcript) is the load-bearing state (AC7.3), manage turns cap the transcript server-side: pure helper `capManageTranscript(messages, N = 20)` keeps the last N messages; system prompt + overlay are always included (they ride outside `body.messages`). Unit-tested (oldest dropped, count bound, overlay unaffected). Setup turns are untouched (bounded by the ≤3-question interview by construction). The new chat-turn `cost_events` rows (§4.3.5) are the monitoring signal that the cap is holding — flat per-turn input tokens as threads age.

**Skip `extractSlots`, slot-merge, template-seed overlays, and the multi-topic intake refusal entirely in manage mode** — they're intake-tuned; running them would pollute `spec_extraction_event` telemetry and the extractor eval baseline.

#### 4.3.5 Cost tracking
- `send_sample` rides `runDigestPipeline`, which already writes `cost_events` (including dry-run composes — cost law holds). ✔
- Chat-turn `streamText` currently writes **no** `cost_events` (pre-existing gap). Close it: `onFinish({usage})` → one `cost_events` row (`kind:'llm_call'`, gpt-4o-mini pricing via `server/cost/record.ts`) per turn, both modes. ~15 lines, **its own commit**. **Exec advisory 1 acknowledged:** closing the *setup-turn* side of this gap is technically beyond the locked decisions (the cost law only mandates the new manage path) — the commit stays isolated and cherry-pickable, the PR description flags it, and **explicit CTO ack in PR review is a merge condition for that commit** (not treated as settled by this plan).

### 4.4 Eval strategy

**Setup evals untouched, provably:** `prompts/config_agent_v1.md` unmodified; `configAgentTools` byte-identical; the setup route path executes the same prompt+tools (mode branch only adds code on the manage side). Merge gate — run all four suites:
```bash
cd apps/web
npx vitest run test/config-agent.eval.test.ts                       # deterministic setup (CI)
npx vitest run test/config-agent-manage.eval.test.ts                # deterministic manage (CI, new)
RUN_LIVE_EVALS=1 OPENAI_API_KEY=sk-... EXTRACTOR_TIMEOUT_MS=20000 \
  npx vitest run test/eval-template-live.test.ts                    # live setup: golden set + ≤3-question contract
RUN_LIVE_EVALS=1 OPENAI_API_KEY=sk-... EXTRACTOR_TIMEOUT_MS=20000 \
  npx vitest run test/eval-manage-live.test.ts                      # live manage (new)
```
Live suites are non-deterministic — one flake ⇒ rerun before concluding. Paste output in the PR per the eval-gate law.

**New deterministic suite** `test/config-agent-manage.eval.test.ts` (descriptor replay, stubbed `updateSpec`/`sendSample`, no LLM) — the **edit golden set**, initial size 9 fixtures (threshold = all pass; grows from production `learning_log`/transcript misses after ship):
1. topic drop → expected JSONB delta, `save_changes` stub receives same spec id, version+1, merged snapshot
2. topic add → delta
3. cadence change → delta + scheduling-recompute flag
4. delivery-time change → delta
5. multi-field edit → combined delta
6. invalid edit (empties topics) → `finalizeDraft` rejects, no stub call
7. `save_changes` without `user_confirmed` → throws; with no draft → throws
8. `send_sample(deliver:false)` → stub called `{dryRun:true, specId:bound}`; delivery-cooldown stub return surfaced untouched as `{ok:false, code:'cooldown'}`
9. dry-run throttle stub return (`{ok:false, code:'cooldown', scope:'dry_run'}`) surfaced untouched — the model layer never sees a throw (exec RC6)
Plus: registry asserts exactly the 6 manage tool keys (mirrors the setup eval's guard).

**New live suite** `test/eval-manage-live.test.ts` (real manage prompt + `buildAiSdkTools(ctx,'manage')`, stubbed side-effects, ~7–11 gpt-4o-mini calls ≈ $0.01):
1. "can I see a sample first?" → exactly one `send_sample(deliver:false)`; no `save_changes`.
2. "actually make it weekly and drop the FX pairs" → `update_spec_field` staging + a preview/confirm ask; **no `save_changes` before** the scripted confirmation (run both confirmation forms: the panel-appended "Looks good — update this brief" and a typed "yes, save it"); after it, exactly one `save_changes(user_confirmed:true)`.
3. "pause this brief" → zero spec/sample tool calls (`ask_user` allowed); reply references the briefs page (COPY-tolerant regex).
4. Cooldown result injected → reply contains a wait phrasing, no raw error text, **and no "this brief" attribution of the wait** (two-brief phrasing check, exec advisory 11); offers preview.
5. Unlinked result injected → reply quotes "Connect Telegram" verbatim, exactly one nudge.
6. Save transition → exactly one post-save message + `suggest_quick_replies` emission (chip assertion; UX has the deterministic fallback regardless).
7. **RSS ask (exec RC3):** "add this feed too: example.com/feed.xml" → **zero spec/sample tool calls** (`ask_user`/`suggest_quick_replies` tolerated), reply asserts the honest limitation and contains **no success claim** (negative regex on "added"/"done"/equivalents) and no staged topic edit.
**Budget note (accepted):** gpt-4o-mini honoring the confirm gate is prompt-enforced and the live eval is the only guard — budget prompt-iteration time before the suite stabilizes; the deterministic gate (`user_confirmed` + draft checks in code) limits blast radius of any model lapse to "nothing saved", never "wrong save".

### 4.5 sampleNow refactor — shared core (+ dry-run throttle, exec RC6)
Extract `server/digest/sample.ts`:
```ts
export async function runSampleForUser(args: {
  userId: string; dryRun: boolean;
  origin: 'chat_tool' | 'trpc';   // dry-run throttle applies to chat_tool only this wave
  specId?: string;          // manage tool: bound spec (ownership + not-archived guard)
  expectedSpecId?: string;  // legacy tRPC path: is_current + not-archived assertion
}): Promise<SampleResult>   // {ok, markdown?, run?, code?: 'cooldown'|'stale_spec'|'no_telegram'|'no_credits'|...,
                            //  scope?: 'delivery'|'dry_run', retryAfterMs?}
```
Body = verbatim move of `digest.ts:56–125` (expectedSpecId/is_current guard, delivery-cooldown query — `SAMPLE_NOW_COOLDOWN_MS` moves here, `retryAfterMs` computed from the newest qualifying run — then `runDigestPipeline({userId, specId, dryRun, trigger:'sample'})`, which already accepts `specId` with resolution order claimed-run > explicit specId > is_current fallback: **zero pipeline changes**). Typed results instead of throws. Plus:

- **Dry-run throttle (NEW):** for `origin === 'chat_tool' && dryRun`, an atomic claim against the new `users.last_sample_dry_run_at` column (§4.1 step 5):
  `UPDATE users SET last_sample_dry_run_at = now() WHERE id = $user AND (last_sample_dry_run_at IS NULL OR last_sample_dry_run_at < now() - interval '60 seconds') RETURNING id` — zero rows ⇒ `{ok:false, code:'cooldown', scope:'dry_run', retryAfterMs}` before any compose. Rationale: dry-runs bypass both the 5-min delivery cooldown and the credit gate (verified `run.ts:302–305`) and are rowless (`run.ts:277`), so without this they're an agent-loopable zero-credit full-pipeline compose. The atomic single-row claim is durable across serverless instances, race-safe, and bounds even the in-turn maxSteps loop to one compose per 60s. The panel "Preview" button (tRPC origin) is exempt this wave — it's user-click-bound and changing it would touch shipped brief-actions behavior.
- Delivery cooldown applies to delivered samples only (failed runs excluded) — inherited by both surfaces from the one query, so the cross-surface window is shared by construction; **the window is per-user across all briefs** (verified: no spec filter in the query) — kept as-is this wave, handled in copy (§3.6) and tested with the two-brief fixture (AC2.5).

Call sites:
- `digest.sampleNow`: thin wrapper (`origin:'trpc'`) mapping `{code:'cooldown'}` → `TRPCError TOO_MANY_REQUESTS` and `{code:'stale_spec'}` → `PRECONDITION_FAILED` with **identical messages** (brief-actions error handling depends on them — locked by router test).
- `send_sample`: passes `specId` directly (guard = ownership + not-archived on the bound spec, not is_current — multi-brief correct), `origin:'chat_tool'`.
- **Telegram `/sample` command and admin replay paths** call `runDigestPipeline` directly, bypassing this wrapper — confirm no import shuffle breaks them (grep + their existing tests in commit 2).

### 4.6 Client wiring (brief-actions compatibility — do-not-regress)
- `briefActionsState` extended per §3.5 (C1); existing test rows unmodified, new rows appended.
- `chat-client.tsx:407` derives `savedSpecId` from the last `confirm_and_save` tool result — manage threads have none, so: **precedence rule (exec advisory 12): `savedSpecId = initialSavedSpecId ?? lastToolResult`** — the thread-bound `initialSavedSpecId` (= `thread.specId`, server-authoritative) wins over any tool result lingering in transcript history. This matters for the CAD-212 founder path: `confirm_and_save` under the cap hands `is_current` to a NEW spec without archiving the old one, so a reused/legacy thread's history can contain a `confirm_and_save` result pointing at a *different* spec than the thread's binding — the binding must win. Within a live setup session (no `initialSavedSpecId` yet), the fresh tool result still drives the panel exactly as shipped. Also recognize `save_changes` results when scanning (same `spec_id` shape; on a bound thread they always equal `initialSavedSpecId` by construction). Unit-tested precedence row in §6.
- Result: manage threads open with the panel in `actions` state, Preview/Send asserting the bound id via `expectedSpecId` — valid forever thanks to in-place edit.
- `SamplePreviewCard` per §3.2; panel yield rule per §3.1(4); deterministic chip fallback per C5; archived banner per §3.6; header per §3.3.

### 4.7 Shared helper extractions (exec RC2 — explicit work item)
Two mechanical lift-and-import extractions, both **verbatim moves with unit tests, no behavior change**, landed before the lifecycle/UI commits that consume them:
1. **`humanizeSchedule`** — currently module-private and duplicated in two `"use client"` components (verified: `app/briefs/briefs-client.tsx:533`, `app/briefs/[id]/brief-detail-client.tsx:794`), so it is **not importable server-side today**. Lift verbatim into a server-safe shared module `lib/schedule.ts` (pure function, no React/client imports), add a unit test pinning current outputs (incl. the `tzLabel` rendering at `briefs-client.tsx:541–542`), and repoint **all three call sites**: the new server consumer (`server/chat/manage-seed.ts`) **and both client duplicates** (delete the private copies — no third duplicate, ever). The transition-message time rendering (§3.1) routes through the same helper (exec advisory 6) so chat and card schedule strings cannot diverge.
2. **`displayName`** — same discipline, lifted from `briefs-client.tsx` into `lib/` for the manage header (§3.3). Confined to the function lift; no resolver-adjacent code touched.

---

## 5. Work breakdown (ordered — one PR, riskiest-first commits)

1. **Migration (two-phase) + schema mirror.** `0029_chat_thread_spec_binding.sql` (schema phase — no status UPDATE), `0029b_reactivate_manage_threads.sql` (reactivation), `apply-0029.mjs` with `--phase=schema|reactivate|rollback`, `server/db/schema.ts` (incl. `users.lastSampleDryRunAt`). Pre-flight checks (§4.1). Test on a branch DB: per-phase double-run idempotency proof, ambiguity-rule fixtures (thread-saved-two-specs, two-threads-saved-one-spec), **`savedSpecId: null` jsonb-null fixture** (advisory 7), reactivation NOT-EXISTS skip fixture. Apply **phase 1 only** to prod before merge.
2. **Shared sample core.** `server/digest/sample.ts` extraction + dry-run throttle + `routers/digest.ts` thinning. Refactor locked by tests (exact TRPCError codes/messages); throttle unit tests; confirm Telegram `/sample` + admin replay untouched (grep + existing tests).
3. **Shared helper extractions (exec RC2).** `lib/schedule.ts` (`humanizeSchedule` lifted verbatim, both client duplicates repointed and deleted) + `lib/` `displayName`; unit tests pinning current outputs. No behavior change — its own commit.
4. **Thread lifecycle.** Route guard incl. **flag-off spec-bound 409** + `brief_archived` envelope; `onFinish` spec-bind write; `updatedAt` touches (per-turn **and on user-message insert**); `capManageTranscript`; `/chat` resolution incl. flag-aware lookups, `?brief=`, `?new=1`, lazy-create + seed + Sentry breadcrumb on re-select (`app/chat/page.tsx`, `server/chat/manage-seed.ts`); `resetThread` specId carry-over transaction; feature flag (`lib/feature-flags.ts`). **`completeThread` deletion in its own commit** (zero callers, grep-confirmed — advisory 13).
5. **Agent manage mode.** `prompts/config_agent_manage_v1.md` (incl. RSS scope fence + cooldown phrasing rules); loader; `types.ts`; `tools/send_sample.ts`; `tools/save_changes.ts`; `server/ai/config-agent/update-spec.ts`; registries; `runtime.ts` mode param; route wiring incl. context overlay + client-history comment (advisory 8); analytics events; chat-turn `cost_events` (separate commit, CTO-flagged, **explicit CTO ack required**).
6. **Client/UI.** Resolver 4th state + reconfirm panel; `specDiff` + rail pending treatment; `SamplePreviewCard`; panel yield rule; deterministic chip fallback; `savedSpecId` precedence rule (advisory 12); manage header (breadcrumb, badge, "+ New brief", shared helpers from item 3); archived banner + disabled composer; `briefs-client.tsx` Chat action + `?new=1` href; COPY_GUIDE additions (§3.7, incl. micro-label class). **Strings-freeze checkpoint: founder sign-off on the persona-free credit line + the at-cap disabled "+ New brief" placement.**
7. **Evals + tests.** Both new suites + units/integrations from §6; run all four eval suites; any eval-forced prompt rewording goes back through a COPY_GUIDE check.
8. **Docs.** `server/ARCHITECTURE.md` thread-lifecycle note (mode derivation; `completed` = legacy-only; **explicit ON DELETE SET NULL note**: hard-deleting a spec would silently degrade its manage thread to setup carrying full manage history — fine while specs are archive-only, a tripwire for any future hard-delete feature — advisory 4); COPY_GUIDE/COPY_FIXES updates.

~20–24 files changed, ~9 new.

---

## 6. Test & QA plan

| Layer | What | How |
|---|---|---|
| unit (vitest, CI) | `briefActionsState` — existing rows unmodified + new `reconfirm`/`pendingChanges` rows; `specDiff`; `buildManageSeedSummary` (incl. **banned-vocab assertion**: no "digest"/"spec"/"config" across fixture specs); `specToDraft`; mode derivation; `buildManageContextBlock`; **`capManageTranscript`** (last-N bound, oldest dropped, overlay/system untouched — RC7); lifted `humanizeSchedule` + `displayName` (outputs pinned to pre-lift behavior — RC2); panel yield rule derivation; **`savedSpecId` precedence** (`initialSavedSpecId` beats stale `confirm_and_save` result — advisory 12) | pure-function tests |
| unit | `updateSpecInPlace`: version +1, same id, name/scheduling recompute iff cadence changed, archived rejection, **never calls `maxBriefsForEmail`** (module-mock cap-bypass assertion — AC6.1) | mock db transaction per `test/digest-retry.test.ts` pattern |
| unit | `runSampleForUser`: typed delivery-cooldown + `retryAfterMs` math, failed-run exclusion, `expectedSpecId` vs `specId` branches; **dry-run throttle (RC6)**: chat_tool dry-run within 60s → `{ok:false, code:'cooldown', scope:'dry_run'}` before compose, atomic-claim semantics, trpc origin exempt, deliver path unaffected | mock db + `runDigestPipeline` |
| integration | Route guard matrix: setup-active 200 / archived-thread 409 / manage-active 200 / manage-with-archived-spec 409-`brief_archived` / cross-user → no leakage / **flag off + spec-bound active thread → 409 (RC5)**; `onFinish` sets `spec_id` not `completed`; flag-off restores legacy writes AND resolution skips spec-bound threads | extract a pure `resolveThreadGate` helper and unit-test it (preferred per repo philosophy) + route handler test |
| integration | **Cross-surface cooldown** (AC2.5): run recorded via the tRPC path blocks the tool path and vice versa (same query window); **two-brief fixture** — brief A's delivery blocks brief B's chat send (per-user window, advisory 11) | mocked db, shared core |
| integration (tRPC) | `resetThread` carries `specId` archive-then-insert in one transaction (unique-index safe); `sampleNow` wrapper preserves exact TRPCError codes/messages; lazy-create race: unique violation → re-select (+ breadcrumb call asserted) | router tests, mocked db |
| migration | apply-0029 on branch DB: **phase 1 contains no status UPDATE (assert on script SQL + post-run status counts)**; backfill counts; per-phase double-run no-op; ambiguity fixtures; **`{"savedSpecId": null}` jsonb-null fixture skipped (advisory 7)**; phase-2 reactivation incl. NOT-EXISTS skip when an active bound thread already exists; `--phase=rollback` inverse | branch DB run, output in PR |
| eval | §4.4 — two deterministic suites in CI (9 fixtures + registry guard); two live suites locally with `EXTRACTOR_TIMEOUT_MS=20000` (7 scenarios incl. RSS ask), output pasted in PR | merge gate |
| regression | `wave4-bundled-regressions.test.ts`, all existing brief-actions tests, full `npx vitest run` (not `pnpm test`), `tsc` typecheck | CI |
| visual QA (manual) | Per Design checklist on **Vercel Preview with a seeded user** (no local Supabase env — accepted constraint; static-HTML repro covers component states first): (1) manage header truncation @390px, focus rings dark-mode white-halo check; (2) reconfirm panel both themes + keyboard path Tab→confirm→escape→composer; (3) rail warning dot + "was…" caption dark-mode legibility, mobile summary; (4) sample card scroll cap + eyebrow contrast + B3 citation parity; (5) archived banner + visibly disabled composer; (6) chips @390px no third line, linked vs unlinked sets; (7) /briefs Chat button first, no layout shift, archived card has no Chat; (8) transition replay: save → one message → chips → panel yields after next user turn; (9) SPA nav `?brief=A`→`?brief=B` no stale bleed; (10) bare `/chat` resume vs `?new=1` | `/qa` pass on preview deploy before merge |

---

## 7. Rollout & rollback

### 7.1 Ship sequence (revised per exec RC1/RC4/RC5 — reactivation is post-deploy)
1. Isolated worktree (`git worktree add` — parallel sessions share `~/code/cadence`, never assume sole tree ownership). Re-verify migration number first.
2. Land commits per §5; CI green; live evals green locally (output in PR).
3. Branch-DB rehearsal of **all three script phases** (schema, reactivate, rollback) incl. idempotency proofs.
4. **Pre-merge prod apply: `apply-0029.mjs` (default `--phase=schema`) ONLY** — column, indexes, `spec_id` backfill, throttle column. **No status UPDATE runs pre-merge** (checkable: the schema phase contains none). Forward-safe with live legacy code: nullable column + partial indexes; legacy code never reads `spec_id`, and — the part that made the split necessary — no thread's `status` changes, so legacy `/chat` resolution behavior is byte-identical.
5. PR with: eval outputs, backfill counts, CTO flag **and explicit ack** on the cost-events commit, founder sign-off confirmations (credit-line voice; "+ New brief" disabled placement), the post-ship PM query (§2 success trigger), and the **founder heads-up note**: the post-deploy reactivation step (7) revives old completed threads, so the first post-reactivation bare-`/chat` visit may land in an old conversation — intended per decision 3.
6. Set `MANAGE_MODE` in Vercel env, then squash-merge after CPO+CTO approval; Vercel auto-deploy ships flag-on.
7. **Post-deploy, after verifying the new code is serving:** run `apply-0029.mjs --phase=reactivate` against prod. The NOT-EXISTS guard skips any spec whose user already lazy-created an active manage thread between deploy and now; record reactivated/skipped counts in the PR thread.
8. Post-deploy smoke: open a reactivated legacy thread via `/chat?brief=<id>`, send "show me a sample" → preview card; check `/briefs` Chat action; check one `manage_thread_resumed` and one chat-turn `cost_events` row landed; send two quick "preview" asks → second returns the dry-run wait line (throttle live).

### 7.2 Rollback
- **Env flag (primary kill switch), fail-closed for spec-bound threads (exec RC5):** `MANAGE_MODE` read through `isManageMode()` in `lib/feature-flags.ts` (one read site, mirrors `isProTierAlpha`). OFF ⇒ (a) the route **409s any thread with `spec_id != null` regardless of status** — reactivated/lazy-created manage threads can never fall through to the setup prompt + `confirm_and_save`/archive-and-replace; (b) `/chat` resolution skips spec-bound threads (users get legacy behavior: resume an unbound active thread or a fresh setup thread); (c) `?brief=` redirects `/briefs`; (d) Chat card action hidden; (e) `onFinish` writes legacy `status='completed'`. Flip in Vercel env + redeploy = ~2-minute rollback that is now actually safe post-reactivation; `spec_id` is inert metadata when off; no data cleanup.
- **Code revert:** single squash commit ⇒ `git revert <sha>` — **but if phase-2 reactivation has already run, run `apply-0029.mjs --phase=rollback` FIRST** (sets all spec-bound active threads back to `completed`). Reverted legacy code has no flag and no `spec_id` awareness, so leaving reactivated threads active would recreate the exact RC1 hazard; the rollback phase removes them from legacy resolution entirely (completed threads are never resumed; users get fresh setup threads). DB column remains harmless. No down-migration required (if ever desired: `DROP INDEX …; ALTER TABLE chat_threads DROP COLUMN spec_id; ALTER TABLE users DROP COLUMN last_sample_dry_run_at;` — FK only, no dependents).

---

## 8. Out of scope (explicit)

1. Conversational pause/resume/archive/delete — `/briefs` buttons only; the agent may mention `/briefs` but has no tools for these.
2. Revision history / snapshot table / undo — `version` is an integer increment only.
3. B2-hard (deterministic server-side save) — interaction noted in `save_changes` header; no rework of `confirm_and_save`/`saveSpecForUser`.
4. Any change to the setup interview — prompt, ≤3-question contract, starter cards, gallery, confirm state all frozen.
5. Cap/pricing changes — free=1 (founder 2), Pro=5; archive+replace-at-cap for new briefs unchanged; no upgrade flow.
6. Delivery-cooldown changes — 5 minutes per-user stays (incl. its cross-brief scope, handled in copy); only the wording in chat changes. The new 60s **dry-run** throttle (RC6) is additive abuse-bounding, not a product cooldown change.
7. Renames — "brief" stays "brief"; internal `digest_*` vocabulary untouched.
8. RSS-feed editing in manage mode (`add_rss_feed` excluded from the manage registry; the *ask* is handled honestly via the prompt scope fence + eval per exec RC3 — building the capability is a future wave), WhatsApp/non-Telegram delivery, scheduled-run changes, tune-via-web parity, brief cloning, template-gallery re-entry mid-conversation.
9. Orphaned-thread cleanup UI — backfill + lazy-create handle continuity.
10. Analytics dashboards — event writes only; derived metrics queried offline (PM owns the named new-thread-rate query, §2).
11. Throttling the panel "Preview" button's tRPC dry-run path — user-click-bound, shipped behavior; revisit only if abuse data says otherwise.

---

## Appendix A — Risk register (every role-plan open risk → disposition)

**PM:** (1) money-line voice tension → persona-free phrasing locked in §3.6 with founder sign-off checkpoint in work item 6. (2) bare-/chat ambiguity for multi-brief users → resolved by the §3.3 breadcrumb header naming the brief; /briefs is the primary door. (3) manage eval set undefined → defined: 9 deterministic fixtures + 7 live scenarios, all-pass threshold, grows from production transcripts (§4.4); setup prompt provably untouched via separate file + byte-identical registry. (4) archive/pause mid-conversation + lazy-create races → fail-closed 409 `brief_archived` at call time, partial unique index + re-select (+ Sentry breadcrumb); both explicitly tested (§6). (5) edit path vs cap gate → `updateSpecInPlace` never imports cap code, enforced by module-mock test (AC6.1/AC3.2); B2-hard interaction documented in the tool header. (6) cross-surface cooldown → shared core by construction + dedicated integration test incl. two-brief fixture (AC2.5) + canonical cooldown sentence pair in COPY_GUIDE. (7) backfill mis-binding → two-sided DISTINCT ON ambiguity rule, losers logged, lazy-create covers them, per-phase double-run idempotency proven on branch DB (§4.1). (8) seed banned-vocab → unit-test-enforced on `buildManageSeedSummary` output (§6).

**Design:** (1) staged-edit storage → locked: `draftSpec` staging + `save_changes`-only writes (C7). (2) duplicate panel/agent voices → explicit panel yield rule, unit-tested derivation (§3.1). (3) chip flakiness → deterministic client fallback (C5) + eval assertion. (4) archived read-only honesty → server 409 backstop + banner, copy and server agree (C3). (5) eval-forced copy drift → re-check against COPY_GUIDE is a named step in work item 7. (6) disabled "+ New brief" at cap → founder sign-off checkpoint, item 6. (7) displayName refactor near PR #40/#42 surfaces → mechanical lift-and-import only, unit-tested, resolver untouched by it (§4.7). (8) no local Supabase for authed QA → accepted; static-HTML repro for component states, Vercel Preview + seeded user for the transition replay (§6). (9) paused-brief sampling → verified in repo: sampleNow excludes archived only; paused is sampleable; badge stays orientation-only.

**SWE:** (1) migration-number collision → pre-flight re-check, renumber if taken (§4.1, work item 1). (2) sparse `savedSpecId` backfill → prod spot-check query before relying; lazy-create is the designed fallback either way. (3) reactivated threads surprising the founder → accepted with explicit heads-up in the PR/deploy notes (§7.1), and the hazard side of it eliminated by the post-deploy phase split (exec RC1/RC4). (4) confirm-gate model compliance → live eval + code-level deterministic gates bound the failure to "nothing saved"; prompt-iteration budget noted (§4.4). (5) SPA thread-switch staleness → named manual QA item (§6). (6) resetThread index-ordering bug → archive-then-insert in one transaction, router test (§4.2/§6). (7) cost-events baseline shift → isolated commit, CTO-flagged, cherry-pickable, **explicit CTO ack required** (§4.3.5). (8) Vercel prompt tracing → verified: `prompts/**/*.md` glob already covers the new file. (9) Telegram /sample + admin replay → bypass the wrapper entirely; explicit grep + test confirmation in commit 2 (§4.5). (10) COPY_GUIDE review of all new strings → final-candidate copy inlined in §3, COPY_GUIDE additions land in the same PR, strings-freeze checkpoint in item 6; "brief" stays "brief".

---

## Appendix B — Exec review disposition (all items incorporated; deferred advisories: none)

**Required changes:**

| # | Requirement | Where addressed |
|---|---|---|
| RC1 | Reactivation must not run pre-merge; flag-off must fail closed | §4.1 phase split; §7.1 steps 4–7; §7.2 fail-closed flag (ACX.7) |
| RC2 | Explicit work item to extract `humanizeSchedule` (verified module-private duplicates at `briefs-client.tsx:533`, `brief-detail-client.tsx:794`) | §4.7; work item 3; §6 unit row; ACX.3/AC4.5 |
| RC3 | RSS ask in manage prompt scope fence + live eval case | §4.3.1 scope fence (b); §3.6 feed-add line; §4.4 live case 7; J10/AC10.1 |
| RC4 | Split migration 0029; apply script's default phase contains no status UPDATE; §7.1 sequences reactivation after deploy | §4.1 (two SQL files + `--phase` flag); §6 migration row asserts no-status-UPDATE; §7.1 |
| RC5 | spec_id-aware kill switch: flag off ⇒ 409 spec-bound threads + resolution skips them; test row | §4.2 route guard; §4.2 resolution; ACX.7; §6 guard-matrix row; §7.2 |
| RC6 | Throttle dry-run sampling (verified: dryRun bypasses cooldown + credit gate, rowless); reconcile AC1.3 | §4.5 atomic 60s claim on `users.last_sample_dry_run_at` (§4.1 step 5); AC1.3 rewritten (dry-run = ungated but throttled), AC2.6 carries the zero-credit case for deliver:true; §6 unit row; deterministic eval fixture 9 |
| RC7 | Context-window strategy for manage turns | §4.3.4 `capManageTranscript` (N≈20, overlay always included); ACX.6; §6 unit row; cost_events as monitor |

**Advisories (1–14, all incorporated):** (1) cost-events commit stays isolated + explicit CTO ack as merge condition — §4.3.5, work item 5, §7.1. (2) archived-cards filter now **verified** at `app/briefs/page.tsx:57` — AC4.1. (3) micro-label class written into COPY_GUIDE — §3.7 item 5. (4) ON DELETE SET NULL hard-delete tripwire documented in ARCHITECTURE.md — §4.1 step 1 comment, work item 8. (5) named PM query + owner for the new-thread metric — §2 success trigger, §7.1 step 5. (6) transition-message time via lifted `humanizeSchedule` — §3.1, §4.7. (7) `savedSpecId: null` jsonb-null fixture — §4.1 step 3 comment, §6 migration row. (8) manage writes never derive from client history — route comment, §4.2. (9) DISTINCT-ON invariant comment above the unique index — §4.1 step 4. (10) `updatedAt` touched on user-message insert — §4.2 onFinish para. (11) per-user cross-brief cooldown phrasing + two-brief fixture — §3.6, AC2.2/AC2.5, live eval 4. (12) `initialSavedSpecId` precedence over stale tool results — §4.6, §6 unit row. (13) `completeThread` deletion in its own commit — §4.2, work item 4. (14) Sentry breadcrumb on lazy-create re-select — §4.2, AC7.2, §6 router-test row.