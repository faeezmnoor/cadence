# Engineering critique — PM & Designer positions

## Where we agree (and should stop debating)

All three of us land on the same load-bearing invariants: re-curate `templates.ts` first (the 5 excluded-list pills are a live bug), stable `id`s + `visible: false` for `classifyTopic` telemetry, agent stays the sole writer of `draft_spec`, `seedHints` via `prior-context.ts`, no DB-backed catalog. That consensus is the proposal's spine — lock it.

## PM position — feasibility critique

**"Days, not weeks" undersells item 2.** Re-curation (item 1) is genuinely a config-only change. But "rewrite exampleQuerys to be spec-dense + seedHints" is not — spec-dense queries are exactly where `extract.ts` variance bites. A longer query gives the slot extractor *more* surface to mis-parse, not less. Without the golden-set vitest suite (each visible template's `exampleQuery` asserted against expected slots, `seedHints` validated against `digestSpecDraftSchema`), the PM's "≥4 of 6 sidebar fields after turn 1" metric is unfalsifiable at edit-time and will regress silently every time Faeez tweaks a query string. The test suite is the cheap part (~half a day) and must be in the same wave as item 2, not deferred.

**Option B (persona-first fork) is the hidden iceberg in "the same wave."** ICP detection changing the agent's question path is system-prompt + tool-behavior work on an LLM whose tool compliance is already documented as fuzzy (`suggest_quick_replies` needed a fallback). It needs its own eval harness, branching prompt logic, and probably thread-level ICP state. That's a separate multi-day project with real regression risk to the existing 4–7-turn flow — sequence it strictly *after* A ships, don't fold it in. Option C (canned sample excerpts) is content authoring + a new `MessageBubble` render path; fine as a held card, correctly deprioritized.

**Two metrics aren't instrumented and the PM hand-waves it.** "Signup → first `confirm_and_save`" and D7 brief survival require `template_id` stamping on the thread and a join at save time — that's my analytics item, and it must ship in Phase 1 or option A teaches us nothing. "Instrument it this week if it isn't" — it isn't; budget the day.

**The "More examples" inline swap is cheap and correct** — strictly less code than my disclosure grid. No objection; it's the same component family.

## Designer position — feasibility critique

**The recommendation is buildable but the costs are unevenly hidden:**

- **Bottom sheet with drag-to-dismiss is the expensive item, not the modal we both killed.** No radix means hand-rolling touch gesture handling, momentum, scroll-lock interplay with the chat scroll container, and reduced-motion fallback. That's 1–2 days of fiddly work for the mobile path alone. Counter: ship the inline expanding section on *both* breakpoints for v1 (single column on mobile, full-width, no gesture code). Bottom sheet is Phase 3 polish.
- **The staggered "panel fills within ~1s" animation has a dependency problem.** `SpecSidebar` polls `getDraft` via tRPC invalidated on `onFinish` — fields appear when the *assistant turn completes*, which is 3–8s after the tap, not ~1s. Delivering the choreographed 100–150ms stagger requires either optimistic client-side rendering of `seedHints` (a second source of sidebar truth — exactly the dual-pipeline smell we banned for `draft_spec`, now reintroduced at the display layer) or restructuring the draft sync to stream. Recommend: keep the stagger as a CSS transition on whatever the poll returns, accept "fills after the first assistant turn," and don't promise the 1s number.
- **"Agent must confirm + personalize, never re-ask"** is a prompt-engineering aspiration, not a UI deliverable. Same fuzzy-compliance caveat as quick-replies — it needs the golden-set tests extended to conversation-level assertions, or at minimum manual dogfood sign-off per template. The gallery's value proposition rests on this working; flag it as the riskiest item in the whole proposal, because if the interview doesn't shorten, the Designer's own line applies: the gallery is theater.
- **Card anatomy with mandatory cadence hints creates a sync burden:** the card says "Daily, 8:00am" but cadence truth lives in `seedHints`. Render the hint *from* `seedHints.cadence` — never a second hardcoded string, or they drift.
- **Collapsing the right panel at turn 0** is a good catch but touches `SpecSidebar` and its tests — scope it as a separate small PR, not a rider.
- **Risk neither flagged:** auto-submit from cards goes through `append` — verify the `detectMultiTopic` interceptor and rate limit (5/60s) treat programmatic submissions identically to typed ones; a multi-entity `exampleQuery` ("corn, wheat and sugar") could trip the 3-topic guard on our own template.

## What must change in the final proposal

- **Golden-set extraction tests ship in Phase 1**, same PR as the re-curated `exampleQuery`s — spec-dense queries without CI-pinned extraction behavior is the top maintenance risk.
- **Cut the bottom sheet from v1**; inline expanding section on all breakpoints. Gesture-driven sheet is Phase 3.
- **`template_id` thread stamping + `brief_saved {template_id}` analytics are Phase 1 blockers**, or no metric in the PM's list is measurable.
- **Sequence ICP-detection (PM's option B) as its own wave after A ships**, with its own eval pass — not "folded in."
- **Honest sidebar timing:** drop the "~1s fill" promise; render card cadence hints from `seedHints`, never duplicated strings; verify `detectMultiTopic` and rate-limiting against auto-submitted template queries before launch.