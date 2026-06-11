# Cadence brief-creation flow — senior UI/UX review

## 1. Why the current 10-pill cloud fails

**It's a menu pretending to be a conversation, and it's bad at both.** Ten pills is past the scanability cliff (~5–7 chips before users stop reading and start sampling); a flat cloud has no hierarchy, so "Palm oil + MPOB" (your wedge, monetizability 5/5) carries the same visual weight as "Man United match odds" (explicitly deferred, ethics drag). The pills don't communicate *what you get* — "🏦 Maybank + KLSE" could be a price alert, a newsfeed, or a research report. Since your anti-positioning is "not a price tracker, not a newsfeed," ambiguous pills actively invite the wrong mental model, then the product disappoints against it.

**Trust failure is the sharp edge.** An example is a promise. Five of the ten pills (flights, betting odds, Bitcoin, ePerolehan tenders, arguably KL property) promise things the stack can't deliver and COPY_GUIDE §2 now bans from all examples. A first-time user who taps "✈️ Tokyo flight prices" hits the graceful-fallback copy on their *first interaction* — you've spent your first impression teaching them what Cadence *isn't*. That's worse than no pills.

**Mobile:** 10 pills wrap to 5–6 rows, pushing the input below the fold; the user's first scroll happens before their first word. And the empty right panel ("not set" × 6) reads as a form-in-waiting — six fields of homework — undercutting the no-forms wedge before the first message.

**Root cause:** the pills are doing three jobs at once — (a) teach what Cadence can do, (b) seed a good first message, (c) reduce blank-page anxiety — and a 3-word label can't do any of them well. The fix is to split the jobs.

## 2. The founder's proposal: right instinct, wrong container

"3 pills + '+' → modal gallery of grouped cards" correctly separates *fast start* (pills) from *capability browsing* (gallery). The reference patterns mostly support it — with caveats:

- **ChatGPT prompt starters** (4 cards, two-line: bold verb + grey qualifier) prove the *3–4 rich starters* half. They never modal; overflow is just "more suggestions" inline. That restraint is the lesson.
- **Notion templates** work as a full gallery because templates there are *destinations* (you live in the result). Cadence templates are *utterances* — a seeded first message. Modaling an utterance is heavyweight: you context-switch the user out of the conversation to pick a sentence, then dump them back.
- **Linear** keeps creation in one surface and uses progressive disclosure (defaults visible, everything else behind one affordance). That's the structural model to copy.
- **Superhuman** teaches capability *in flow* (one hint at a time, in context) — the argument for the mid-conversation `suggest_quick_replies` path you already have, not a front-loaded catalog.
- **Zapier templates** is the cautionary tale: thousands of grouped cards works only because Zapier *is* a catalog product. Cadence has **9 GA-viable briefs**. A grouped, searchable modal for 9 items is enterprise furniture in a studio apartment — it signals "complicated product" and creates taxonomy debt ("grouped by type" — whose types?).

**When modals break chat UIs:** when shown before the first message (you've rebuilt a form lobby — the exact thing chat-config exists to kill), and when selection inside them commits invisible state (user can't see what the pick "did"). Both risks are live in the proposal. **When they work:** invoked *by the user*, browse-not-configure, and selection lands back in the primary surface as something visible and editable.

**Verdict:** keep "3 pills + an overflow affordance," replace the modal with a lighter inline container, and shrink the catalog ambition from "all brief types, current + future" to "the 9 that work + graceful framing for the rest." Do not put future-stack briefs (tenders, crypto, tickers) as selectable cards — a card is a promise, same as a pill. The PM's "cover the vision end-to-end" goal is served by the *agent's* fallback copy and the missing-capabilities telemetry, not by aspirational cards.

## 3. Recommended experience

**Turn 0 (desktop):** Greeting bubble, then **3 starter cards** (not pills — cards earn their richer anatomy), one per anchor ICP:

1. 🌴 **Palm oil market brief** — "MPOB, USDA and futures moves, every morning" · *Daily, 8:00am*
2. 📜 **Regulation watch** — "LHDN and sector rule changes that affect you" · *Weekly*
3. 🔭 **Competitor watch** — "Launches, pricing and hiring moves at rivals" · *Weekly*

Below them, two text-button affordances on one line: **"Browse all briefs →"** and **"Or just tell me what you want to track"** (the escape hatch must be as visually legitimate as the cards — free text is the wedge, templates are training wheels).

**"Browse all briefs" →** expands an **inline section that replaces the 3 cards in-place** (desktop: the welcome block grows; mobile: a **bottom sheet** at ~85vh with drag-to-dismiss — never a centered modal on mobile). Chat stays visible behind/above; this is disclosure, not navigation. Honors "one chip strip at a time."

**Gallery contents:** the ~9 GA cards in **three labeled sections, ICP-shaped but topic-named** (never persona-named in UI):

