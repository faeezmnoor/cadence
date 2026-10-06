---
status: accepted
date: 2026-06-16
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Standing-config noun stays "brief" ("watch" rename REVERSED)

Former id: D-005 (retired Notion log). Original status line: reversed (the proposed "watch" rename is rejected). Original date line: 2026-06-16 (locked "watch") → **reversed 2026-06-19**.

## Context and problem statement
"Brief" names both the standing configuration (the thing you manage/pause) and the delivered morning artifact (the billable unit). The 2026-06-11 design audit proposed renaming the standing config to **"watch"** to resolve the overload; it was briefly locked (D-005, rollout CAD-227).

## Considered options
- A. Rename the standing config to "watch" (briefly locked, then reversed).
- B. Keep "brief" for both and resolve the overload by counting copy (chosen).

## Decision outcome
**REVERSED by the founder 2026-06-19.** "watch" is not adopted — it drags in an alert/monitoring mental model the copy guide bans, and "brief" works like "newsletter" (*my brief* = standing, *today's brief* = delivered, disambiguated by context). The collision is resolved by **counting copy**: the list counts in **briefs** ("3 active briefs"); billing counts in **credits** only; "1 credit = 1 brief" is the only sentence where the two meet. CAD-227 cancelled, PR #48 closed unmerged.

## Consequences
Do not use "watch" as the standing-config noun anywhere. ADR 0003 (artifact = "brief") is unaffected and still stands. Enforce the counting rule before multi-brief GA.
