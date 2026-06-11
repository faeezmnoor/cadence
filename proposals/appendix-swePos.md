# Brief-creation revamp: pills → template system

## 1. Current pill implementation — honest assessment

**It's better than it looks, but the founder's instinct is right.** The good news: turn-0 pills are already data-driven from a typed config (`lib/digest-spec/templates.ts`, `DIGEST_TEMPLATES`), not inline JSX. There's a real `DigestTemplate` model with `id`, `category`, `match` keywords, and telemetry coupling via `classifyTopic()`. So "scalability" isn't an architecture problem — it's a **presentation and seeding-fidelity problem**:

- **Seeding is lossy by design.** A pill click does `setInput(template.exampleQuery)` — one natural-language sentence into the agent, which then runs slot extraction. Nothing touches `draft_spec` directly. That's the *right* invariant (one spec-writing pipeline), but a 2–4 word label backed by a one-sentence query gives the LLM almost nothing: no entities, no suggested cadence, no RSS pack. Result: the user still answers 4–6 questions, and extraction variance means two users clicking the same pill can land on different specs.
- **Flat cloud of 10 doesn't scale visually or cognitively** — at 20 use cases (the audit's inventory) it's a wall.
- **The content is actively wrong today.** Five of ten visible templates (flights, Man United odds, Bitcoin, ePerolehan, arguably KL property) violate COPY_GUIDE §2's exclusion list *and* sit in the audit's ❌ column — they advertise briefs the stack can't deliver. This is the single most damaging thing on the screen: a pill is a promise, and these promise confused half-briefs followed by fallback copy.
- **Mid-conversation chips depend on fuzzy tool compliance** (`suggest_quick_replies` often doesn't fire; fallback to `ask_user.suggestions`). Any new design must assume the LLM-driven chip path is unreliable.

## 2. Template system — technical shape

**Data model** (extend `DigestTemplate` in place; keep `id` stable — `classifyTopic` telemetry depends on it):

```ts
type DigestTemplate = {
  id: string;                  // stable, telemetry-load-bearing
  label: string;               // chip text, ≤4 words
  emoji: string;               // keep emoji; don't build an icon system yet
  description: string;         // card copy: what the brief contains + cadence, ≤2 sentences, COPY_GUIDE voice
  category: 'commodities' | 'regulation' | 'competitors' | 'accounts' | 'research';
  exampleQuery: string;        // richer first message (see below)
  seedHints?: Partial<DigestSpecDraft>;  // entities, cadence default, rss pack refs — injected into prompt, never written to draft_spec
  suggestedTier?: 'default' | 'pro';
  visible: boolean;            // false = retired but classifier keeps matching
  match: string[];
}
```

**Where it lives: stay in the typed config file.** No DB table. Reasons: single editor (Faeez), Vercel deploys take minutes, TypeScript catches schema drift at compile time, the audit explicitly says a template marketplace is premature (<100 users), and file-as-source-of-truth is already the documented design. A DB table buys runtime updatability nobody needs and costs an admin UI, migrations, and a cache layer. Revisit only when someone other than the founder edits templates.

**Seeding mechanism — commit to this:** the agent stays the *only* writer of `draft_spec`. Template selection does two things:

1. **Auto-submits a richer `exampleQuery`** as the user message (upgrade from autofill — for a deliberate card selection in a gallery, editing-before-send friction isn't worth it; keep autofill for the bare turn-0 chips).
2. **Injects `seedHints` into the system prompt's prior-context block** (`prior-context.ts`): "User selected the Palm Oil template. Likely entities: MPOB, CPO futures. Default cadence: daily 07:30. Suggested RSS pack: mpob-bernama-usda. Confirm, don't assume." The agent extracts/confirms in 1–2 turns instead of 5.

Do **not** pre-populate `draft_spec` from the template. A direct write bypasses slot-merge, `recordChatTurn`/`recordExtractionEvent` telemetry, the multi-topic guard, and creates a second spec-writing pipeline that will drift from the first. The `seedHints`-in-prompt path gets ~90% of the UX benefit (sidebar fills in within one assistant turn) with zero new invariants.

This also dovetails with the sanctioned **curated RSS pack library** (CAD-Phase6-RSS-Curation): `seedHints.rss_feeds` referencing pack IDs is exactly that epic wearing a template hat.

## 3. Founder's "top 3 pills + '+' gallery modal"

**Verdict: right destination, but ship the inline version first** (see §5). Specific challenges:

- **"Top 3" should be persona-fixed, not popularity-driven**: one card each for Hafiz/Mei Ling/Daniel (palm oil daily, regulatory weekly, competitor watch) — matching the landing page's three ICP stripes. There's no usage volume yet to compute a real "top 3."
- **Implementation cost: ~2–3 days, modal is the expensive half.** No radix/shadcn means hand-rolling the dialog: portal, focus trap, Esc/overlay close, body scroll-lock, `aria-modal`. That's a half-day of fiddly a11y work for a solo project. Card grid grouped by `category` with section headings is trivial Tailwind (`bg-card border-border rounded-xl`, match existing tokens). Put grouping/filter logic in a `lib/` helper with vitest coverage, not inline JSX.
- **Mobile**: a centered modal over chat is cramped at 375px — make it a full-screen takeover or bottom sheet (`fixed inset-0` with a slide-up panel, single column). One component, two layouts via breakpoints.
- **Chat-state interaction**: selection closes the gallery and auto-submits via the existing `useChat` `append` path — same pipeline as contextual chips, so multi-topic guard and telemetry fire normally. **Gate the "+" to turn 0 / `!hasMessages` for v1.** Mid-conversation template selection mid-draft is a state minefield (does it discard the draft? merge?) — that's the Multi-Brief UX's "Start over"/`clone_from` territory, don't solve it here.
- **Copy**: "use cases" is banned and "templates" smells like config. Header the gallery **"Browse briefs"** or "Brief ideas"; sections like "Commodities & inputs", "Regulation & compliance", "Competitors & accounts". Card descriptions in researcher voice, never leading with Telegram. Get the UX-writer pass on the 10–12 visible cards — it's a one-hour review, the catalog is small.

## 4. Risks

- **Template drift vs extraction logic (highest risk).** A template promises "MPOB circulars + CPO futures daily"; if `extract.ts`/the agent can't reliably land those slots from the `exampleQuery`, the card lied. **Mitigation: a golden-set vitest suite** — for each visible template, assert the deterministic extractor pulls the expected slots from `exampleQuery`, and (cheaper than eval-gating) assert `seedHints` validate against `digestSpecDraftSchema`. Run in CI; a template edit that breaks extraction fails the build.
- **Catalog vs stack-gap fallback**: every visible template must be a ✅ row in the use-case audit. The gallery is also where the *graceful-fallback* rule bites — if someone types "flights" anyway, the agent copy ("Cadence doesn't do flights yet — want…") handles it; the gallery just must never invite it.
- **Analytics — needed to learn anything**: `gallery_opened`, `template_card_viewed` (or settle for impressions = opens), `template_selected {template_id, source: chip|gallery}`, and stamp `template_id` onto the thread so `confirm_and_save` can emit `brief_saved {template_id}`. Selection→save is your conversion metric per template; classifyTopic already stamps runs, so the join is cheap. Without `template_id` on the saved spec, the gallery teaches you nothing.
- **i18n**: don't. Only `en` ships; ms/zh chips are already intercepted into the interest form. Keep template strings in the file; extracting to a strings layer now is speculative work.
- **Updatability without redeploy**: config-in-repo is fine — argued in §2. The flag risk is forgetting `visible:false` exists; document it at the top of `templates.ts`.

## 5. Phased build

**Phase 1 (1–2 days, ship this week): re-curate + inline disclosure, no modal.**
1. Fix the catalog: retire the 5 COPY_GUIDE-violating templates (`visible:false`, ids intact), add ✅-column replacements (multi-commodity weekly, F&B input costs, LHDN/tax, target-account watch, regulatory sector brief) → ~10 visible, persona-aligned.
2. Add `description`, `category`, `visible` to the type; show 3 persona chips + a **"More ideas" disclosure that expands inline** below the welcome bubble into the grouped card grid — same component you'd put in a modal, zero dialog plumbing, fine on mobile by default. Respects "one chip strip at a time".
3. Analytics events + `template_id` thread stamping. Keep `data-testid` names; check `test/` and `wave4-bundled-regressions.test.ts` before touching labels.

**Phase 2 (2–3 days):** `seedHints` + prior-context injection + auto-submit from cards; golden-set extraction tests; wire RSS pack references. *This is the phase that actually makes briefs more reliable — prioritize it over modal polish.*

**Phase 3 (later, behind Multi-Brief UX):** promote the inline grid to a modal/bottom-sheet if the welcome screen feels heavy; mid-conversation gallery via a config-agent tool result; `clone_from` cards ("similar to your Palm Oil brief").

**Cheaper alternative worth a real look:** skip the gallery as a *component* entirely and make it a **route** — `/chat` shows 3 chips + a "Browse briefs" link to a static grouped-cards page; card click navigates to `/chat?template=<id>`, which auto-submits the query. No modal, no chat-state interaction, shareable/linkable template URLs (useful for marketing and the three landing-page ICP stripes), and it slots cleanly into the coming `/briefs` home as `/briefs/new`. If Multi-Brief UX lands within a month, this is arguably the *better* end state, not just the cheaper one.

**One-line recommendation:** ship Phase 1's curation fix immediately regardless of everything else — today's pills are marketing five briefs the product is forbidden to promise, and that's a live bug, not a design debate.