- **Markets & commodities** — palm oil daily, multi-commodity weekly, F&B input costs
- **Rules & regulation** — regulatory change, tax/LHDN, clinical/case-law (mark the paywall-limited ones honestly: "journal abstracts only")
- **Companies & competitors** — competitor watch, target accounts, beat tracking

Sections, no search, no tabs. Nine cards don't need search; adding it implies a catalog you don't have. Revisit at 25+ cards.

**Card anatomy (fixed, all four slots mandatory):**
- Emoji icon (house style — keep emoji, don't introduce an icon set for 9 cards)
- **Name** ≤4 words, noun-phrase, sentence case ("Palm oil market brief")
- **One-line value description** ≤10 words, what lands in your hands, never the channel, never sources-as-jargon
- **Cadence + time hint** in muted text ("Daily, weekday mornings") — this quietly pre-answers two interview questions and sets the "recurring" mental model the pills currently fail to convey

Optional fifth element, highest-leverage if you can afford it: a 1-line **example headline** in quote styling ("*CPO futures up 2.1% as MPOB stocks tighten*") — nothing communicates "this is a researched brief, not a newsfeed" faster.

**After selection — the critical moment.** Keep the agent as the single spec writer; do *not* write `draft_spec` from the card. Mechanics:

1. Card tap **auto-submits** `exampleQuery` as the user's message (cards are informed consent — they've read the description; reserve autofill-and-edit for pills, which are vaguer). Sheet/section closes.
2. The slot extractor + a `seedHints` block injected via prior-context immediately populate TOPIC, SPECIFICITY, SCHEDULE in the panel. **The panel animating from "not set" → filled within ~1s of the tap is the whole payoff** — the user watches a researcher take notes, not a form fill itself. Stagger the field-fill animation 100–150ms apart; it reads as comprehension.
3. The agent's next turn must **confirm + personalize, never re-ask**: "Got it — palm oil, daily. Which side do you sit on — producer or buyer?" One template tap should reduce the interview from ~6 questions to 2–3. If picking a card restarts the full interview, the gallery is theater.

**Mid-conversation:** no gallery re-entry needed for MVP; contextual quick replies already own that lane. (Post-multi-brief, `clone_from` becomes the real "template" — note it, don't build it now.)

## 4. Naming ("use cases" banned)

| Surface | A (recommended) | B | C |
|---|---|---|---|
| Gallery entry | **Browse all briefs** | Explore briefs | See what I can track |
| Gallery title | **Briefs I can run for you** | Ready-made briefs | Starting points |
| Cards (internal noun) | **brief** (just "a brief") | starter brief | ready-made brief |
| Sections | **Topic nouns** (Markets & commodities…) | "For [role]…" framing | Popular / New |

**Recommendation: column A.** It never introduces a second noun — everything is "a brief," which compounds the vocabulary lock instead of fighting it. "Briefs I can run for you" keeps Cadence's first-person researcher voice (COPY_GUIDE: "I" in chat) and frames cards as *offers from a person*, not SKUs. Avoid "templates" entirely in UI (engineer leakage, and contradicts "your own researcher" — researchers don't hand you templates); avoid "For consultants…" section labels (persona labels make non-matching users bounce). "Starting points" is the safe fallback if A tests as too cute.

## 5. Visual/interaction details that matter

- **Pills→gallery relationship:** the 3 starter cards must be *visibly the same component* as gallery cards (same anatomy, same radius/border tokens) so the gallery reads as "more of these," not a different system. The 3 are the first rows of the catalog, promoted.
- **Density:** desktop gallery 2-up grid, ~72–88px cards, generous line-height — 9 cards must feel curated, not packed. Mobile sheet: single column.
- **Icons:** emoji-only, one per card, no duplicates across cards; ban flag/money-bag/chart-up emojis that imply trading.
- **Overflow:** none at 9 cards. Hard rule going forward: a card ships only when the stack serves it (✅ rows in the audit). The empty state for a section is *removing the section*, never "coming soon" placeholders.
- **Hygiene:** keep template `id`s stable for `classifyTopic` telemetry; add `visible: false` for the 5 retired excluded-list templates; keep `data-testid` hooks (`chat-starter-chips`) until tests are migrated; gallery logic in a `lib/` helper with pure-function tests; bottom sheet respects reduced-motion.
- **Right panel at turn 0:** while we're here — collapse it to TOPIC + SCHEDULE with the rest appearing as captured. Six "not set" fields is the form ghost haunting the wedge.

**Sequencing:** (1) re-curate `templates.ts` to the 9 GA briefs — copy-compliance fix, ship this week regardless; (2) 3 cards + escape hatch; (3) inline gallery/bottom sheet; (4) `seedHints` + interview shortening. Step 1 alone fixes the trust problem; step 4 is where the gallery starts earning conversions.