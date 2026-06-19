# 0003 — "Brief", not "digest", for the user-facing artifact

- Status: accepted
- Date: 2026-06-11 (re-ratified)
- notion: D-003

## Context
Code uses `digest_*` identifiers. Surfacing "digest" to users is jargon and clashes with the value-prop framing.

## Decision
The delivered artifact is **"a brief"** in all user-facing copy. `digest_*` stays code-internal only — no DB rename. (Extended by ADR 0005: "brief" also names the standing config; the "watch" rename was rejected.)

## Consequences
COPY_GUIDE enforces "brief" everywhere user-facing; `digest_*` identifiers are never surfaced.
