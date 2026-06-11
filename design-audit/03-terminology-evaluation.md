# 03 — Terminology Evaluation

**Date:** 2026-06-11 · **Lens:** senior UX writer / content designer.
**The brief's question:** *"Evaluate whether 'brief'/'briefs' is the right word… Evaluate our overall terminology."*

> **DECISION (founder, 2026-06-11): §1 ratified — "brief" stays. §3's rename REJECTED** — "watch" reads alert/monitoring (the banned mental model) and is a downgrade from "brief." Resolution: keep "brief" for both layers like "newsletter" (*my brief* / *today's brief*); the counting collision is solved by copy, not a rename — the list counts **briefs**, billing counts **credits**, and "1 credit = 1 brief" is the only meeting point. Recorded as binding in `COPY_GUIDE §4b`. §§3's analysis is retained below for the record; do not re-open.

**TL;DR:**
1. **"Brief" beats "digest" and every other candidate for the delivered artifact. Keep it.** This is already settled correctly in `COPY_GUIDE §4`; we ratify it with reasoning below.
2. **The real, unsolved problem isn't brief-vs-digest — it's that "brief" is overloaded across three distinct concepts.** Today the 1-brief cap hides the collision. Multi-brief will expose it as a counting/trust bug.
3. **Recommended fix: split the standing *thing you manage* from the *thing that's delivered*.** Keep "brief" = the delivered, billable artifact; give the recurring configuration its own noun. Lead candidate: **"watch"** (the product already uses it).
4. **Internal code says "digest" everywhere (`DigestSpec`, `digest_specs`, README).** Don't rename the database — but fix the user-adjacent docs and add a glossary so "digest" never leaks into UI.

---

## 1. Is "brief" the right word for the delivered artifact? — Yes.

The output is: short · sourced · synthesised · personalised · periodical · decision-useful · handed to you by a "researcher". Candidates and why they lose:

