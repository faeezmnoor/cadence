# 01 — Cadence Product UX/UI Audit

**Date:** 2026-06-11 · Read from `apps/web` on `main`. Findings cite `file:line`. Severity: **P0** (breaks trust/usability), **P1** (material quality gap), **P2** (polish).

Lenses: **A.** Visual design, brand & colour · **B.** Typography · **C.** Information architecture · **D.** Component consistency & design system · **E.** Modern SaaS behaviours · **F.** Accessibility · **G.** UX writing · **H.** Trust & credibility.

The brief-creation flow is audited in depth separately (doc 02); terminology in doc 03. This doc covers the whole product and the foundations.

---

## A. Visual design, brand & colour

### A1 — The product has no brand identity inside the app *(P1)*
**Evidence:** `globals.css:6-49` is the stock shadcn "slate" palette (`--foreground: 222.2 84% 4.9%`, `--muted-foreground: 215.4 16.3% 46.9%`, etc.). One brand token exists — `--brand: 14 65% 55%` (a warm terracotta/amber) — but its only call sites are marketing: the landing CTA *hover* (`page.tsx:42`), `how-it-works` step bullets (`how-it-works/page.tsx`), and the pricing "Best value" border/badge (`pricing/page.tsx:73,78`). **Inside the authed product — chat, briefs, settings — `--brand` is used zero times.** Primary buttons are `bg-foreground` (near-black slate). Active nav is `bg-muted` (grey).

**Why it matters (colour psychology / positioning):** Cadence sells "your own market researcher" — a warm, human, editorial, trustworthy frame, explicitly *not* a cold Bloomberg terminal (`COPY_GUIDE.md §1`). The terracotta hue (≈14°) is exactly right for that: warm, paper-and-ink, editorial, differentiated from the wall of fintech blues. But the product never spends it. The result is a monochrome slate dashboard indistinguishable from a shadcn starter. The brand's warmest, most characterful colour — the terracotta avatar gradient `#ff9d6b→#dd5f33` and orange section heads `#ee8b66` — lives **only in the marketing phone mockup** (`sample-brief.tsx:58,126,139`), i.e. in a *picture of the product* rather than the product.

**Recommendation:** Commit the warm accent to a real semantic role inside the app: primary actions, active nav state, focus accents, "ready" states, and positive data. Anchor the brand on the sample-brief's own palette (deep navy `#0e1621` + terracotta) so the app and the mockup finally agree. Concrete tokens proposed in 04 Wave A / the design-system appendix.

### A2 — Semantic colour is ad-hoc raw Tailwind, not tokens *(P1)*
**Evidence:** Status and feedback colours are hardcoded palette values scattered across components: `emerald-500` (landing pulse), `green-600 / green-500/40` (sidebar ready badge, `spec-sidebar.tsx:73`), `amber-600 / amber-500/40` (chat error, cooldown), `red-600 / red-500` (errors), `text-[#f37f7f]/[#57c98f]` (price deltas in the mockup). Meanwhile `briefs-client.tsx:18` *claims* "Design tokens only — no raw neutral or raw hex" — a rule the rest of the app doesn't keep.

**Recommendation:** Introduce `--success`, `--warning`, `--danger`, `--info`, and a `--data-positive` / `--data-negative` pair (price up/down) as CSS variables with light/dark values; replace raw palette usages. This is what makes status reads consistent and themeable, and it kills the green/emerald drift (both are used for "good").

### A3 — Neutral ramp is blue-slate, fighting the warm brand *(P2)*
**Evidence:** The neutral scale is shadcn's blue-tinted slate (hue ≈215–222). Pairing cool-grey neutrals with a warm terracotta accent reads slightly incoherent — the greys look cold next to the brand.

**Recommendation:** Warm the neutral ramp a few degrees (hue ≈ 30–40, very low saturation) so card/border/muted greys sit in the same family as the accent. Subtle, but it's the difference between "themed" and "default".

### A4 — Active/positive states carry no colour *(P2)*
**Evidence:** `/briefs` status badges use `bg-muted` for **both** Active and Paused, differing only by text colour (`foreground` vs `muted-foreground`) — `briefs-client.tsx:367-380`. The "Active" badge is effectively invisible (muted bg, 10px uppercase). "Never color-only" (an a11y win, see F) is satisfied, but the *positive* state earns no positive colour.

**Recommendation:** Active → success-tinted badge; Paused → neutral. Same for the sidebar "Ready to confirm".

---

## B. Typography

