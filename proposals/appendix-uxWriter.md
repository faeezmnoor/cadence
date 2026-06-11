# Cadence brief-template copy — UX writer recommendations (final)

## 1. Naming

**The gallery surface (header inside the expanded section / bottom sheet):**
**"Briefs I can run for you"** — recommended. It compounds the vocabulary lock (everything stays "a brief"), keeps the first-person researcher voice, and frames cards as offers from a person, not SKUs. Tradeoff: it's a 6-word header where "All briefs" would do; I accept that — "All briefs" reads as inventory, and inventory is the marketplace gravity we're avoiding. Fallback if testing finds it precious: **"Starting points"**. Never "Templates", "Gallery", "Library", "Catalog", or "Examples" — researchers don't hand you templates, and a catalog implies depth we deliberately don't have at ~7 cards.

**The trigger:** kill the bare "+". An unlabeled plus next to brief cards reads "create new brief" — which is what *the whole chat* does, so it's a lie about hierarchy. Use a text button: **"Browse all briefs"** (verb-first, 3 words). If layout forces an icon-only affordance on mobile, tooltip/aria-label is "Browse all briefs" — identical string, no synonyms.

**Categories** (vetting PM/designer proposals — topic nouns confirmed, persona labels rejected):

| Proposed | Verdict | Final |
|---|---|---|
| Markets & commodities | Keep — user language for ICP-1 | **Markets & commodities** |
| Rules & regulation | "Rules" is vague; users say "tax", "regulation" | **Regulation & tax** |
| Companies & competitors | Flip it — "competitors" is the want, lead with it | **Competitors & companies** |

Section labels are sentence case, no emoji, no counts ("3 briefs").

**Card copy formula** — four mandatory slots, one optional:

`[emoji] + [Name: noun phrase, ≤4 words, ends in "brief" or "watch"] + [Value line: ≤10 words, what lands in your hands, no channel, no tier] + [Cadence hint: muted, rendered from seedHints — never a second hardcoded string]`

Optional fifth slot, example headline in quote styling — only if pulled from a real run or visibly framed as illustrative ("e.g. —"). A fabricated static fact is a broken promise to the one user who checks.

**Four worked examples (GA-clean briefs only):**

1. 🌴 **Palm oil market brief** — MPOB stocks, USDA data and futures moves, explained · *Daily, weekday mornings*
2. 🧾 **Tax and LHDN watch** — new rulings and circulars before your clients ask · *Weekly*
3. 🔭 **Competitor watch** — launches, pricing changes and hiring moves at your rivals · *Weekly*
4. 🍗 **F&B cost watch** — chicken, cooking oil and sugar price pressure, summarized · *Weekly*

(MPOB/LHDN are not jargon to the people these cards are for — they're recognition triggers. Generic source-dumps like "Reuters, Bernama, RSS" are jargon; named regulators are value.)

## 2. Microcopy

**Empty chat greeting** (two bubbles, one idea each, ≤12 words):

> I research your industry and send you a brief, on your schedule.
>
> Tell me what to watch — in your own words.

Above the 3 starter cards, a muted label: **"Or start from one of these"**. The order matters: free text is invited *first*, cards are the fallback. Templates are training wheels; the copy must never make them the main path.

**Escape hatch** (sits beside "Browse all briefs", equal visual weight):

> **Describe it in your words**

Three-and-a-half words, verb-first, and it restates the wedge every time it's seen. Not "Skip", not "Something else" — those frame free text as the exception.

**Post-selection confirmation** (agent's first reply after a card tap — confirm, then one personalizing question, never re-ask what the card answered):

> On it — palm oil, every weekday morning.
>
> One question: do you produce, trade or buy?

Pattern: `[Acknowledgment + the two slots the card set] → [exactly one forking question]`. If the agent asks about schedule or topic after a card tap, that's a bug, not a copy problem — this string is the contract the post-tap eval should assert against.

## 3. Banned / preferred terms

| Banned in UI | Use instead | Why |
|---|---|---|
| use cases | briefs, "what I can track for you" | Hard constraint |
| template(s) | a brief, ready-made brief | Engineer leakage; researchers don't do templates |
| digest, report, alert, newsletter, feed | the brief | Vocabulary lock; "alert/feed" invite wrong product mental models |
| spec, config, configure | setup, "your brief" | COPY_GUIDE canon |
| gallery, catalog, library, marketplace | "all briefs" | Implies inventory scale we don't have |
| Pro, tier, premium | advanced research | COPY_GUIDE canon |
| Reset | Start over / Discard changes | Decided 2026-06-05 |
| "For consultants/SMEs/operators…" | topic-noun section names | Persona labels bounce non-matchers |
| "Sent to Telegram" (in cards/greeting) | "on your schedule" | Never lead with channel |
| Choose / Select a template | tap the card; CTA if needed: "Start this brief" | Verb-first, keeps the noun |
| Coming soon | (omit the card entirely) | A card is a promise |

One closing opinion: the single highest-risk string in this whole feature is the post-selection confirmation, because it depends on LLM compliance, not CSS. Pin it in the golden-set evals before the cards ship.