---
status: accepted
date: 2026-11-13
decision-makers: the owner (ruling of 2026-11-13), the orchestrator
---
<!-- layer: knowledge · status: living · verified: 2026-11-13 · budget: 80 lines -->
# Temporary audit exception for the Zod advisory GHSA-mrhx-c7xc-m3w5

## Context and problem statement
- **What the advisory is.** On 2026-11-11 `pnpm audit --prod --audit-level=high` failed on main with four advisories:
  - Next.js remote code execution (critical);
  - Next.js denial of service (high);
  - Sentry middleware bypass through the tunnel route (critical);
  - Zod memory exhaustion, GHSA-mrhx-c7xc-m3w5 (high).
- **What slice 004-fix-deps fixed.** It bumped `next` to 15.5.28 and `@sentry/nextjs` to 10.75.2, which clears the first three, all within their current majors.
- **Why Zod has no patch in reach.** Zod is vulnerable below 4.6.6, and no 3.x release comes after 3.25.76.
  - Zod 3 has the same flaw: in 3.25.76, `ZodArray._parse` records a `.max()` breach and then still parses every element, so a large array of bad elements builds one issue object per element.
- **Who can reach it (corrected by the review of 2026-11-11; the first analysis was too optimistic).**
  - A caller who is not signed in cannot reach a Zod array check: the tRPC auth step runs before input validation, the public `getByShortId` takes a regex-checked string, the Telegram webhook and the Inngest route do not parse with Zod.
  - "Signed in" is a low bar: the sign-in route issues a magic link to any e-mail address, so anyone with an address can hold a session.
  - Not every array is bounded: `skipDates` and `weekdays` in apps/web/lib/scheduling/rule.ts (lines 42 and 56) have no `.max()`, and `briefs.preview` (a protected procedure) reaches them.
  - Measured by the reviewer on zod 3.25.76: a 4 MB body against a `.max(50)` array produced about two million issues and roughly 690 MB of heap in 0.7 s. One request from any account can exhaust a function instance.
  - Production already runs this Zod version, so the exception adds no exposure; it only stops the audit from blocking the remote-code-execution fix.
- **Why zod 4 is a larger move.** zod 3 is pulled in by:
  - the app's direct `zod ^3.23.8` dependency;
  - `ai` 4.x and `@ai-sdk/*` 1.x;
  - `inngest`.

  The AI SDK 4.x line is built against zod 3, so moving to zod 4 means moving to AI SDK 5 as well, which is a major upgrade of the brief pipeline.
- **Why an exception now.** The remote-code-execution fix must not wait behind this one.

## Considered options
- A. Move to zod 4 together with AI SDK 5 in a dedicated slice.
  - This removes the advisory.
  - It is a major upgrade of the pipeline and needs a move-or-hold eval number (decision 0012).
- B. Add a code guard on array size: reject an oversized array before Zod parses it, for example a length check in the tRPC input layer.
  - This closes the reachable path cheaply.
  - The audit still reports the advisory, so the exception stays alongside it.
- C. Keep the audit exception as it is.

## Decision outcome
- **B now, A later** (owner ruling, 2026-11-13).
- **B, built in slice 005-zod-guard.**
  - A request-size guard, `withBodyLimit` in apps/web/server/http/body-limit.ts, with one limit, `MAX_REQUEST_BODY_BYTES` = 1 MiB.
  - It sits in front of the two HTTP entry points that hand caller input to Zod: `/api/trpc/[trpc]` (every `.input()`) and `/api/chat` (the AI SDK checks the message array with Zod).
  - It counts the bytes it reads and stops at the limit, so a request with no `Content-Length`, or a lying one, is bounded too; over the limit it answers 413 before any parser runs.
  - `weekdays` (daily and weekly) are capped at 7 and `skipDates` at 366 in apps/web/lib/scheduling/rule.ts.
- **What B bounds.** The heap one request can make Zod build. Measured on zod 3.25.76 with the worst array (`[0,0,…]`): about 180 MB at 1 MiB, against 643 MB at 4 MiB.
- **What B does not bound.**
  - Up to about 180 MB per request is still possible under the limit; several such requests at once on one instance add up.
  - `.max()` does not cut the work on zod 3: every element is still parsed after a breach.
  - Entry points that do not parse with Zod are not guarded: the Telegram webhook (secret header), the Inngest route (signature checked before its own Zod parse), sign-in, and GET query strings (bounded by the platform's URL limit).
- **The exception stays.** `pnpm audit --prod` still reports the package, so `auditConfig.ignoreGhsas` in pnpm-workspace.yaml keeps exactly this id.
- **Review: when the zod 4 with AI SDK 5 slice lands** (option A, on the roadmap; it needs a move-or-hold eval number, decision 0012). That slice removes the exception and supersedes this record.

## Consequences
- **What the CI audit gate still catches.** It passes at `--audit-level=high` and still fails on any other high or critical advisory.
- **What it does not catch.** It no longer fails on this Zod advisory. The exception stays visible: `pnpm audit --prod` lists the advisory as ignored.
- **Where this is tracked.** Option A: docs/roadmap.md. Slice notes: docs/slices/004-fix-deps/notes.md and docs/slices/005-zod-guard/notes.md. Owner queue item OQ-11 closed on 2026-11-13.
