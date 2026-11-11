---
status: proposed
date: 2026-11-11
decision-makers: the orchestrator, pending the owner
waits-on: the owner's choice between moving to zod 4 with AI SDK 5, a code guard on array size, or keeping the exception
---
<!-- layer: knowledge · status: living · verified: 2026-11-11 · budget: 80 lines -->
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
- **Who can reach it.**
  - Every array in a user-facing schema has a `.max()`, but as above that does not stop the per-element work.
  - The tRPC procedures that take arrays (`listVersionBriefs` in the digestSpec and briefs routers) are `protectedProcedure`, so only a signed-in user can reach them.
  - The hosting platform caps a request body at a few megabytes, which limits the size of one request.
  - So a signed-in user could inflate one function's memory per request; a visitor who is not signed in could not. This is inferred from the code, not measured.
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
- **Proposed, for now: a temporary exception.** It covers exactly one id, GHSA-mrhx-c7xc-m3w5, under `auditConfig.ignoreGhsas` in pnpm-workspace.yaml. pnpm 11 ignores the `pnpm` key in package.json.
- **Review date: 2026-12-11.** By then the owner chooses A, B or C, and this record becomes accepted or superseded.

## Consequences
- **What the CI audit gate still catches.** It passes at `--audit-level=high` and still fails on any other high or critical advisory.
- **What it does not catch.** It no longer fails on this Zod advisory. The exception stays visible: `pnpm audit --prod` lists the advisory as ignored.
- **Where this is tracked.** Owner queue item OQ-11. Slice notes: docs/slices/004-fix-deps/notes.md.
