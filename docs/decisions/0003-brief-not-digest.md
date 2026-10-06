---
status: accepted
date: 2026-06-11
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# "Brief", not "digest", for the user-facing artifact

Former id: D-003 (retired Notion log). Original status line: accepted. Original date line: 2026-06-11 (re-ratified).

## Context and problem statement
Code uses `digest_*` identifiers. Surfacing "digest" to users is jargon and clashes with the value-prop framing.

## Considered options
- A. Surface "digest" to users.
- B. "Brief" in all user-facing copy; `digest_*` stays in code (chosen).

## Decision outcome
The delivered artifact is **"a brief"** in all user-facing copy. `digest_*` stays code-internal only — no DB rename. (Extended by ADR 0005: "brief" also names the standing config; the "watch" rename was rejected.)

## Consequences
COPY_GUIDE enforces "brief" everywhere user-facing; `digest_*` identifiers are never surfaced.