| Word | Verdict | Reasoning |
|------|---------|-----------|
| **brief** | ✅ **Winner** | What a researcher/analyst/staffer hands a principal ("morning brief", "intelligence brief"). Directly reinforces the *"your own researcher"* persona — a researcher *briefs* you. Connotes short, prepared-for-you, decision-grade. Verbs cleanly ("I'll brief you"). Clean singular/plural. |
| digest | ❌ (current code name) | Implies a passive, machine, un-personalised round-up (Readers' Digest, "email digest"). It's precisely the *generic-aggregator* mental model `COPY_GUIDE §1` bans ("never categorised as newsfeed/aggregator"). Weak persona fit — nobody's *researcher* sends a "digest". |
| report | ❌ | Too heavy/formal/long; implies a one-off deliverable, not a daily rhythm. Corporate, cold. |
| newsletter / bulletin | ❌ | Newsletter = broadcast, same-for-everyone — kills the personalisation wedge. Bulletin = institutional/alerty. |
| alert / notification | ❌ | Implies event-triggered, real-time, single-fact — directly contradicts the honesty line "every morning, one short brief" and the banned "real-time/never miss" framing (`COPY_GUIDE §5`). |
| update / recap / roundup / rundown | ❌ | Generic, un-ownable, no persona. "Roundup" especially reads aggregator. |
| dispatch / wire / memo | ⚠️ | "Dispatch" has nice correspondent-from-the-field romance and would survive; "memo" is internal-corporate; "wire" is trader-coded. None beat "brief" on persona fit + plainness, and all are *less* ESL-friendly (persona A). |

**Conclusion:** "Brief" is the best available word on every axis that matters — persona fit, value connotation, plainness for ESL readers, verbability, and *avoiding* the aggregator/alert mental models the strategy forbids. **Do not reopen this.** The COPY_GUIDE lock is correct.

---

## 2. The actual problem: "brief" names three different things

"Brief" is currently used for **three distinct concepts**:

| # | Concept | Where it shows up as "brief" today |
|---|---------|-----------------------------------|
| **C1** | The **standing configuration** — the recurring research thread you name, schedule, pause, resume, archive | `/briefs` page ("Your briefs"), brief cards, "+ New brief", "pause/resume this brief", `briefs.canCreate` "X of N briefs" (`briefs-client.tsx`) |
| **C2** | The **delivered artifact** — one morning's message; the **billable unit** | "1 credit = 1 brief", "Send me one now", "today's brief", the thing rendered in Telegram (`COPY_GUIDE §4`, `brief-actions.tsx`) |
| **C3** | (loosely) the **act of setting it up** | chat header "Configure your brief" |

C3 is minor (the COPY_GUIDE already steers config → "setup"). **C1 vs C2 is the real collision**, and it's load-bearing on both sides:
- C2 is locked by the best money sentence in the product: **"1 credit = 1 brief. Advanced research uses 3."** Here a brief is unambiguously *one delivery*.
- C1 is what the entire `/briefs` management surface is about, and what multi-brief is built around.

### Why it's invisible today and breaks at multi-brief
With the 1-brief cap, a user has exactly one C1 and it emits one C2/day — the two readings never visibly conflict. The moment multi-brief ships:
- **"5 briefs"** on `/briefs` = 5 *standing configs* (C1).
- **"73 briefs"** in the credit balance = 73 *deliveries* (C2).
- A reasonable user reads: *"I have 5 briefs but my balance says 73 briefs — what?"*
- "3 of 5 briefs" (config cap) sits inches from "1 credit = 1 brief" (delivery). Same word, two different nouns, one screen. That's a trust/clarity defect in the exact surface (billing-adjacent) where confusion is most expensive.

This is a **pre-multi-brief blocker for terminology**, even though it's only a P2 today.

---

## 3. Recommended resolution: two nouns

Keep the locked, load-bearing meaning; rename the other.

- **Delivery / billable unit = "brief".** Unchanged. "1 credit = 1 brief" stays. Everything in C2 stays.
- **Standing configuration = its own noun.** The thing on `/briefs` you create, name, schedule, pause, resume, archive.

### Lead recommendation for the standing noun: **"watch"**
**Why "watch" is the strongest candidate:**
1. **The product already uses it.** Half the catalog is named with it — "Competitor **watch**", "Tax and LHDN **watch**", "F&B cost **watch**", "Regulation **watch**" (`templates.ts`). Users are *already* being taught that the standing thing is a watch.
2. **It verbs perfectly and matches intent:** "watch palm oil", "set up a watch", "pause this watch". A standing interest you keep an eye on.
3. **Short, concrete, ESL-safe** (persona A) — much more than "subscription" or "beat".
4. **Clean sentence:** *"Set up a **watch** → get a **brief** every morning → 1 credit per brief."* No overload anywhere.

**The one caveat:** "watch" leans faintly toward the *alert/monitoring* mental model the COPY_GUIDE is wary of. Mitigation: a *watch* is a standing **interest**, the *brief* is the periodical **output** — they're different layers, and the brief (not the watch) carries the "every morning, quiet days included" promise. Used this way, "watch" doesn't imply real-time alerting. (If, after testing, "watch" still reads too alerty, the fallback below applies.)

### Fallbacks (in order)
- **"beat"** — a researcher's/journalist's beat. *Beautiful* persona fit ("your beats", "add a beat", "what's on your beat") — but less transparent for ESL readers (persona A, English-third-language). Use only if the audience skews to personas B/C.
- **Keep "brief" for C1, rename C2 to "edition"/"issue".** A standing *brief* (the title) emits a daily *edition*. Clean publication metaphor — but it forces rewording the locked, excellent "1 credit = 1 brief" into "1 credit = 1 edition", which is a real downgrade. **Not recommended** for that reason.
- **"feed" / "subscription"** — both **banned** (`COPY_GUIDE §4`: feed invites the aggregator model; subscription invites the recurring-charge model the no-subscription pricing fights).

### Net proposed model
| Layer | Noun | Example strings |
|-------|------|-----------------|
| The standing thing you manage | **watch** | "Your watches" · "New watch" · "Pause this watch" · "3 of 5 watches" |
| The thing delivered each morning (billable) | **brief** | "Your brief arrives every morning" · "1 credit = 1 brief" · "today's brief" |
| The act of setting up | **setup** | "Set up your brief" / "Your brief setup" (already COPY_GUIDE canon) |

This removes the collision, *reinforces* the researcher persona on both layers, stays ESL-safe, and touches the locked money copy **zero** times.

> **This is a call the founder + UX-writer should ratify**, because it renames a top-level nav tab and the `/briefs` surface, and it amends `COPY_GUIDE §4`. The recommendation is strong, but the decision is theirs. **Decision should be made before multi-brief GA**, not after — renaming a noun users have already learned is far more expensive than naming it right once.

---

## 4. The internal/external split: "digest" in the code

**Evidence:** The codebase is built on "digest" — `DigestSpec`, `digestSpecSchema`, `digest_specs` table, `digest_runs`, `runDigestPipeline`, `lib/digest-spec/`, and the app `README.md` / both `CLAUDE.md` files still describe the product as "periodical, self-learning market-research **digests**." Meanwhile every user-facing string says "brief".

**This is fine *as internal vocabulary*** — but two cleanups are warranted:

1. **Don't rename the database/code.** `digest_specs`, `digest_runs`, `classifyTopic`, telemetry ids — renaming these is high-risk, high-cost, and load-bearing (ids are telemetry-keyed per `templates.ts`). The internal/external term split is a normal, healthy pattern. Leave it.
2. **Do fix the user-adjacent docs + add a glossary** so "digest" never leaks into UI:
   - `apps/web/README.md`, root `CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/` headers say "digest" — update the *prose descriptions* to "brief" (the user-facing word) while keeping code identifiers as-is.
   - Add a one-line glossary to `COPY_GUIDE.md` / `CLAUDE.md`: *"In code, the entity is `digest_*`; in all user-facing text it is **a brief**. Never surface 'digest' to users."* This stops new contributors from leaking the code noun into copy.

---

## 5. Wider terminology pass (quick verdicts)

The COPY_GUIDE already governs most of these well; flagging the few worth attention:

| Term | Status | Note |
|------|--------|------|
| **brief** (artifact) | ✅ keep | §1 |
| **watch** (standing config) | ➕ adopt | §3 — the headline recommendation |
| **setup** (not config/spec) | ✅ canon | Ensure chat header "Configure your brief" → "Set up your brief" (02 §7) |
| **standard / advanced research** (not Pro/tier) | ✅ canon, good | Clean separation of pack-words (quantity) vs depth-words (quality) is excellent |
| **credits** + "1 credit = 1 brief" | ✅ keep | Best money sentence in the product; the §3 split *protects* it |
| **Delivery** (nav) vs **Connect Telegram** (action) | ⚠️ keep but support | Channel-agnostic label is right strategically but abstract at activation — see 01 §C4 |
| **react / tell it what to change** (not "tune/distill/bias") | ✅ canon | "👎 Less like this" is well-judged |
| **Learning** ("what Cadence learned about you") | ✅ fine | Good plain noun for the self-learning surface |
| **bot** | ⚠️ contain | Banned as identity; only acceptable as the literal Telegram account type. The mockup's "bot" sublabel is the one visible leak (01 §G3) |
| **spec** | ⚠️ contain | Power-user JSON editor only; never to normal users |

---

## 6. Recommendation summary

1. **Keep "brief"** for the delivered artifact. The digest debate is over; brief wins on every axis. _(no work — ratification)_
2. **Adopt "watch"** (or fallback "edition") for the standing configuration, resolving the three-way overload **before multi-brief GA**. Amend `COPY_GUIDE §4`; rename the `/briefs` surface + nav tab + "New brief". _(founder + UX-writer decision; then S–M implementation)_
3. **Add the code-vs-UI glossary** and fix "digest" in README/CLAUDE/docs prose; leave code identifiers alone. _(XS)_

Sequenced in doc 04.
