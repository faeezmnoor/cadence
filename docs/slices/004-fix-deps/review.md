<!-- layer: records · status: record · verified: 2026-11-11 -->
# 004 · fix-deps — review

VERDICT: APPROVE — the Next.js and Sentry fixes are correct, minimal and verified; the Zod exception adds no new exposure; decision 0013's reach analysis was corrected before the owner rules.

- Lane: security and correctness (independent reviewer, did not build). First patched versions inside the current majors; one version of each package in the lockfile; no override pins an older copy; frozen install, typecheck, lint and tests exit 0 (1224 passed); audit exits 0 with exactly one ignored id.
- Planted defects: five caught (ignore line removed, wrong id, next reverted, unrelated lockfile change, scrubber disabled); two survived and are recorded as follow-ups: the lockfile scope check accepts any change under two allowed package scopes; nothing enforces "exactly one ignored id".
- Finding P2 (fixed in this slice): the reach analysis understated who can trigger the Zod advisory; corrected in decision 0013 with the reviewer's measurement. Recommended order for the owner's choice: a request-size guard first.
- Challenger: STOP while the branch was unpushed; conditions then met on the exact head: CI green, Vercel preview built with real environment and answered 200 on /, /api/health and /pricing; exception labelled as the orchestrator's in the pull request. Post-deploy: curl production /, /pricing and /api/health; rollback is a Vercel promotion of the previous deployment (owner's dashboard).
