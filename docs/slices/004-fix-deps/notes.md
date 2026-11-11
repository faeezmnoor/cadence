<!-- layer: knowledge · status: living (while open) · verified: 2026-11-11 -->
# 004 · fix-deps — notes

## Starting point
- `pnpm audit --prod` at the branch base (64f2d04): 2 critical, 2 high, 15 moderate, 5 low; exit 1. **verified**
- pnpm 11.2.2. CI (.github/workflows/ci.yml) runs install, typecheck, lint, test and audit; it does not run `pnpm build`, so there are no CI build placeholders to copy. **verified**

## Advisories (high and critical)
| Advisory | Severity | Package | From | To | How | Status |
|---|---|---|---|---|---|---|
| GHSA-2464-fhr4-w9xw | critical | next | 15.5.27 | 15.5.28 | direct bump | fixed |
| GHSA-p3m5-59mp-jv5r | high | next | 15.5.27 | 15.5.28 | direct bump | fixed |
| GHSA-mchm-gjx6-7h55 | critical | @sentry/nextjs | 10.55.0 | 10.75.2 | direct bump (`^10.75.2`) | fixed |
| GHSA-mrhx-c7xc-m3w5 | high | zod | 3.25.76 | none in 3.x | none | **HARD STOP: needs a major** |

## Builder decisions
- `next` and `eslint-config-next` moved together from 15.5.27 to 15.5.28, the first patched 15.5.x (15.5.29 also exists; the smallest change was taken). `@next/*` follow through the lockfile. **verified**
- `@sentry/nextjs` spec `^10.75.2`, locked at 10.75.2, the first patched 10.x. A plain `pnpm install` after a caret edit resolved 10.78.0, and `pnpm --filter web update` re-resolved unrelated packages (vitest, rollup, lightningcss); both were discarded. The lock was taken at 10.75.2 through an exact spec, then the spec was put back to a caret, which `pnpm install` kept at 10.75.2. **verified**
- No override was added: all three fixes are direct dependencies. **verified**
- `pnpm build` needs `DATABASE_URL`, `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` to collect page data (the same stop slice 002 recorded). With non-secret placeholders (in G3; the database URL points at a closed local port and holds no credentials) the build exits 0, 22 static pages. **verified**

## Release notes read
- next 15.5.28: the release holds only the two security fixes above. **verified** (GitHub release v15.5.28)
- @sentry/nextjs 10.56.0 to 10.75.2 (CHANGELOG): what touches a Next.js app is 10.75.2 (tunnel request matching in the middleware), 10.73.0 (`withSentryConfig` gains a `/config` entry point; the old import logs a warning), 10.70.0 (tracing removed from the middleware wrappers), 10.57.0 (`sendDefaultPii` deprecated). This app uses none of `withSentryConfig`, `tunnelRoute` or `sendDefaultPii` (grep of next.config.mjs, sentry.*.config.ts, instrumentation.ts, middleware.ts, app, lib, server), so none of these changes its behaviour. **verified** by grep; runtime Sentry capture was not exercised. **inferred**
- It follows that GHSA-mchm-gjx6-7h55 (middleware bypass through the tunnel route) did not reach this app: there is no tunnel route. It is fixed anyway. **verified** by grep
- Server actions and zod schemas: no change from either bump. **verified** (typecheck, lint and tests pass)

## Zod: GHSA-mrhx-c7xc-m3w5 (not fixed: hard stop)
- Vulnerable `< 4.6.6`; first patched 4.6.6. There is no 3.x release after 3.25.76, so a fix within the current major does not exist. **verified** (npm versions, GitHub advisory)
- Zod 3 has the same flaw. In zod 3.25.76 `ZodArray._parse` records a `.max()` breach as an issue and then still parses every element. **verified** (node_modules/zod/v3/types.js)
- Paths: the direct `zod ^3.23.8` and the copies under `ai` 4.x, `@ai-sdk/*` 1.x and `inngest`. These peer on zod 3, so moving to zod 4 means a major upgrade of the AI SDK as well. **verified** (audit paths); the cascade is **inferred**
- How far it reaches: every array in a user-facing schema has a `.max()`. The two tRPC array inputs (`listVersionBriefs` in digestSpec.ts and briefs.ts) are `protectedProcedure`, so only a signed-in user can reach them. The request body size is capped by the platform. Result: a signed-in user could inflate memory for each request, but could not do it without signing in. **inferred**
- Owner options: (a) a later slice moves to zod 4 together with AI SDK 5; (b) add a recorded audit exception for this one id, which needs an owner ruling because it relaxes the CI gate; (c) a code guard that rejects oversized arrays before zod parses them. This is a code change and out of this brief's scope.

## Lockfile scope
`pnpm-lock.yaml` changes only these package names (G4, docs/slices/004-fix-deps/lockfile-scope.sh):
- next, eslint-config-next, @next/* (the bump). semver 7.8.5 loses its `optional` flag: next 15.5.28 now requires it.
- @sentry/*, @sentry-internal/* (the bump), and @opentelemetry/* (Sentry 10.75.2's OpenTelemetry dependencies: api-logs, instrumentation, core, resources, sdk-trace, sdk-trace-base).
- inngest, @trpc/next, next-axiom, @sentry/nextjs: snapshot keys only. Their peer suffixes name the new next or Sentry version; their own versions are unchanged.
- Planted defect: a change to an unrelated package (`clsx`) made the script print `clsx` and exit 1. The lockfile was then restored. **verified**

## Gates outside this slice's reach
- G1 (audit) stays unmet while the zod advisory is open.
- G5 (standard-check) fails on T3: STATE.md was verified on 2026-10-06, more than 14 days ago. This is already true on main, and STATE.md is not a file this brief names.
- G7 waits for the reviewer.
