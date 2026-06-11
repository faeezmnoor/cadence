# 04 — Improvement Plan

**Date:** 2026-06-11 · Sequences the findings of docs 01–03 into shippable work. Effort: **XS** (<½ day) · **S** (≈1 day) · **M** (2–3 days) · **L** (>3 days). One-person ops, so the plan batches by *surface* to minimise context-switching.

**Sequencing principle:** brand foundation first (it makes everything after it look intentional), then the wedge (brief-creation), then IA + terminology (which must land *before* multi-brief), then polish. Terminology decision is the one item with an external deadline: **it must precede multi-brief GA.**

---

## Implementation status (updated 2026-06-12)

| Wave | Status | PRs |
|------|--------|-----|
| **A** — brand & tokens | ✅ **Shipped to prod** | #28 (semantic tokens + brand active-nav), #29 (AA-safe brand + storefront CTAs), #31 (app primary CTAs → brand), #34 (AA contrast fix from SWE audit) |
| **B** — brief-creation wedge | 🟡 **Mostly shipped** | #32 (plain-language sidebar, styled brief render, Cadence chat presence, inline-confirm reset, turn-0 placeholder). **Deferred: B2** explicit deterministic save button (touches the agent `confirm_and_save` save path — needs env-backed verification). |
| **Live /design-review pass** | ✅ **Shipped to prod** | #38 (7 fixes: collapsible spec rail, pricing dedupe, marketing-nav wayfinding, footer/app-nav a11y, token stragglers), #39 (deferred trio: type scale 16px reading surfaces, one authed page shell, focus-ring sweep + **61-site dark-mode `ring-offset-background` fix** — any new focus ring MUST pair `ring-offset-2` with `ring-offset-background`) |
| **A2/A3** — shadcn `Button`/`Badge`/`Card` extraction; full type-scale tokenization | ⬜ Not started (follow-up; brand-primary + body sizes now consistent but applied per-call-site) |
| **C** — IA + terminology | 🟡 Partial | Glossary + "digest" guard in `COPY_GUIDE §4a`. **C1 DECIDED 2026-06-11: rename rejected — "brief" stays for both layers; binding counting rule in `COPY_GUIDE §4b`** (list counts briefs, billing counts credits). IA dedup (C2), briefs-as-home (C3), activation checklist (C5) not started. |
| **D** — detail/history + polish | ⬜ Not started (D1 edition-history page is a net-new feature) |

Notes for whoever continues: white-on-`--brand` is AA at the shipped 45% L. Authed surfaces (chat/briefs/settings) were verified by typecheck + the full vitest suite (no local Supabase env to render them) — confirm visually on the Vercel Preview. A concurrent `scripts/pro-bakeoff` parallel session shares the working tree; isolate with stage-stash-gate before committing.

---

## Wave A — Brand & design-system foundation (≈1 sprint)
*Makes the product look like the premium researcher it claims to be, and stops the consistency drift at the source.*

| # | Item | From | Effort |
|---|------|------|--------|
| A1 | **Adopt a real colour system.** Commit `--brand` (terracotta) to semantic roles inside the app; add `--success/--warning/--danger/--info` + `--data-positive/--data-negative` tokens; warm the neutral ramp. Replace raw `green/emerald/amber/red` usages. | 01 A1,A2,A3,A4 | M |
| A2 | **Adopt shadcn primitives** (`Button`, `Badge`, `Card`) — already configured in `components.json`, currently unused. Migrate the hand-rolled buttons; kill the `h-8/9/11 · px-3/5/6` drift. | 01 D1 | M |
| A3 | **Type scale + decision on serif-in-app.** Document a 6–7 step scale as tokens; cap arbitrary `text-[…]`; carry a restrained serif into the brief render + page H1s (or consciously decide sans-only). | 01 B1,B2,B3 | S–M |
| A4 | **Radius + spacing scale**, lucide for app icons. | 01 D2 | S |

**Proposed concrete tokens (starting point — tune live):**
```
/* Brand — anchor on the sample-brief palette so app & mockup agree */
--brand:            14 72% 55%;   /* terracotta — primary action, active nav, focus accent */
--brand-foreground:  0  0% 100%;
--ink:             210 45%  9%;   /* #0e1621-family deep navy — dark surfaces, brief frame */

/* Semantic */
--success:         152 55% 42%;   /* price ▲, active, delivered */
--warning:          35 92% 52%;
--danger:            0 72% 52%;
--info:            210 80% 55%;
--data-positive:   152 55% 42%;
--data-negative:     0 72% 60%;

/* Warm the neutral ramp: shift hue ~215→34, drop saturation toward 8–14% */
/* e.g. --muted-foreground: 34 10% 46%  (was 215 16% 47%) */

/* Type scale (rem) */
display 2.5 · h1 2.0 · h2 1.5 · h3 1.125 · body 0.9375 · small 0.8125 · caption 0.6875
/* Radius */  sm .375 · md .5 · lg .75 · pill 9999
```
Recommend a quick `/design-consultation` or `/theme-factory` pass to finalise the exact ramp; this table is the brief for it.

---

## Wave B — The wedge: brief-creation flow (≈1 sprint) — *highest product leverage*
*Turns the competent chat-form into the "I hired a researcher" moment. Depends on Wave A tokens/primitives.*

