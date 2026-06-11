# Cadence brief-creation flow — final proposal

*Facilitated synthesis of PM, engineering, design, and UX-writing positions. Calls made where the room split; dissent logged in §9.*

---

## 1. Problem diagnosis

The stated problem ("pills don't scale") is the wrong diagnosis. The real problem is a broken activation funnel: five of ten visible pills (flights, betting odds, Bitcoin, ePerolehan, arguably KL property) promise briefs the stack can't deliver, violate COPY_GUIDE §2's exclusion list, and map to ICPs the Pre-GA audit explicitly dropped — a first-time user who taps one hits fallback copy on their first interaction. Second, 2–4-word labels can't do the three jobs they're assigned (teach capability, seed a good spec, reduce blank-page anxiety), so seeding is lossy and users still face the full 4–6-question interview. Third, scalability is a non-goal: the audit locked Cadence to 3 ICPs and ~9 GA-viable briefs, so any system designed to display dozens of brief types is building the scope sprawl the strategy bans. We have roughly seven wrong examples and one lossy seeding pipeline — not a catalog-browsing gap.

## 2. Recommended direction

Replace the 10-pill cloud with **three rich starter cards** (one per anchor ICP: commodities, regulation/tax, competitors), a co-equal free-text escape hatch, and a **"Browse all briefs"** affordance that opens an in-surface disclosure (inline expansion on desktop, bottom sheet on mobile — never a centered modal) showing ~7 GA-clean cards in three topic-named sections. Cards carry name, value line, and cadence hint; tapping one auto-submits a spec-dense `exampleQuery` while `seedHints` injected via prior-context let the agent confirm-and-personalize in ≤3 questions instead of re-interviewing. The agent remains the sole writer of `draft_spec`; templates stay a typed config file; the full vision catalog lives internally (plus fallback copy and missing-capabilities telemetry), never as aspirational cards — a card is a promise. Critically, the gallery ships only *after* seeding demonstrably shortens the interview; otherwise it's theater. The founder's modal gallery is rejected: it's a form wearing a costume, oversized furniture for seven items, and one PR away from the marketplace the audit banned.

## 3. The experience

