# 02 — Brief-Creation Flow: Deep Dive & Redesign

**Date:** 2026-06-11 · **Focus area per the brief.** Builds on `proposals/brief-creation-flow-proposal.md` (starter-cards / gallery — ratified) and extends it to the parts of the flow that proposal didn't cover.

This is the wedge. The entire positioning ("set it up by talking") lives or dies here. The good news: it's already well above MVP. The gap is that it's engineered like a tool and not yet *staged* like an experience.

---

## 1. The flow as it exists today

Surface: `app/chat` → `components/chat/chat-client.tsx` + `starter-cards.tsx` + `spec-sidebar.tsx` + `brief-actions.tsx`.

```
Turn 0:  [Configure your brief]                    ← header, sans
         "I research your industry and send you
          a brief, on your schedule."              ← anon bubble
         "Tell me what to watch — in your words."  ← anon bubble
         Or start from one of these:
           🌴 Palm oil market brief   Daily, weekday mornings
           🧾 Tax and LHDN watch      Weekly
           🔭 Competitor watch        Weekly
         [Describe it in your words]               ← escape hatch

User taps card  →  a 30-word first-person paragraph is auto-submitted as
                   the user's message
        OR types free text

Agent interviews (≤7 Q)  →  spec sidebar fills (right rail / mobile <details>)
                         →  "Filling in…"  →  "✓ Ready to confirm"

Agent (LLM) calls confirm_and_save  →  BriefActions appears:
   "Your brief is ready. Want to see it?"
   [Preview a sample]  [Connect Telegram first →]  (or [Send to Telegram now])
```

**What's genuinely good** (keep): starter cards as informed consent; live spec sidebar concept; the inline payoff (preview *before* linking Telegram — `brief-actions.tsx`); multi-topic refusal with single-pick chips (`chat-client.tsx:185-218`); honest language interception (`:228-292`); transient-error auto-retry (`:159-172`); the credit pill (`:724`). This is a thoughtful flow.

---

## 2. The core diagnosis

The flow does the *logic* of onboarding well but under-stages the *experience*. Three structural weaknesses:

1. **The "notes" the researcher is taking look like a database** (the spec sidebar). §3.
2. **The user never explicitly says "yes, save this"** — the commit is delegated to LLM compliance. §4.
3. **The payoff (the brief itself) is shown as plain text**, so the "wow" lands flat. §6.

Plus the persona is invisible (§8) and a few state/copy bugs (§5, §7). Fixing these turns a competent form-by-chat into the "I hired a researcher" moment the marketing promises.

---

## 3. The spec sidebar is an engineer's inspector (the biggest issue) *(P1)*

**Evidence:** `spec-sidebar.tsx:27-48` renders the draft as a `<dl>` of UPPERCASE labels with **monospace** values, "— not set" for empties, header "Draft" / "Captured so far". The mobile variant hides it in a collapsed `<details>` whose summary is the only place the "ready" state appears (`:51-60`).

**Why it's wrong:** This is the surface where the user watches their researcher "understand" them. Monospace + "not set" + "DRAFT" is the visual language of a JSON debugger. For persona A (Hafiz, ESL feed-mill owner — `COPY_GUIDE §2`), a mono key-value table is intimidating and signals "software", not "a person is listening". It's also the closest thing in the app to the banned "spec/config" mental model the COPY_GUIDE works to avoid.

**Redesign — "What I've got so far", in plain language:**
- Replace the mono `<dl>` with a human summary that reads like a researcher's notepad confirming back to you:
  > **Here's what I've got**
  > Watching **palm oil market** — MPOB stocks, CPO futures
  > Every **weekday morning, 7:30**
  > In **English**, short and punchy
  > _Still need: do you produce, trade or buy?_
- Filled facts in normal (not mono) type, gently emphasised; the *one* open item phrased as the researcher's next question, not "— not set".
- Drop "DRAFT"/"Captured so far" eyebrow; the panel title is "What I've got so far" or simply "Your brief".
- Sentence-case, COPY_GUIDE voice ("I"), no field names exposed.
- On mobile, surface the readiness state *outside* the collapsed `<details>` so it can't be missed (ties to §4).

This single change does more for the "your own researcher" feeling than any colour or type work.

---

## 4. The commit moment is invisible and LLM-dependent *(P1)*

**Evidence:** The brief is saved when the **agent** calls `confirm_and_save` (an LLM tool call); `savedSpecId` is derived by scanning messages for that tool result (`chat-client.tsx:379-392`). The user's "looks good" is just a chat message; there is **no explicit user-controlled save button** tied to the `isReady` state. The original MVP flow (`docs/01-mvp-scope-and-flows.md` Flow A step 5; PRD F2.2) promised "a readable card with 'Edit' + 'Looks good'." Reality delegates the single most important commit to model compliance, and the "you're done" signal is a passive badge in a side rail (or a collapsed mobile disclosure).

**Why it matters:** (1) Reliability — if the model doesn't call the tool, the user is stuck "ready" with no way to commit. (2) Agency — users want to press the button on the most consequential action; watching it happen *to* them is disorienting. (3) Discoverability — the readiness moment is the activation pivot and it's under-celebrated.

**Redesign:**
- When `isReady(draft)` is true, surface an explicit, prominent **"Looks good — save this brief"** primary button (in the transcript flow, not just the side rail). Tapping it triggers the save deterministically (server-side commit from the current draft), independent of whether the model also calls the tool.
- Keep the conversational path too (saying "looks good" still works), but the button is the guaranteed, visible commit.
- On save, a clear success moment (§6) — not a silent transition to BriefActions.

---

## 5. Card-tap puts ~30 words in the user's mouth *(P2)*