### B1 — No type scale; many one-off sizes *(P1)*
**Evidence:** Font sizes are ad-hoc Tailwind utilities with frequent arbitrary values: `text-[11px]`, `text-[10px]`, `text-[11.5px]`, `text-[13px]`, `text-[12.5px]`, `text-[13.5px]` co-exist with the standard `text-xs/sm/base/lg`. No documented scale, no tokens. The micro-label sizes especially (10/11/11.5px) drift per component.

**Recommendation:** Define and document a 6–7 step scale (e.g. `display / h1 / h2 / h3 / body / small / caption`) as Tailwind theme tokens; cap arbitrary `text-[…]` to the phone-mockup only. Rhythm consistency is most of what separates "designed" from "assembled".

### B2 — The editorial serif dies at the login wall *(P1)*
**Evidence:** A serif system stack (Iowan/Charter/Georgia) was added "to push the senior researcher / publication signal" — but the comment scopes it to marketing H1s only (`tailwind.config.ts:57-73`); the app uses sans for all headings (`chat-client.tsx:450`, `briefs-client.tsx:126`, `settings/page.tsx:51`). So the single strongest "publication" cue evaporates the moment a user signs in — exactly when they should feel they hired a researcher.

**Recommendation:** Make a *decision*, don't leave it accidental. Either (a) carry a restrained serif into a few product headlines (the chat header, the `/briefs` H1, and — highest value — the brief content itself), or (b) consciously commit the app to utilitarian sans and lean the editorial signal entirely on the brief artifact. Recommended: (a), narrowly — serif on the brief render and page H1s only.

### B3 — UPPERCASE micro-labels are the only "premium" device, and overused *(P2)*
**Evidence:** `uppercase tracking-wide/[0.2em]` labels appear on every dt, "DRAFT", "Captured so far", every Stat label, every section header (`spec-sidebar.tsx:33,65`, `briefs-client.tsx:272,477`). Combined with monochrome slate, the cumulative effect is "generic analytics dashboard," not "editorial researcher."

**Recommendation:** Reserve uppercase for true eyebrow labels; use weight/colour/size for the rest of the hierarchy. Pairs with A1 and B2.

### B4 — The brief — the product — is rendered as a plain text dump in-app *(P1, high-leverage)*
**Evidence:** The in-app brief preview is `whitespace-pre-wrap break-words … text-[13px]` raw markdown text (`brief-actions.tsx:231-238`). There is a real markdown renderer in the codebase (`components/chat/markdown.tsx`) but the *preview of the actual brief* doesn't use it. Contrast with the marketing mockup, which lovingly styles TL;DR, "Prices", "What moved", "Why this matters", citation chips `[1][2]`, and red/green deltas (`sample-brief.tsx:110-161`).

**Recommendation:** Render the in-app brief (preview, and any future history view) with the same care as the mockup: typographic sections, citation styling, coloured deltas. This is the highest-leverage single visual upgrade — it's the thing being sold. See 02 §6.

---

## C. Information architecture

### C1 — Two doors to every room *(P1)*
**Evidence:** Top nav (`app-nav.tsx:31-44`) = Chat · Briefs · Delivery · **Learning** · **Billing**. The `/settings` page (`settings/page.tsx:21-44`) *also* hubs **Learning** · **Billing** · Delete account. So Learning and Billing each have two entry points and two mental homes, while `/settings` itself is **not in the nav at all** (`AppNav active={null}`, and the wordmark routes to `/chat`). Account deletion lives only under a Settings page you can't reach from the nav.

**Recommendation:** Pick one model. Recommended: nav owns the *frequent* destinations (Briefs, Chat-as-action, Delivery, Billing); a single "Account/Settings" entry (avatar menu or nav item) owns Learning, account, danger zone. Remove the duplication; guarantee `/settings` is reachable. _(confirm live: how is `/settings` currently reached?)_

### C2 — Chat vs Briefs: no clear "home" *(P1)*
**Evidence:** The wordmark and post-auth default route to `/chat` (`app-nav.tsx:65`), but `/chat` is the *authoring* surface (create/edit a brief), while `/briefs` is the *management* surface (your stuff). A returning, activated user's natural home is their briefs, not a blank chat.

**Recommendation:** Make `/briefs` the post-auth home for users with ≥1 brief; `/chat` becomes a mode entered via "New brief" / "Edit". New users (0 briefs) land in chat. This also fixes the awkward "+ New brief disabled" first impression (C4).

### C3 — No brief history / past-editions view *(P1)*
**Evidence:** `/briefs` cards show only the *latest* run, linking out to the public permalink `/b/<shortId>` "open" (`briefs-client.tsx:293-303`). There is no in-app place to see a brief's past deliveries. For a product whose entire value is a *recurring* artifact that *improves over time*, there is nowhere in-app to watch it improve — the day-1-vs-day-10 story (the wedge!) has no product surface, only a marketing claim.

