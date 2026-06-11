# Cadence brief-creation flow — PM brainstorm response

## 1. The real problem (it's not the one stated)

The founder's framing — "pills don't scale and carry too little detail" — diagnoses a symptom. The real problems, in order:

**It's an activation + strategy-alignment problem, not a scalability problem.** Scalability is explicitly a *non-goal*: the Pre-GA audit locked Cadence to 3 ICPs and 9 GA-ready briefs, and called scope sprawl the biggest GA risk. A system designed to gracefully display 50 brief types is solving a problem the strategy says you must not have. Worse — **5 of the 10 current pills (flights, Man United odds, Bitcoin, ePerolehan, arguably KL property) violate COPY_GUIDE §2's exclusion list and map to explicitly dropped ICPs.** Today's pills don't under-inform; they actively promise things the stack can't deliver. A user who taps "Tokyo flight prices" hits the stack-gap fallback on their *first interaction*. That's a broken activation funnel, not a discoverability gap.

**The JTBD at turn 0** is not "browse the catalog." It's: *"Convince me in 10 seconds that this thing understands my industry, and show me what a good brief looks like, so I'll spend 4–7 turns configuring one."* Pills are proof-of-competence and effort-scaffolding, not navigation. The success state is a saved, valuable first brief — `confirm_and_save` firing on a spec that survives week one.

**Spec quality** is real but secondary, and it's cheaply fixable: pills already autofill `exampleQuery` into the agent pipeline. Richer queries + an optional `seedHints` blob into the system prompt fixes seeding without any new UI.

## 2. End-to-end brief-type catalog

Backbone for the template system. Five user-facing categories (sentence case, "brief" vocabulary, never "use cases"). **Now** = current stack, GA narrative. **Soon** = Phase 6 / known epics. **Later** = vision-plausible, post-validation. **Never** = anti-roadmap, exclude from UI entirely.

**Commodities & inputs** *(ICP-1 — the wedge; lead category)*
- Palm oil daily brief (MPOB, USDA, Reuters, CPO futures) — **Now**, flagship
- Multi-commodity weekly synthesis (corn/wheat/sugar) — **Now**
- F&B input-cost watch (chicken, cooking oil, sugar) — **Now**
- FX-pair watch attached to any brief (`fx_pairs` add-on) — **Now**
- Commodity price-depth (futures curves, Twelve Data) — **Soon** (CAD-Phase6-Twelve-Data)

