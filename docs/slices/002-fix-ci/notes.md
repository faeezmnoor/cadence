<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 -->
# 002-fix-ci: security patch notes

## Starting point
- `pnpm audit --prod --audit-level=high` on the branch before changes: 2 critical, 27 high (29 advisories across 11 packages), exit 1. **verified**
- pnpm 11.2.2, Node 26 locally. **verified**

## Step 1: Next.js to the latest 15.5.x
- `next` and `eslint-config-next` 15.5.18 → 15.5.27 (latest 15.5.x on npm on 2026-10-06). No `@next/*` package is a direct dependency; `@next/env` and `@next/eslint-plugin-next` follow at 15.5.27 through the lockfile. **verified**
- Verification: `pnpm typecheck && pnpm lint && pnpm test` exit 0 (130 files passed, 4 skipped; 1224 tests passed, 25 skipped). Audit afterwards: 0 critical, 24 high. **verified**

| Advisory | Severity | Package | Before | After |
|---|---|---|---|---|
| GHSA-p293-qw3h-jr36 | critical | next | 15.5.18 | 15.5.27 |
| GHSA-2xp9-vwfh-vxw4 | critical | next | 15.5.18 | 15.5.27 |
| GHSA-m99w-x7hq-7vfj | high | next | 15.5.18 | 15.5.27 |
| GHSA-89xv-2m56-2m9x | high | next | 15.5.18 | 15.5.27 |
| GHSA-p9j2-gv94-2wf4 | high | next | 15.5.18 | 15.5.27 |

## Step 2: overrides for the transitive packages
### Where the overrides live
- The ruling named `pnpm.overrides` in the root package.json. pnpm 11 prints "The "pnpm" field in package.json is no longer read by pnpm" and ignores it, so the overrides are in `pnpm-workspace.yaml` under `overrides:`. **verified**
- Selectors are scoped to the vulnerable major (for example `brace-expansion@^5`), so the 1.x copy of brace-expansion elsewhere in the tree is untouched. **verified**
- Ranges are caret ranges from the first patched version, so pnpm resolves the newest release within that major. **verified**

### Why not direct-dependency updates
- No patch-level direct-dependency update fixes these. `ai` 4.3.19 is the latest 4.x and pins `jsondiffpatch` 0.6.0; `next` 15.5.27 pins `postcss` 8.4.31 exactly; the remaining paths come through `@sentry/nextjs` and `inngest`, whose newer releases are minor bumps (10.55 → 10.76, 4.x minors), outside "patch-level". **verified** (versions from npm)
- Whether a minor bump of `@sentry/nextjs` or `inngest` alone would have cleared them was not tested. **inferred**

### Group A: build toolchain (commit "override vulnerable build-toolchain transitives")
| Advisory | Package | Before | Override | Resolved |
|---|---|---|---|---|
| GHSA-4c8g-83qw-93j6, GHSA-v2hh-gcrm-f6hx, GHSA-7p8r-x3mc-p8w7, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp, GHSA-qw65-cvwx-89v3 | fast-uri | 3.1.2 | ^3.1.8 (ruling) | 3.1.8 |
| GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7 | brace-expansion (5.x) | 5.0.6 | ^5.0.11 | 5.0.12 |
| GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g | browserslist | 4.28.2 | ^4.28.7 | 4.29.3 |
| GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 | postcss | 8.4.31, 8.5.15 | ^8.5.18 | 8.5.29 |
| GHSA-68fv-2mgg-jv7q | source-map-js | 1.2.1 | ^1.2.2 | 1.2.2 |
| GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c | sharp | 0.34.5 | ^0.35.4 | 0.35.5 |

- `sharp` 0.35 is inside `next` 15.5.27's own optional range (`^0.34.3 || ^0.35.4`). **verified**
- Verification: `pnpm typecheck && pnpm lint && pnpm test` exit 0 (same counts as step 1). **verified**

### Group B: runtime (commit "override vulnerable runtime transitives")
| Advisory | Package | Before | Override | Resolved |
|---|---|---|---|---|
| GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8 | nanoid (3.x) | 3.3.12 | ^3.3.18 | 3.3.20 |
| GHSA-j4fx-xxwh-2485 | jsondiffpatch | 0.6.0 | ^0.7.6 | 0.7.6 |
| GHSA-m9gg-hp2v-232j | @grpc/grpc-js | 1.14.4 | ^1.14.5 | 1.14.5 |
| GHSA-45rx-2jwx-cxfr | @opentelemetry/propagator-jaeger | 2.7.1 | ^2.9.0 | 2.11.0 |

- `jsondiffpatch` crosses 0.6 → 0.7 (ESM-only). Only `ai/rsc` imports it, as an ESM namespace import of `diff`, which 0.7.6 still exports; the app does not import `ai/rsc`. `require('ai')` and `import('ai')` both load. **verified**
- `propagator-jaeger` 2.11.0 sits beside `@opentelemetry/sdk-node` 2.7.x inside `inngest`'s tree; tests pass, but runtime tracing through Inngest was not exercised. **inferred**
- Verification: `pnpm typecheck && pnpm lint && pnpm test` exit 0 (same counts). **verified**

## Step 3: audit
- `pnpm audit --prod --audit-level=high` exits 0: 0 critical, 0 high (3 low, 11 moderate remain, below the CI threshold). **verified**
- Every high and critical advisory had a patched version; none is unfixed. **verified**
- The audit level was not lowered and no ignore entries were added. **verified**

## Step 4: build
- `pnpm build` locally compiles and passes Next's type check, then stops at page-data collection because production secrets are absent (`DATABASE_URL`, then `INNGEST_SIGNING_KEY`). The app guards these on purpose. **verified**
- The Vercel preview on the PR, which has the secrets, is the build evidence. **inferred** until that preview is green.