| # | Item | From | Effort |
|---|------|------|--------|
| B1 | **Rewrite the spec sidebar** as plain-language "What I've got so far" notes — kill the mono `<dl>`, "DRAFT", "— not set". Surface readiness outside the mobile `<details>`. | 02 §3 | S–M |
| B2 | **Explicit "Looks good — save this brief" commit button** on `isReady`, triggering a deterministic save independent of LLM tool-call compliance. | 02 §4 | S |
| B3 | **Render the brief as a styled artifact** (markdown + citation chips + coloured deltas, optionally in the phone frame). Reuse `markdown.tsx`; share styling with `sample-brief.tsx`. | 02 §6, 01 B4,H1 | M |
| B4 | **Give Cadence a presence in chat** (avatar + name on its turns; the terracotta mark from the mockup). | 02 §8, 01 H2 | S |
| B5 | **State/copy fixes:** turn-0 placeholder; replace `window.confirm` reset with inline-confirm; "Configure" → "Set up"; card-tap provenance chip. | 02 §5,§7, 01 E2,G2 | S |

B1–B4 are the core of the wedge upgrade. B5 is cheap cleanup that rides along.

---

## Wave C — IA cleanup + terminology (must precede multi-brief GA)
*Removes the "two doors to every room" confusion and resolves the "brief" overload before multi-brief makes it a defect.*

| # | Item | From | Effort | Gate |
|---|------|------|--------|------|
| C1 | **Terminology decision + roll-out.** Founder + UX-writer ratify "watch" (or fallback) for the standing config; amend `COPY_GUIDE §4`; rename `/briefs` surface, nav tab, "New brief", "X of N". Keep "1 credit = 1 brief" untouched. | 03 §3 | S–M | **before multi-brief GA** |
| C2 | **Resolve IA duplication.** One model: nav owns frequent destinations; one "Account/Settings" entry owns Learning + account + danger; guarantee `/settings` is reachable. | 01 C1 | S | — |
| C3 | **`/briefs` (→ "watches") as post-auth home** for users with ≥1; chat is entered as an action. Fixes the "+ New brief disabled" first impression. | 01 C2 | S | — |
| C4 | **Glossary + doc fixes:** code-vs-UI glossary in `COPY_GUIDE`/`CLAUDE.md`; fix "digest" in README/CLAUDE prose (leave code identifiers). | 03 §4 | XS | — |
| C5 | **Activation checklist** (create brief → connect Telegram → first brief) on the home surface; make "Delivery" status-bearing until linked. | 01 E1,C4 | S–M | — |

> **C1 is the only date-bound item.** Everything else can slip; renaming a noun users have already learned cannot. If multi-brief is near, do C1 first within this wave.

---

## Wave D — Depth & polish
*The recurring-artifact story and the long-tail consistency.*

| # | Item | From | Effort |
|---|------|------|--------|
| D1 | **Brief (→ watch) detail page with edition history** — past deliveries, each rendered (Wave B3 styling). Makes the day-1-vs-day-10 wedge *visible in-product*, not just in marketing. | 01 C3 | M |
| D2 | **Live `/design-review` pass** to confirm pixel/contrast/motion findings marked _(confirm live)_ in 01 (esp. F1 contrast, dark-mode). | 01 F1 | S |
| D3 | **Empty-state + loading polish** (voice + skeleton convention); mobile nav resolution (likely free after C2/C3 reduce tab count). | 01 E3,E4 | S |
| D4 | **Mockup refresh** — align the marketing phone mockup with the new in-app brief styling; soften the "bot" sublabel. | 01 G3,H1 | S |

---

## Sequenced summary

```
Wave A  Brand & design-system foundation      ── look intentional
   ↓
Wave B  Brief-creation flow (the wedge)        ── the money moment
   ↓
Wave C  IA + terminology   [C1 before multi-brief GA]  ── stop the confusion
   ↓
Wave D  Detail/history + live polish           ── depth & proof
```

**If only one wave ships:** Wave B (the wedge) has the highest product leverage — but it *looks* far better on top of Wave A's tokens. If forced to pick a single highest-ROI item across everything: **02 §6 / 01 B4 — render the brief as a styled artifact** (the product currently shows its own deliverable as a plain text dump).

**Effort roll-up:** Wave A ≈ M+M+M ≈ 1 sprint · Wave B ≈ 1 sprint · Wave C ≈ 3–4 days · Wave D ≈ 3–4 days. ~3–4 focused weeks of one-person design-eng for the whole programme, shippable wave-by-wave.

---

## What this plan deliberately does NOT touch
- The platform P0s (cost attribution, spec hydration, scheduler resilience, learning-loop wiring) — owned by `PLATFORM-AUDIT-2026-06-11.md`. Several Wave B/C surfaces *assume* those fixes land (e.g. a visible learning surface needs the votes→learning_log wiring to be true).
- The starter-cards / "Browse all briefs" gallery — already locked in `proposals/brief-creation-flow-proposal.md`; we ratified and extended it, not re-opened it.
- Code/DB renames for "digest" — explicitly out (03 §4).
- The COPY_GUIDE's voice/vocabulary canon — treated as source of truth; we only proposed the one amendment it hasn't resolved (the "watch"/"brief" split, 03 §3).

---

## Next step after this audit
Per the brief: **update the *Startup - Cadence* Notion Knowledge Wiki** with this audit, the brief-creation redesign, the terminology decision, and the improvement plan (handled in a separate session). Recommended Notion structure: a "Design & UX" section mirroring docs 01–04, with the **terminology decision (C1)** promoted to a decision-log entry since it changes canon and has a deadline.