**Evidence:** Tapping "Palm oil market brief" auto-submits a 30-word first-person paragraph as the *user's* message (`templates.ts:144`, dispatched at `chat-client.tsx:434-440`). The user watches a verbose message they didn't write appear under their name.

**Tension:** The proposal chose auto-submit deliberately ("a card tap is informed consent", `proposals/brief-creation-flow-proposal.md §3`) — and that's defensible. But rendering it as a *typed user message* is slightly uncanny.

**Recommendation (low-risk):** Keep the auto-submit, but render card-initiated turns with a subtle "Started from 🌴 Palm oil market brief" chip/marker instead of masquerading as free-typed text — so the provenance is honest and the user doesn't feel ventriloquised. The agent's confirm-and-personalise reply is unchanged.

---

## 6. The payoff is rendered as plain text *(P1, highest visual leverage)*

**Evidence:** `brief-actions.tsx:231-238` renders the preview as `whitespace-pre-wrap … text-[13px]` raw text. The real markdown renderer (`components/chat/markdown.tsx`) isn't used here. The most important moment in the funnel — *seeing the brief you just designed* — looks like a console log.

**Redesign:**
- Render the preview through the markdown component with brief-specific styling: section heads (Prices / What moved / Why this matters), citation chips `[1][2]`, coloured deltas (▲ success / ▼ danger), TL;DR emphasis — matching `sample-brief.tsx`.
- Frame it as a *delivered artifact*, not a code block: a card that looks like the message that will land in Telegram. Optionally show it inside the same phone-frame device as the marketing mockup, so "this is exactly what arrives" is literal.
- This is where the serif (B2) earns its keep — the brief body in an editorial serif sells "publication / research".

This one change is the difference between "the tool produced output" and "my researcher just handed me something".

---

## 7. State/copy bugs *(P2)*

- **Turn-0 placeholder:** composer says "Type your reply…" before any question exists (`chat-client.tsx:695`). Use a turn-0 placeholder ("Describe what to watch — e.g. palm oil prices") and switch to "Type your reply…" only after the first agent question.
- **Reset uses `window.confirm`** (`:396`) — replace with the inline-confirm pattern used on `/briefs` (see 01 §E2). Also relabel per COPY_GUIDE ("Reset" → "Start over"/"Discard").
- **Header "Configure your brief"** uses "Configure" — COPY_GUIDE prefers "setup"/"your brief" over "configure/config". Minor; "Set up your brief" or just "Your brief".

---

## 8. Cadence has no presence in its own chat *(P1 for the wedge)*

**Evidence:** The two greeting bubbles are anonymous bordered cards (`chat-client.tsx:494-501`); there's no avatar, name, or sender identity for Cadence anywhere in the config chat. Meanwhile the marketing mockup gives Cadence a warm terracotta avatar + verified check + name (`sample-brief.tsx:57-78`).

**Why it matters:** The whole product is "a *person* you set up in chat" (`COPY_GUIDE §6`: Cadence says "I"). A voice with no face is just a form. Giving Cadence a light, consistent identity (small avatar + "Cadence" on its first turn, the same terracotta mark as the mockup) makes the researcher real and ties the app to the marketing.

---

## 9. Redesigned turn-0 (consolidated)

Bringing §3, §6, §8 and the ratified starter-cards together, the redesigned first screen:

```
┌────────────────────────────────────────────┐
│  ◐ Cadence            [73 credits] [Start over] │  ← persona mark + serif-ish title
├──────────────────────────────┬─────────────┤
│  ◐ Cadence                   │ Your brief  │  ← sidebar = plain-language notes,
│  I research your industry     │             │     not a mono field table
│  and send you a brief, on     │ Nothing yet │
│  your schedule.               │ — tell me   │
│                               │ what to     │
│  ◐ Tell me what to watch —    │ watch and   │
│  in your own words.           │ I'll start  │
│                               │ taking      │
│  Or start from one of these:  │ notes.      │
│   ┌──────────────────────────┐│             │
│   │🌴 Palm oil market brief  ││             │
│   │  MPOB stocks, futures…   ││             │
│   │  Daily, weekday mornings ││             │
│   └──────────────────────────┘│             │
│   …(2 more)                    │             │
│  Browse all briefs · Describe it in your words │
├──────────────────────────────┴─────────────┤
│  [Describe what to watch — e.g. palm oil…] [Send] │  ← turn-0 placeholder
└────────────────────────────────────────────┘
```

And the readiness → commit → payoff sequence:

```
…interview… → sidebar: "I've got everything I need ✓"
            → in-thread:  [ Looks good — save this brief ]   ← explicit, deterministic
            → SAVED: success moment, Cadence "Saved. Here's a sample of tomorrow's brief:"
            → brief rendered as a styled artifact (phone-frame, citations, deltas, serif)
            → next action: [Connect Telegram] (the one thing left)
```

---

## 10. Priorities within the flow

| # | Change | Severity | Effort |
|---|--------|----------|--------|
| §3 | Rewrite spec sidebar as plain-language notes | P1 | S–M |
| §4 | Explicit "save this brief" commit button on ready | P1 | S |
| §6 | Render preview/brief as a styled artifact (markdown + citations + deltas) | P1 | M |
| §8 | Give Cadence a presence (avatar/name) in chat | P1 | S |
| §7 | Turn-0 placeholder, reset dialog, header wording | P2 | S |
| §5 | Card-tap provenance chip (stop ventriloquising) | P2 | S |

§3, §4, §6, §8 together are roughly one focused sprint and convert the flow from "competent" to "the moment the whole company is selling". They slot into **Wave B** of the plan (doc 04).