**Default chat state (turn 0).** Two greeting bubbles, then a muted label "Or start from one of these" above **three starter cards** (cards, not pills — they're visibly the same component as gallery cards):

1. 🌴 **Palm oil market brief** — MPOB stocks, USDA data and futures moves, explained · *Daily, weekday mornings*
2. 🧾 **Tax and LHDN watch** — new rulings and circulars before your clients ask · *Weekly*
3. 🔭 **Competitor watch** — launches, pricing changes and hiring moves at your rivals · *Weekly*

Below, one line with two text buttons of equal visual weight: **"Browse all briefs"** and **"Describe it in your words"** (the second focuses the input — free text is the wedge, templates are training wheels).

**Gallery trigger.** "Browse all briefs" text button — the bare "+" is killed (it lies about hierarchy; the whole chat already creates briefs).

**Gallery layout.** Desktop: reversible inline disclosure that expands below the welcome block (collapse restores the three starters — never a destructive swap). Mobile: bottom sheet at ~85vh, single column, close button + overlay tap to dismiss — **no drag gestures in v1** (cuts the expensive half of the sheet while keeping the right container). Header: "Briefs I can run for you." Three labeled sections, ~7 cards, 2-up grid on desktop, generous density. No search, no tabs, no "coming soon" placeholders — an empty section is a removed section.

**Card anatomy (four mandatory slots, one optional).** Emoji (no duplicates, no trading-coded emojis) · name ≤4 words ending in "brief" or "watch" · value line ≤10 words, what lands in your hands, never the channel or tier · cadence hint in muted text, **rendered from `seedHints.cadence`, never a second hardcoded string**. Fifth slot — **in v1 per founder decision (§8.2)**: one example headline in quote styling, framed as illustrative ("e.g. — CPO futures tighten as MPOB stocks fall") — never presented as a real current fact.

**Post-selection.** Card tap auto-submits the `exampleQuery` as the user's message (cards are informed consent; autofill-and-edit is retired with the pills). Sheet/section closes. The sidebar fills from the draft poll after the first assistant turn — staggered CSS transition on whatever the poll returns; we do not promise a 1-second fill (that would require a second display pipeline). The agent's first reply follows the pinned contract: acknowledge the two slots the card set, ask exactly one forking question ("On it — palm oil, every weekday morning. One question: do you produce, trade or buy?"). **Card tap → saved brief in ≤3 agent questions is the definition of done**, asserted in evals.

**Free-text path.** Unchanged and primary — greeting invites it first. We instrument freehand-vs-template share of saved briefs; if free text craters, the gallery has colonized the conversation.

**Mobile.** Three cards stack single-column above the fold; gallery is the bottom sheet; respects reduced-motion.

**Mid-conversation.** No gallery re-entry in v1; contextual quick replies own that lane. `clone_from` becomes the real template mechanism post-multi-brief.

## 4. Naming & copy

Per the UX writer (authoritative):

- **Gallery header:** "Briefs I can run for you" (fallback: "Starting points"). Never Templates/Gallery/Library/Catalog/Examples.
- **Trigger:** "Browse all briefs". **Escape hatch:** "Describe it in your words".
- **Sections:** **Markets & commodities · Regulation & tax · Competitors & companies** — topic nouns, sentence case, no emoji, no counts, never persona labels.
- **Greeting:** "I research your industry and send you a brief, on your schedule." / "Tell me what to watch — in your own words." Card label: "Or start from one of these".
- **Banned:** use cases, template(s), digest/report/alert/feed, spec/config, Pro/tier, Reset, "Coming soon", channel mentions in cards, "Select a template". CTA if needed: "Start this brief".
- Named regulators (MPOB, LHDN) are recognition triggers, not jargon; source-dumps ("Reuters, Bernama, RSS") are jargon.

## 5. Template catalog v1

UI shows MVP-now only. Soon/Later live in `templates.ts` as `visible: false` internal catalog rows (satisfying the founder's "cover the vision end-to-end" mandate as a catalog requirement, not a UI requirement); Never items appear nowhere.

**Markets & commodities** (ICP-1, lead section)
- Palm oil market brief — daily · **MVP-now, flagship**
- Multi-commodity weekly brief (corn/wheat/sugar) · **MVP-now**
- F&B cost watch (chicken, cooking oil, sugar) · **MVP-now**
- Commodity price depth (Twelve Data) · *Later (Phase 6)*

**Regulation & tax** (ICP-2/3)
- Regulation watch (sector rule changes) · **MVP-now**
- Tax and LHDN watch · **MVP-now**
- Case-law and clinical research briefs · *Later — cut from UI despite designer's honesty-label proposal; a hedged card to an anchor ICP is still a broken promise. Agent fallback handles these requests.*
- Gov tender digest · *Later (Phase 6 validation; highest WTP — stays off UI until validated)*

**Competitors & companies** (ICP-2/4/5)
- Competitor watch · **MVP-now**
- Target-account watch (~20 logos) · **MVP-now**
- Beat-tracking brief (journalists) · *Soon (after RSS handling lift)*
- Pre-meeting account brief · *Later (on-demand cadence not in schema)*
- Hiring/exec-move signals · *Later (LinkedIn-gated)*

**Never (internal anti-catalog, no UI presence ever):** flights, hotels, sports betting, crypto, deep stock/ticker briefs, collectibles, anything paywalled.

Seven visible cards. The five current excluded-list templates are retired with `visible: false`, ids intact for `classifyTopic` telemetry.

## 6. Technical plan

**Data model** — extend `DigestTemplate` in `lib/digest-spec/templates.ts` in place: add `description`, `category`, `visible: boolean`, `seedHints?: Partial<DigestSpecDraft>`. Ids stay stable (telemetry-load-bearing). **Templates stay in the typed config file** — no DB, no admin UI; single editor, compile-time safety, deploys in minutes. Document the `visible` flag at the top of the file.

**Seeding** — the agent remains the only writer of `draft_spec`. Card tap (a) auto-submits the richer `exampleQuery` via the existing `append` path (multi-topic guard + telemetry fire normally) and (b) `seedHints` are injected into the system prompt via `prior-context.ts` ("User selected the palm oil template. Likely entities: MPOB, CPO futures. Default cadence: daily 07:30. Confirm, don't assume."). Never pre-populate `draft_spec`. `seedHints.rss_feeds` referencing pack IDs is the CAD-Phase6-RSS-Curation epic wearing a template hat — wire them together.

**Phases (resequenced per the designer's critique — seeding before gallery):**

- **Phase 1 (1–2 days, ship this week):** re-curate `templates.ts` — retire 5 violating templates, add ✅-audit replacements; 3 starter cards + escape hatch + new greeting copy; analytics: `template_selected {id, source}`, `template_id` stamped on thread through to `brief_saved`, plus freehand-vs-template share. Keep `data-testid` hooks; check `wave4-bundled-regressions.test.ts` before label changes.
- **Phase 2 (2–3 days):** spec-dense `exampleQuery`s + `seedHints` + prior-context injection; **golden-set vitest suite in the same PR** (each visible template's query asserted against expected extractor slots; `seedHints` validated against `digestSpecDraftSchema`; runs in CI); post-tap interview eval pinning the confirmation-string contract and ≤3-questions rule; verify `detectMultiTopic` and the 5/60s rate limit handle programmatic submissions (a "corn, wheat and sugar" template must not trip our own 3-topic guard).
- **Phase 3 (2–3 days, gated on Phase 2 evals passing):** "Browse all briefs" — desktop inline disclosure + mobile bottom sheet (no gesture code); gallery logic in a `lib/` helper with pure-function tests; `/chat?template=<id>` deep-link route as marketing plumbing for the three landing-page ICP stripes (it likely becomes `/briefs/new` post-multi-brief — in-product browsing stays in-surface).
- **Wave 2 (per §8.3, immediately after Phase 3):** ICP-aware question paths — **inferred from the stated topic, never asked as "what's your work"** — with its own eval harness; right-panel collapse to TOPIC + SCHEDULE at turn 0 as a separate small PR.
- **Wave 3 (per §8.3):** gallery polish — drag-to-dismiss sheet gestures, refined transitions, any density/visual iteration informed by Wave 1–2 telemetry.
- **Landing page (per §8.4, at launch):** wire `/chat?template=<id>` deep-links into the three ICP stripes; three links only, no public template index.

## 7. Metrics & risks

**Metrics:** (north star) signup → first `confirm_and_save`; median questions-to-save for card-initiated sessions, target ≤3; sidebar fields populated after turn 1, target ≥4 of 6; starter-card sessions hitting stack-gap fallback → ~0 (structural); freehand share of saved briefs (wedge-health guardrail); D7 brief survival + 👍 rate segmented by `template_id` — the only signal that should ever rank "top 3."

**Top 3 risks:**
1. **The interview doesn't shorten (highest).** Post-tap behavior depends on LLM compliance, which is documented-fuzzy here. *Mitigation:* the pinned confirmation-string contract in golden-set evals; gallery ships only after the ≤3-question eval passes; manual dogfood sign-off per visible template.
2. **Template drift vs extraction.** Spec-dense queries give `extract.ts` more surface to mis-parse; silent regression on every copy tweak. *Mitigation:* golden-set extraction tests in CI, same PR as the queries — a template edit that breaks extraction fails the build.
3. **Templates colonize the wedge.** Cards crowd out "tell me in your words," quietly converting chat-config into a picker. *Mitigation:* escape-hatch copy parity, greeting invites free text first, freehand-share instrumentation with an explicit review trigger if it drops sharply.

## 8. Founder decisions — LOCKED 2026-06-11

1. **Starter trio: locked now.** Ship the 🌴 palm oil / 🧾 tax & LHDN / 🔭 competitor trio without waiting for ICP-2/3 discovery interviews; swap on data. The D7-survival and 👍-rate metrics segmented by `template_id` (§7) are the swap trigger. The audit-mandated interviews remain on the backlog but do not gate this ship.
2. **Example headlines: in v1.** The illustrative "e.g. —" line graduates from optional to a standard card slot (see §3 card anatomy). Framed as illustrative, never as a live fact.
3. **Next wave: ICP-aware question paths first, then gallery polish — both, in sequence.** Question paths (inferred from stated topic, never asked as "what's your work", own eval harness) are the wave immediately after Phases 1–3; gallery polish is the wave after that.
4. **Deep-links: exposed on the landing page at launch.** Condition was "if there is benefit to user" — met: a visitor reading an ICP stripe lands in a pre-seeded chat instead of a blank canvas, removing the re-orientation step between marketing promise and product. Scope: the three ICP stripes only; no public template index page.

## 9. Dissent log

- **PM** proposed 6 starter chips + inline swap; overruled for 3 cards (designer: the unit must carry a value line and cadence hint, and swap-in-place is irreversible).
- **Designer** wanted ⚠️ clinical/case-law cards with honesty labels; cut per PM — a hedged card to an anchor ICP is still a promise.
- **Engineer** wanted inline-on-all-breakpoints v1 (no sheet); overruled for a simplified mobile bottom sheet — but the engineer's gesture-cost objection stands, so drag-to-dismiss is cut.
- **PM** wanted the `/chat?template=` route as the end-state replacing all in-product galleries; designer's in-surface-disclosure-primary position wins; route ships as deep-link infrastructure only.
- **Designer's** "panel fills within ~1s" choreography dropped per engineer — it requires a dual display pipeline; fill lands after the first assistant turn.
- **Engineer's** four-event analytics taxonomy trimmed to three signals per PM (pre-GA traffic can't power view funnels).
- **Founder's** modal gallery and bare "+" are rejected outright by all four roles; this proposal keeps the catalog and the grouped-cards instinct, not the container.