**Rules & regulation** *(ICP-2/3)*
- Sector regulatory change brief — **Now** (5/5 monetizability)
- Tax & accounting brief (LHDN, Big-4 commentary) — **Now** (5/5)
- Legal case-law update — **Soon** (free-source subset; Lexis is Never)
- Clinical research brief (PubMed open-access) — **Soon**
- Gov tender digest (perolehan.gov.my) — **Later** (Phase 6; highest per-user WTP — keep off the UI until validated, it's on the exclusion list)

**Competitors & companies** *(ICP-2/4)*
- Vertical SaaS competitor watch — **Now**
- Target-account watch (up to ~20 logos) — **Now**
- Pre-meeting account brief (on-demand) — **Now** (note: on-demand cadence is a product question — current schema is recurring-only)
- Hiring & exec-move signals — **Later** (LinkedIn-gated)

**My industry & beat** *(ICP-5 + horizontal long tail)*
- Beat-tracking brief for journalists/researchers — **Now** (needs RSS handling lift)
- Industry news + curated RSS pack (auto-attach MPOB/Bernama/WASDE by topic) — **Soon** (CAD-Phase6-RSS-Curation — this *is* the template system's data layer)
- SEA/non-English press coverage via GDELT — **Soon**
- OSS/tech release tracking — **Now-ish** (works, but no anchor ICP; keep one chip max)

**Markets & portfolios** *(ICP-7 — dropped from GA)*
- Stock watchlist news, single-ticker deep brief — **Later** (price-data gap)
- Crypto portfolio brief — **Later** (Phase 6 module; excluded from examples until then)

**Never in this catalog:** flight/hotel alerts (threshold mechanic — a different product, "Cadence Alerts"), sports betting, collectibles, anything paywalled. These should not appear even greyed-out — an example is a promise.

Honest count: **~11 Now, ~6 Soon, ~6 Later.** A modal gallery for 11 live items is furniture for a studio apartment.

## 3. The founder's proposal: top 3 pills + "+" → template gallery

**Strong:** correct instincts on reducing turn-0 load (10 pills is a wall), on richer descriptions seeding better specs, and on needing a canonical catalog (task 2 above is genuinely needed — as an internal artifact).

**Risky:**
- **A modal gallery is a form wearing a costume.** "No forms, ever" is the locked wedge. The moment users pick from a card grid, you've conceded the chat-config moat is decorative. It also violates the "one chip strip at a time" design rule in spirit.
- **"Top 3" has no selection signal.** There's no signup-time persona data; global top-3 means the wedge (palm oil) dominates and ICP-2/3 users see nothing for them. Persona-based requires ICP detection *before* turn 0 — which doesn't exist yet.
- **"ALL brief types as cards" institutionalizes scope sprawl** — the exact failure mode the audit flagged. With Later/Never items shown, every card is a promise the stack breaks; with only Now items, the gallery is 11 cards and the modal is overkill.
- **The "+" is a discoverability dead-end.** Low-intent users — the ones who need examples most — don't tap unlabeled affordances.
- **Marketplace gravity.** A template gallery is one PR away from a public template marketplace, explicitly premature before 100+ users.

Verdict: keep the catalog, kill the modal.

## 4. Alternatives

**A. Re-curated ICP-keyed starter chips + inline "more examples" swap.** Six chips: two per anchor ICP (e.g. Palm oil daily / F&B input costs; Competitor watch / Regulatory changes; Tax updates / Case-law watch). A 7th chip "More examples" swaps the strip in place (respects one-strip-at-a-time; no modal). Each chip's `exampleQuery` gets richer (entities, cadence, sources) so the slot extractor lands 3–4 fields on turn 1.

**B. Persona-first fork.** Agent's first question becomes "What's your work? I'll suggest a brief" — answer drives ICP detection (already mandated by the audit) and the *contextual* chip strip becomes ICP-specific examples. Chat stays primary; examples become a response to intent rather than a pre-emptive wall.

**C. Show the brief, not the label.** Tapping a starter chip renders a 3-line *sample brief excerpt* in-chat ("Here's what your Palm oil brief would look like —") before asking the first question. Converts the template from a promise into proof. Heavier (needs canned excerpts per template), but attacks the trust gap directly.

**D. Post-signup interest selection** personalizing pills — rejected: adds a form before the magic, duplicates ICP detection the agent must do anyway, and cold-start data would be wrong half the time.

## 5. Recommendation

**Ship A now, fold in B within the same wave, hold C as the activation lever if metrics stall.** No modal, no gallery. The catalog (task 2) lives in `templates.ts` as the internal source of truth — extended with `category`, `status` (now/soon/later), and `visible` flags so retired templates keep `classifyTopic` telemetry working with stable ids.

**Ship first (days, not weeks):**
1. Re-curate `DIGEST_TEMPLATES` to the 6+1 set above — pure config change; fixes the COPY_GUIDE violation that ships today. Keep ids stable, flag old ones `visible: false`.
2. Rewrite `exampleQuery`s to be spec-dense; add `seedHints` injected via `prior-context.ts` (agent stays the single spec writer — do not pre-populate `draft_spec`).
3. "More examples" inline swap revealing the Now-status long tail, grouped by category label.
4. Then: ICP-detection question path (B) per the audit mandate.

**Success metrics:**
- **Activation:** signup → first `confirm_and_save` rate (north star). Target: meaningful lift over current baseline; instrument it this week if it isn't.
- **Time-to-first-brief:** median turns and minutes to save. Target ≤5 turns for chip-initiated sessions.
- **Spec seeding quality:** fields populated after turn 1 for chip starts (telemetry already exists via `recordExtractionEvent`). Target ≥4 of 6 sidebar fields.
- **Promise integrity:** % of sessions hitting the stack-gap fallback from a *starter chip* — must go to ~0 (it's structurally guaranteed by curation).
- **Quality/retention proxy:** D7 brief survival (not paused/discarded) and 👍 rate on first three deliveries, segmented by entry template — this tells you which examples create briefs people keep, which is the only ranking signal "top 3" should ever come from.

The honest headline for the founder: you don't have a template-browsing problem, you have six wrong examples and one missing question. Fix those before building furniture.