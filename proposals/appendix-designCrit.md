# Designer critique — PM & engineer positions

## Where we're already aligned (don't relitigate)

Re-curate `templates.ts` this week, kill the modal, agent stays the only spec writer, `seedHints` via prior-context, stable ids, no aspirational cards. That's a three-way consensus — lock it.

## PM critique: right diagnosis, wrong unit

**The catalog doesn't overwhelm — the PM's UI translation of it does.** Keeping the catalog as an internal artifact in `templates.ts` is correct. But Alternative A (6 chips + "More examples" = 7) walks halfway back to the wall we're tearing down, and worse, it uses the wrong component. The PM's own diagnosis is that 2–4 word labels under-inform; a 7-chip strip of 2–4 word labels doesn't fix that, it just shortens the list. The unit must be a **card** — name, one-line value, cadence hint — because the cadence hint is what kills the price-tracker/newsfeed misread. Three cards carry more information than seven chips.

**Alternative B (persona-first "What's your work?") — accept the goal, reject the mechanic.** Asking occupation as turn 1 is a demographic form field in chat clothing, and it delays value by a full turn for the majority who arrive with a topic in mind. The audit mandates ICP *detection*, not ICP *interrogation* — infer it from the topic ("palm oil" ⇒ ICP-1) and let the *second* question fork. B as written trades the blank-page problem for an intake-form problem.

**Alternative C is underpriced.** The PM holds "show the brief" as a stalled-metrics lever; the lite version — one example headline per card in quote styling — costs nine sentences of copy and is the single strongest "researched brief, not newsfeed" signal. Fold it into v1.

**The PM's "More examples" swap has no way back** — swapping the strip in place discards the three starters. Expansion must be reversible disclosure, not replacement.

## Engineer critique: phasing ships the promise before the payoff

**Phase ordering is backwards, and it's an experience bug.** Phase 1 ships a grouped card grid; Phase 2 ships `seedHints` + interview shortening. So for a week-plus, a user reads a rich card promising "MPOB, futures, daily" — then taps it and gets the same 6-question interview as typing freehand. The gallery is theater exactly when first impressions form. The panel animating from "not set" → filled within a second of the tap is the *entire* payoff of cards over pills; without it, richer cards just raise expectations the flow then deflates. **Reorder: Phase 1 = curation + 3 cards + escape hatch; Phase 2 = seedHints; the gallery ships only after seeding works.** The engineer's golden-set extraction tests are the right QA gate for this — endorse fully, and make "card tap → ≤3 remaining questions" an explicit assertion of done.

**"Inline expands fine on mobile by default" is wrong.** Ten single-column cards inline below the welcome bubble buries the composer below the fold — the exact failure mode of today's 10-pill cloud, with bigger rectangles. The half-day bottom-sheet cost the engineer is dodging is not optional; it's the mobile design. (No focus-trap-modal needed — sheet, drag-dismiss, reduced-motion respected.)

**The `/chat?template=<id>` route alternative: good marketing plumbing, wrong primary path.** Navigating away at turn 0 breaks the conversational frame at its most fragile moment, and auto-submitting on page landing reads as the machine speaking for the user. Build the route as deep-link infrastructure for the three landing-page ICP stripes — and concede it likely becomes `/briefs/new` post-multi-brief — but in-product browsing stays in-surface disclosure.

**Risk all three of us under-weighted:** both the PM's chip strip and the engineer's grid crowd out free text. The wedge is "tell me in your words"; templates are training wheels. The escape hatch gets equal visual legitimacy, and we instrument what % of saved briefs start from free text — if that number craters, the gallery has colonized the conversation.

## What must change in the final proposal

- **Cards, not chips, as the only template unit** — 3 starters (one per anchor ICP) with name + value line + cadence hint + one example headline; PM's 6-chip strip is dropped.
- **Resequence the engineer's phases:** seedHints + interview-shortening ship *before* the gallery; golden-set tests gate it with "card tap → ≤3 questions remaining."
- **Mobile gets a bottom sheet, non-negotiable;** desktop gets reversible inline disclosure ("Browse all briefs"), never a centered modal, never replacement-swap.
- **ICP detection is inferred from topic, never asked as "what's your work"** — B's fork logic moves to question 2, derived.
- **Free-text escape hatch styled co-equal with cards, with instrumentation** (freehand-vs-template share of saved briefs) alongside the engineer's `template_id` stamping.