**Recommendation:** Add a brief detail page with an edition history (past deliveries, each opening the rendered brief). This is also where the "what changed since you corrected it" wedge becomes visible and re-engaging. Medium effort; high narrative payoff.

### C4 — "Delivery" euphemism costs clarity at activation *(P2)*
**Evidence:** The nav tab for "Connect Telegram" is labelled **Delivery** to stay channel-agnostic (`app-nav.tsx:40`, comment). A brand-new user who hasn't linked anything sees an abstract "Delivery" tab with no signal that it's the critical unlinked step.

**Recommendation:** Keep the channel-agnostic label, but make it *status-bearing* until linked (e.g. a dot/"Action needed" affordance), or fold first-link into an onboarding checklist (E1) so "Delivery" isn't carrying activation on its own.

### C5 — `/spec` is a retired-but-reachable power surface *(P2)*
**Evidence:** Nav comments note "Spec is dead as a nav noun"; `/spec` survives as a JSON power-editor reachable from brief detail (`app-nav.tsx:33-43`). Fine — but verify it's not orphaned and that its vocabulary ("spec") never leaks to non-power users (COPY_GUIDE bans "spec").

---

## D. Component consistency & design system

### D1 — shadcn primitives are installed but unused; buttons are hand-rolled and drifting *(P1)*
**Evidence:** `components.json` configures shadcn/ui, but there is no `components/ui/button.tsx` in use — every button re-declares its Tailwind string. Heights drift across `h-8` / `h-9` / `h-11`; horizontal padding across `px-2` / `px-3` / `px-5` / `px-6`; the same "primary" recipe (`bg-foreground … text-background … focus-visible:ring-2 …`) is copy-pasted in `page.tsx`, `chat-client.tsx`, `brief-actions.tsx`, `briefs-client.tsx`, `pricing/page.tsx`. Any change to button style is now an N-file find-replace.

**Recommendation:** Adopt the shadcn `Button` (variants: primary/secondary/ghost/destructive; sizes: sm/md/lg), `Badge`, and `Card` primitives that the project is already set up for. Migrate incrementally. This single move removes most D-class drift.

### D2 — Radius, spacing, and icon sourcing are unsystematic *(P2)*
**Evidence:** Radius uses `rounded-md/lg/xl/2xl/[2.5rem]/[2rem]` with no scale discipline (the `--radius` token is 0.5rem but `rounded-xl` = 0.75rem is used widely). Spacing gaps span `1.5/2/2.5/3/4/6` arbitrarily. Icons mix `lucide-react` (`page.tsx:1`) with hand-rolled inline SVGs (the reset glyph `chat-client.tsx:463-478`; acceptable for the phone-mockup chrome, not for app controls).

**Recommendation:** Define a radius scale (sm/md/lg/pill) and a spacing rhythm; standardise on lucide for app controls; keep bespoke SVG only inside the device mockup.

### D3 — Microcopy-as-state strings are inconsistent in voice *(P2)*
**Evidence:** "— not set", "Filling in…", "Captured so far", "DRAFT", "Ready to confirm" (`spec-sidebar.tsx`) mix terse-technical and friendly registers within one component. See 02 §3 and 03 for the deeper fix.

---

## E. Modern SaaS behaviours

### E1 — No onboarding / activation scaffold *(P1)*
**Evidence:** First-run is "land in `/chat`." There is no checklist, progress, or "finish setup" surface tying together the three activation steps (create brief → connect Telegram → first brief). The north-star metric is signup → first `confirm_and_save` (`proposals/brief-creation-flow-proposal.md §7`), yet nothing in the shell scaffolds it. A user who signs up, half-configures, and leaves has no re-entry nudge.

**Recommendation:** A lightweight, dismissible activation checklist (on `/briefs` or a home surface): 1) Create your first brief · 2) Connect Telegram · 3) Get your first brief. Drives the exact metric the product is graded on.

### E2 — `window.confirm` for reset — the very anti-pattern flagged elsewhere *(P1)*
**Evidence:** `briefs-client.tsx:14` explicitly avoids `window.confirm` ("NOT window.confirm — that pattern was flagged in design-audit v2") and uses an inline reveal for archive. But the **highest-traffic flow** — chat reset — still uses `window.confirm(...)` (`chat-client.tsx:396`). The flagged anti-pattern persists exactly where it's most seen.

