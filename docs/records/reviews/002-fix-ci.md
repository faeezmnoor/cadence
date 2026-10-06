<!-- layer: records · status: record · verified: 2026-10-06 -->
# Review: 002-fix-ci (security and correctness lane)

Range: `main...HEAD` on `slice/002-fix-ci`. Independent reviewer; nothing in the slice was modified.

## Summary
- Every override pins at or above the first patched version, and `pnpm audit --prod --audit-level=high` exits 0 (0 critical, 0 high; 3 low and 11 moderate remain, below the CI threshold).
- Three overrides force a version outside a consumer's declared range (the consumers pin exact versions). Each has runtime evidence that it works; none is blocking.
- The test fix is correct and stronger than before.

## Findings (severity × confidence)
| # | Severity | Confidence | Finding |
|---|---|---|---|
| F1 | Low | High | `postcss@^8 → ^8.5.18` resolves 8.5.29 for `next`, which declares `postcss` as exactly `8.4.31`. Outside the declared range. Evidence it works: same major (8.x, semver-compatible minor); the local `pnpm build` compiles (notes, step 4); `postcss.parse` loads through next's own resolution. The builder's notes do not list this as a range crossing. |
| F2 | Low | High | `jsondiffpatch@<0.7.6 → ^0.7.6` resolves 0.7.6 for `ai` 4.3.19, which declares exactly `0.6.0`. Outside the declared range. Evidence: only `ai/rsc` imports it, the app does not import `ai/rsc`, and `diff` loads and returns a delta through `ai`'s resolution. |
| F3 | Low | Medium | `@opentelemetry/propagator-jaeger@^2 → ^2.9.0` resolves 2.11.0 for `@opentelemetry/sdk-node` 0.218.0, which declares exactly `2.7.1`. Outside the declared range. Evidence: through sdk-node's resolution, `JaegerPropagator` constructs and injects a valid `uber-trace-id`, and sdk-node's `utils.js` loads. It is only instantiated when `OTEL_PROPAGATORS` includes `jaeger`, which the app does not set. 2.11.0 brings `@opentelemetry/core` 2.11.0 alongside 2.7.1. |
| F4 | Low | Medium | Side effect in the lockfile: the auto-installed `@opentelemetry/core` peer for `@sentry/nextjs` and `inngest` moved from 2.7.1 to 2.11.0 (both versions were already in the lockfile). Typecheck and tests pass; Sentry and Inngest tracing were not exercised at runtime. |
| F5 | Info | High | The test picks the first file with the suffix (`.find`). If a second `*_digest_specs_searcher.sql` ever appears, it silently checks one of them. A `filter` with a length-one assertion would be stricter. Not blocking. |
| F6 | Info | High | The overrides are in `pnpm-workspace.yaml`, not `pnpm.overrides`, because pnpm 11 ignores the package.json field. The lockfile records the same overrides block, so CI with `--frozen-lockfile` applies them. |

## Override-by-override verdicts
| Override | Resolved | Consumers' declared ranges | Verdict |
|---|---|---|---|
| `fast-uri@^3 → ^3.1.8` | 3.1.8 | ajv `^3.0.1` | In range. Pass. |
| `brace-expansion@^5 → ^5.0.11` | 5.0.12 | minimatch 10 `^5.0.5`; the 1.x copy for minimatch 3 is untouched | In range. Pass. |
| `browserslist@^4 → ^4.28.7` | 4.29.3 | webpack `^4.28.1`, autoprefixer `^4.28.2`, babel targets `^4.24.0`, update-browserslist-db `>=4.21.0` | In range. Pass. |
| `postcss@^8 → ^8.5.18` | 8.5.29 | next `8.4.31` (exact); others `^8.x` / `>=8.0.9` | Outside next's range. Pass with evidence (F1). |
| `source-map-js@^1 → ^1.2.2` | 1.2.2 | postcss `^1.2.2`, magicast `^1.2.1` | In range. Pass. |
| `sharp@^0.34 → ^0.35.4` | 0.35.5 | next `^0.34.3 \|\| ^0.35.4` (optional) | In range despite the minor bump. Pass. Encoding a WebP through next's resolution works (libvips 8.18.7). It also re-enables AVIF optimisation, which 15.5.25 gates on newer sharp. |
| `nanoid@^3 → ^3.3.18` | 3.3.20 | provider-utils `^3.3.8`, postcss `^3.3.19` | In range. Pass. |
| `jsondiffpatch@<0.7.6 → ^0.7.6` | 0.7.6 | ai `0.6.0` (exact) | Outside the range. Pass with evidence (F2). |
| `@grpc/grpc-js@^1 → ^1.14.5` | 1.14.5 | OTLP gRPC exporters `^1.14.3` | In range. Pass. |
| `@opentelemetry/propagator-jaeger@^2 → ^2.9.0` | 2.11.0 | sdk-node `2.7.1` (exact) | Outside the range. Pass with evidence (F3). |

## Next.js 15.5.18 → 15.5.27 changelog (from the GitHub releases)
- 15.5.19: `FormData` entries are no longer dropped (a bug fix).
- 15.5.20: publishing only.
- 15.5.21: security fixes for Server Actions DoS and SSRF, a middleware bypass on Turbopack with a single locale, rewrite SSRF, an Image Optimization SVG DoS, and cache confusion. The app has `middleware.ts`, builds with webpack (no Turbopack) and has no `"use server"` files. No behaviour change is expected.
- 15.5.22: rejects TypeScript 7 or later. The repo uses 5.9.3.
- 15.5.23: Flight client traversal guards.
- 15.5.24: fixes for the two critical RCEs; AVIF optimisation is disabled with older sharp.
- 15.5.25: AVIF is re-enabled with newer sharp (0.35 here). The app does not use `next/image`.
- 15.5.26: `next/og` hardening. The app uses it in `app/opengraph-image.tsx`; worth one look on the preview.
- 15.5.27: metadata-image and SSG/ISR cache-poisoning fixes.
- No breaking changes are listed.

## Check results
- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm typecheck && pnpm lint && pnpm test`: exit 0. 130 test files passed and 4 skipped; 1224 tests passed and 25 skipped.
- `pnpm audit --prod --audit-level=high`: exit 0. 0 critical, 0 high.
- No audit ignore entries and no lowered level. The only audit invocation is in `.github/workflows/ci.yml` at `--audit-level=high`.
- Lockfile: no new direct dependencies. The importer changes are limited to `next` and `eslint-config-next` at 15.5.27 and the matching peer suffixes.
- Test fix: `0031_digest_specs_searcher.sql` and `apply-0031.mjs` exist. The old path `apply-0028.mjs` now belongs to an unrelated migration (grant idempotency), so the test now checks the correct runner. All assertions are unchanged.
- Public hygiene of `notes.md` and `brief.md`: no names, no absolute paths, no secret values.

## Not checked
- A production build with secrets (this waits on the Vercel preview).
- Runtime tracing through Sentry and Inngest after the OpenTelemetry changes.
- Rendering of `app/opengraph-image.tsx` on 15.5.27.

VERDICT: APPROVE
