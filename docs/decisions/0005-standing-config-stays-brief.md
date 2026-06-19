# 0005 — Standing-config noun stays "brief" ("watch" rename REVERSED)

- Status: reversed (the proposed "watch" rename is rejected)
- Date: 2026-06-16 (locked "watch") → **reversed 2026-06-19**
- notion: D-005

## Context
"Brief" names both the standing configuration (the thing you manage/pause) and the delivered morning artifact (the billable unit). The 2026-06-11 design audit proposed renaming the standing config to **"watch"** to resolve the overload; it was briefly locked (D-005, rollout CAD-227).

## Decision
**REVERSED by the founder 2026-06-19.** "watch" is not adopted — it drags in an alert/monitoring mental model the copy guide bans, and "brief" works like "newsletter" (*my brief* = standing, *today's brief* = delivered, disambiguated by context). The collision is resolved by **counting copy**: the list counts in **briefs** ("3 active briefs"); billing counts in **credits** only; "1 credit = 1 brief" is the only sentence where the two meet. CAD-227 cancelled, PR #48 closed unmerged.

## Consequences
Do not use "watch" as the standing-config noun anywhere. ADR 0003 (artifact = "brief") is unaffected and still stands. Enforce the counting rule before multi-brief GA.
