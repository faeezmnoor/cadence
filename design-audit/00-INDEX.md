# Cadence — Product UX/UI Design Audit & Improvement Plan

**Date:** 2026-06-11
**Authors:** Senior product designer · senior UI/UX designer · senior UX writer (combined lens)
**Status:** Proposal — nothing below is implemented. For founder review.
**Scope:** The whole Cadence product (marketing + authed app + Telegram-facing artifacts), with a deep focus on the **brief-creation flow** and a standalone **terminology evaluation**.

---

## What this is

A senior-level design audit of Cadence as it stands on `main` (2026-06-11), read from source. It covers visual design, brand & colour, typography, information architecture, component consistency, modern SaaS behaviours, accessibility, UX writing, and trust/credibility — then converts the findings into a prioritised, waved improvement plan.

The audit is deliberately additive to the work already on disk (see "Relationship to prior work"). Where prior decisions are sound, it ratifies them and moves on; it spends its words on what is still open.

## The documents

| # | File | What it covers |
|---|------|----------------|
| 00 | `00-INDEX.md` | This file — overview, method, scope, headline findings |
| 01 | `01-product-ux-audit.md` | Full audit across every surface and every lens. The evidence base. |
| 02 | `02-brief-creation-flow.md` | Deep dive on the focus area: the chat-based brief-creation flow, with a concrete redesign. |
| 03 | `03-terminology-evaluation.md` | Is "brief" the right word? The brief/digest question, the three-way overload, and a proposed glossary. |
| 04 | `04-improvement-plan.md` | Prioritised, effort-tagged, waved roadmap that sequences 01–03 into shippable work. |

Read **01** for the reasoning, **04** for the plan. **02** and **03** are the two areas the brief asked us to go deepest on.

## Method & honest limitations

- **Source-of-truth read.** Every finding cites a real file/line in `apps/web`. This matches the team's established mode (the codebase already references "UX audit v2", "design-audit v2", "multi-brief UX v1").
- **Not a live pixel review.** This audit was done from code, not from a running, authenticated instance with screenshots. A handful of findings (exact contrast ratios, real-device spacing, motion feel) should be confirmed with a live `/design-review` pass before the polish wave. Where a finding depends on seeing rendered pixels, it is marked _(confirm live)_.
- **Copy is largely already governed.** `apps/web/COPY_GUIDE.md` is a mature, opinionated UX-writing canon. This audit treats it as the source of truth for voice and vocabulary and only flags where the *product* has drifted from it, or where the guide itself has an unresolved gap (the terminology overload — see 03).

## Relationship to prior work

This audit builds on, and does not duplicate, the existing material:

- `proposals/brief-creation-flow-proposal.md` + `proposals/appendix-uxWriter.md` — the starter-cards / "Browse all briefs" gallery redesign (locked 2026-06-11). **We ratify this direction.** Doc 02 extends it to the *rest* of the flow it didn't cover: the spec sidebar, the confirm/commit moment, chat identity, and the in-app brief render.
- `PLATFORM-AUDIT-2026-06-11.md` — the 4-agent platform/economics audit (P0 correctness bugs). **Out of scope here** except where a UX surface depends on it (e.g. the self-learning promise; the "X of N briefs" counter). We do not re-litigate those P0s.
- `apps/web/COPY_GUIDE.md` — treated as canon (see above).

## Headline findings (the five that matter most)

1. **The product has no brand identity inside the app.** The authed surfaces (chat, briefs, settings) are 100% stock shadcn slate. The one warm brand colour (`--brand`, a terracotta) appears only on marketing CTAs and the phone mockup — never in the product a paying user actually lives in. A product positioned as "your own researcher" currently *looks like* a generic dashboard starter. → 01 §A, 04 Wave A.

2. **The most important artifact gets the least design care.** The marketing mockup of a brief is gorgeous (citations, price deltas, sections). The real **in-app brief preview is a plain `whitespace-pre-wrap` text block** (`brief-actions.tsx:234`). The thing the user is paying for is the worst-rendered surface in the app. → 01 §B4, 02 §6.

3. **The brief-creation flow's "notes" panel is an engineer's JSON inspector wearing a friendly title.** The spec sidebar renders draft fields as an UPPERCASE `<dl>` with **monospace values** and "— not set" (`spec-sidebar.tsx`). For the anchor persona (an ESL SME owner), this is intimidating and off-voice — the single biggest brand-voice violation in the core flow. → 02 §3.

4. **"Brief" is overloaded three ways, and multi-brief will expose it.** The brief/digest debate is settled (brief is right — keep it). But "brief" currently names (a) the standing, pausable configuration, (b) each delivered morning artifact, and (c) loosely, the act of setting it up. Today the 1-brief cap hides the collision. The moment multi-brief ships, "5 briefs" (configs) vs "73 briefs" (credits/deliveries) actively confuses. → 03.

5. **The information architecture has two doors to every room.** Top nav exposes Chat · Briefs · Delivery · Learning · Billing; `/settings` *also* hubs Learning · Billing · Delete — and Settings itself has no nav entry. Chat vs Briefs has no clear "home". → 01 §C.

None of these are MVP blockers. Together they are the gap between "a working MVP" and "a product that feels like the premium researcher it claims to be."