**Recommendation:** Replace with the same inline-confirm (or a proper dialog primitive) used on `/briefs`. Consistency + brand voice (the native dialog can't carry voice).

### E3 — Loading/empty states are uneven *(P2)*
**Evidence:** Some surfaces self-hide on load to avoid flash (CreditPill `chat-client.tsx:729`, PortfolioBurnCard `briefs-client.tsx:404` — deliberate, fine). Others have abrupt or text-only empty states. Empty states are functional but personality-free (`briefs-client.tsx:199`).

**Recommendation:** A consistent skeleton/empty convention; give the briefs empty-state a touch of the researcher's voice and an illustration. Low priority.

### E4 — Mobile nav is an acknowledged half-measure *(P2)*
**Evidence:** Mobile primary nav is a horizontal-scroll row (`app-nav.tsx:108-130`, comment: "a hamburger drawer is a follow-up"). Acceptable interim; with 5 tabs it's already tight and will worsen as IA grows.

**Recommendation:** Resolve alongside the C1/C2 IA cleanup — fewer top-level tabs makes the mobile row breathe and may remove the need for a drawer entirely.

---

## F. Accessibility (largely a strength)

- **Good:** `focus-visible:ring-2` applied consistently on interactive elements; `aria-live="polite"` + `role="log"` on the chat transcript (`chat-client.tsx:486-489`); `aria-current` on nav; status badges are text+colour, never colour-only (`briefs-client.tsx` comment & impl); `aria-hidden` on decorative SVGs; language-interest form has labels and `role="alert"`.
- **F1 — Verify contrast _(P2, confirm live):_** `muted-foreground` on `card`/`muted` backgrounds, and the 10–11px uppercase labels, are the likely AA risk spots, especially in dark mode (`--muted-foreground: 215 20.2% 65.1%`). Audit the smallest text against WCAG AA.
- **F2 — `window.confirm` (E2)** is also an a11y/voice regression vs a managed dialog.
- **F3 — Card-tap auto-submitted paragraph (02 §5)** puts ~30 words "in the user's mouth"; ensure screen-reader users understand a templated message was sent on their behalf.

---

## G. UX writing (governed by COPY_GUIDE; flagging drift & gaps)

- **Strength:** `COPY_GUIDE.md` is genuinely excellent — positioning, persona, vocabulary lock, honesty boundaries, voice-by-surface, error/empty anatomies. Most copy in the app already honours it.
- **G1 — The terminology gap the guide hasn't closed:** the three-way overload of "brief" (config vs delivery vs setup-act). The guide locks brief = output and setup = configuration, but the product uses "brief" for the *standing config* too (`/briefs` cards, "Your briefs", pause/resume). Full treatment in **doc 03**.
- **G2 — Placeholder/state copy bug:** the composer placeholder is "Type your reply…" even at turn 0, before anything has been asked (`chat-client.tsx:695`). Nothing to "reply" to yet. See 02 §7.
- **G3 — `bot` sublabel undercuts the persona:** the marketing mockup shows "bot" under Cadence's name (`sample-brief.tsx:77`). It's honest (it's the Telegram account type) but it's the one place the "researcher, not a bot" positioning reads "bot". Minor; note for the mockup refresh.
- **G4 — "DRAFT"/"Captured so far"/"not set"** in the spec sidebar are off-voice (engineer register). Doc 02 §3.

## H. Trust & credibility (core to the "researcher" promise)

- **H1 — Citations are the trust device and they're under-used in-app.** The mockup styles `[1][2][3]` source chips; the in-app brief render drops them into plain text (B4). Sourcing is *the* credibility proof for a research product — it should be a first-class, consistently-styled element everywhere a brief renders.
- **H2 — Cadence has no face in its own chat.** The marketing mockup gives Cadence a strong avatar + verified check; the actual config chat has no sender identity at all (`chat-client.tsx:494-501` — two anonymous bubbles). The "I research your industry…" voice has no visual presence. A light, consistent Cadence presence (avatar/name on the first turn) would humanise the researcher the copy works so hard to establish. See 02 §8.
- **H3 — Honesty is well-handled** (language interception `chat-client.tsx:228-265`; "Card payments are almost ready" `pricing/page.tsx:147`; "Multiple briefs are coming soon" `briefs-client.tsx:181`). This is a credibility *asset* — keep it.

---

## Severity roll-up

| P0 | P1 | P2 |
|----|----|----|
| _(none standalone — the P0-class issues are in `PLATFORM-AUDIT`, not UX)_ | A1, A2, B1, B2, B4, C1, C2, C3, D1, E1, E2 | A3, A4, B3, C4, C5, D2, D3, E3, E4, F1, G2, G3 |

The improvement plan (doc 04) sequences these with the brief-creation work (doc 02) and the terminology change (doc 03).
