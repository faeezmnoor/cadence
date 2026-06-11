# PM critique — engineer & designer positions

## Where we're aligned (lock it)

All three of us independently arrived at: re-curate `templates.ts` this week as a standalone fix, agent stays the only `draft_spec` writer, `seedHints` via prior-context, stable ids + `visible:false`, emoji not an icon system, no modal at turn 0. That's the proposal core — done arguing.

## Engineer

**Best contribution nobody else made:** the golden-set vitest suite (template promises must survive extraction, in CI) and the route-not-component alternative (`/chat?template=<id>`). The route idea isn't just cheaper — it's strategically better: shareable URLs feed the three landing-page ICP stripes and slots into `/briefs/new` when Multi-Brief lands. I'd promote it from "alternative worth a look" to the Phase 3 default and **delete the modal from the roadmap entirely**. The engineer concedes "right destination, wrong sequencing" on the founder's gallery; I disagree on destination too — a modal gallery for ~9 items is never the end state, and keeping it as Phase 3 invites the marketplace gravity the audit banned.

**Over-engineered for stage:** the four-event analytics taxonomy. Pre-GA traffic won't power `template_card_viewed` funnels. Keep exactly two things — `template_selected {id, source}` and `template_id` stamped through to `brief_saved` — because that join feeds the only ranking signal that should ever decide "top 3" (D7 survival by entry template). Cut the rest.

**Gap:** the plan is entirely presentational + seeding. The audit's mandated activation lever is **ICP-aware question paths** (don't ask a commodity SME about competitor blogs), and nothing in Phases 1–3 touches the agent's interview logic. seedHints shortens the interview for template-takers; the free-text majority gets the same generic interrogation. That's solving spec quality for the easy cohort only.

## Designer

**Best contributions:** killing the modal with the utterance-vs-destination argument (the sharpest framing in the session), the cadence-hint card slot that pre-answers two interview questions, escape-hatch parity ("free text is the wedge, templates are training wheels"), and the right-panel collapse — six "not set" fields genuinely is a form ghost. The flow respects the vision mandate correctly: vision coverage belongs in the internal catalog + fallback copy + missing-capabilities telemetry, not aspirational cards. I'll defend that reading to the founder — "cover the vision end-to-end" is a catalog requirement, not a UI requirement.

**Disagreements:**
1. **The ⚠️ cards must go.** Designer includes clinical and case-law with "journal abstracts only" honesty labels. A hedged card is still a promise — ICP-3 solo consultants are an anchor ICP and a disappointing first brief there is worse than no card. Ship the ~7 clean ✅ cards; let the agent's fallback handle case-law requests until the paywall story improves.
2. **The example-headline element is a content liability, not just polish.** "*CPO futures up 2.1%*" is a static fabricated fact that will be wrong the day it ships. Either pull headlines from real recent runs or style them as obviously illustrative — otherwise the element that's supposed to signal "researched, not newsfeed" signals the opposite to the one user who checks.
3. **Three fixed ICP cards means most users see one relevant card and two misses.** The escape hatch covers it, but this is the same gap as the engineer's: turn-0 personalization without ICP detection is a guess. Fine for v1 — but say so explicitly rather than presenting the 3-card set as solved.

## Risk both missed

**Nobody owns the post-tap interview contract.** Designer's own line — "if picking a card restarts the full interview, the gallery is theater" — is the single biggest failure mode, and it depends on fuzzy LLM compliance (we already needed a quick-replies fallback). The engineer's golden set tests the deterministic extractor, not the agent's question behavior. Without an eval asserting ≤3 questions after a card tap, we ship a prettier version of the same 6-question slog and the activation metric doesn't move.

## What must change in the final proposal

- **Delete the modal from all phases**; engineer's `/chat?template=<id>` route replaces Phase 3, designed to become `/briefs/new`.
- **Visible cards = ✅ audit rows only (~7)**; cut clinical/case-law ⚠️ cards; vision coverage lives in the internal catalog + fallback copy.
- **Add a post-tap interview eval**: card selection → saved brief in ≤3 agent questions, tested, or seedHints isn't done.
- **Trim analytics to `template_selected` + `template_id`-stamped `brief_saved`**; D7 survival by entry template is the only future "top 3" signal.
- **Name ICP-aware question paths as the explicit next wave** — turn-0 curation alone doesn't satisfy the audit's activation mandate; don't let the gallery work absorb that budget.