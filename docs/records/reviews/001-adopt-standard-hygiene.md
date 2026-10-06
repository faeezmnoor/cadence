<!-- layer: records · status: record · verified: 2026-10-06 -->
# 001 · adopt-standard — review, hygiene lane

Independent review of slice 001-adopt-standard (range `main...HEAD` on `slice/001-adopt-standard`) for secrets, privacy and public hygiene. The repository is public (ruling OQ-8). Values below are masked: the first four characters, then "…". Nothing was fixed; one review file was added.

## Verdict summary
- No live secret value exists anywhere in the working tree, and the branch's history adds none.
- The documentation layer the slice owns (root documents, docs/, .claude/, .github/) is clean: gates G4, G5 and G6 pass, the lint passes, the archive is redacted consistently, and the owner queue meets ruling OQ-5.
- The working tree still carries the owner's personal e-mail, the owner's Telegram chat id, the owner's name and one home path, outside the folders the gates scan. One of those files (apps/web/README.md) was edited by this slice and kept the e-mail. Under this lane's rule (block on any unredacted e-mail, chat id or owner name in the working tree) the verdict is BLOCK.

## 1. Secret scan (HEAD tree, excluding pnpm-lock.yaml and the vendored lint bundle)
Patterns: 40+ hex runs, `sk_`/`rk_`, `whsec_`, `gh[pousr]_`, `xox?-`, Telegram bot tokens, `sk-ant`/`sk-proj`, connection strings with credentials, JWTs, AWS and Google keys, long base64, e-mail addresses, chat ids, phone numbers.

| Type | Hits | Where | Assessment |
| --- | --- | --- | --- |
| Long hex (40+) | 0 | — | Clean, including docs/_archive/ and docs/records/ |
| Stripe-shaped key | 2 | apps/web/test/digest-retry.test.ts:45–46 (`sk_l…`) | Fabricated fixture for the error sanitiser; not a secret |
| Connection string | 2 | .env.example:5–6 (`post…`) | Placeholders (`[password]`, `[project]`); not a secret |
| Webhook secret, bot token, GitHub/Slack/AWS/Google/Anthropic key, JWT | 0 | — | Clean |
| Owner personal e-mail (`faee…`) | 12 | apps/web/README.md:157; apps/web/scripts/seed-smoke-spec.mjs:7, 40; apps/web/scripts/verify-smoke-spec.mjs:19; apps/web/server/auth/admin.ts:9; apps/web/test/admin-grant-credits.test.ts:136, 156; apps/web/test/smoke-summary.test.ts:70, 184, 206, 217, 239 | Pre-existing on main. README.md:157 is documentation the slice touched (T023 edited lines 13–14, 102, 123, 360–362) and left unredacted. The rest are code, tests and a script default |
| Owner-identifying e-mail on the product domain (`faee…`) | 1 | apps/web/server/support/contact.ts:10–11 | Code comment quoting a retired address; pre-existing |
| Owner Telegram chat id (`2764…`) | 6 | apps/web/scripts/seed-smoke-spec.mjs:10, 41; apps/web/test/smoke-summary.test.ts:72, 186, 219; apps/web/test/wave5-archived-spec-isolation.test.ts:17 | Pre-existing on main. The slice redacted the same id from docs/runbooks/SMOKE.md, which shows it is treated as personal data; these copies remain |
| Phone numbers | 2 | apps/web/server/channels/whatsapp/index.ts:30; a stub-adapter test | Example numbers (`+601…`), not personal |
| Other e-mails | — | `@example.com`, `@cadence.news` role addresses, `noreply@` | Fixtures or product role addresses; acceptable |

Branch history (`git log -p main..HEAD`): no added line carries a secret, e-mail, chat id, name or home path; the only added match is the vendored lint's own H1 message text. The webhook secret, bot handle, Linear team id and home paths appear only as removed lines (the old HANDOVER.md and agent files), so they live in main's history, not in anything this branch introduces. A squash merge adds nothing new; rotation (owner queue OQ-01) remains the only remedy for the exposed webhook secret, as ruling OQ-3 says.

Commit metadata: three branch commits (f474ecc, cda8a5a, 2a2d034) carry the owner's personal e-mail as author address; main already has 178 such commits. Informational: a squash merge records the merger's identity instead.

## 2. Names and paths
`git grep -niE` for the owner's first name and home-path prefixes over HEAD:
- Root documents, docs/ (archive and records included), .claude/, .github/: zero hits. G4 and G5 pass.
- Documentation outside the gates' scope, all pre-existing on main:
  - apps/web/README.md:157 — the owner's e-mail (see above).
  - proposals/brief-manage-mode-plan.md:4 — an absolute home path containing the owner's username (`/Use…`). The builder's notes call this file frozen; ruling OQ-3 asked for redaction of home paths everywhere.
  - services/prices/README.md:6 — the owner's first name.
- Code and tests: the owner's first name in about 45 comments, SQL migration comments, test titles and fixtures across apps/web (for example apps/web/server/billing/packs.ts:16, apps/web/server/db/migrations/0013_trial_grant_on_signup.sql:3, apps/web/test/billing-packs.test.ts:45). Applied migrations cannot be edited; the rest needs a code slice.
- Public product copy: apps/web/app/(marketing)/privacy/page.tsx:24 and apps/web/server/email/refund-template.ts:42 use the owner's first name on purpose (founder-voiced privacy page, signed refund e-mail). This is an owner decision, not a leak; flagged so it is made consciously.
- False positive: apps/web/server/trpc/routers/account.ts:70 (`/admin/users/` matches the case-insensitive path pattern).

## 3. Owner queue (docs/OWNER-QUEUE.md)
- No URLs (links are repository-relative), no names; wording is generic; Linear ids only.
- OQ-01 (rotate the Telegram webhook secret) and OQ-02 (set the `DATABASE_URL` Actions secret) are present and first.
- Minor: OQ-02's "Decision page" points at apps/web/README.md, which is the file still holding the owner's e-mail.

## 4. Archive and records indexes
- Every archived file whose original carried a name, e-mail, secret or home path has "redacted for publication" in its docs/_archive/index.md row; files with nothing to redact do not claim it. The two moved records with the owner's name (platform audit, eval-harness plan) say the same in docs/records/index.md.
- Placeholders are consistent in the archive: `[redacted]` for the e-mail, bot handle, webhook secret, project ref, Linear team id and workspace slug; `<old-workspace>/` for the old machine paths; "the owner" for the name. A residual 32+-character hex or base64 search of docs/ and .claude/ finds only path strings.
- Cosmetic: mechanical substitution leaves "the owner" lowercase at sentence starts and "the owner dogfood" / "the owner KYC" (docs/_archive/2026-10/HANDOVER.md lines 92, 252, 255). Live docs/runbooks/SMOKE.md uses `<owner e-mail>` (a command placeholder) rather than `[redacted]`; acceptable because the reader must type a value there.

## 5. README.md
One path-only line changed (docs/ contents). No owner name, no queue text, no decision-page links; the only URLs are the live product and localhost.

## 6. .claude/settings.json and .claude/rules
settings.json is a permissions allow-list of git read commands, pnpm checks, vitest and the lint; no hooks, no `.env` reads, no tokens. The rule files, two kept agents and the cadence-eval skill mention secrets only as review topics; nothing reads an environment file or embeds a value.

## 7. Gates and lint (run 2026-10-06 on HEAD 2ee14ca)
| Check | Result |
| --- | --- |
| G4 home paths | exit 0 |
| G5 owner name | exit 0 |
| G6 64-hex | exit 0 |
| `bun .standard/standard-check.mjs .` | exit 0 (0 FAIL, 1 WARN: LICENSE missing, an owner decision already reported by the builder) |

### Planted defects (saved copies restored; `git status` clean afterwards)
| Plant | G4 | G5 | G6 | Lint | Outcome |
| --- | --- | --- | --- | --- | --- |
| An e-mail address appended to docs/runbooks/DEPLOY.md | pass | pass | pass | pass | Survived every check |
| A 64-character hex token appended to a decision record (0012) | pass | pass | fail | pass | Caught by G6 only |

Findings from the plants:
- No gate and no lint rule detects an e-mail address. G5 catches the owner's e-mail only because it contains the first name; any other personal address, or a chat id, passes. Recommend an e-mail gate (allow-list `example.com`, `example.test` and the product's role addresses) and a chat-id check for the documentation layer.
- The lint's hygiene rules do not include a secret-shape check; the 64-hex plant passed the lint. Only G6, which lives in this slice's ledger, protects against a pasted secret, and it ends when the slice closes. Finding for the standard repository: move a secret-shape rule into the lint so CI keeps it.
- G4–G6 scan only root documents, docs/, .claude/ and .github/. apps/web/README.md, proposals/ and services/prices/README.md are documentation outside that scope, which is why their hits went unnoticed.

## Required before merge (this lane)
1. Redact the owner's e-mail in apps/web/README.md:157 (a file this slice already edits; documentation only).
2. Redact the home path in proposals/brief-manage-mode-plan.md:4 and the name in services/prices/README.md:6, or record an orchestrator ruling that these pre-existing documentation files are out of scope for slice 001.
3. Record an owner ruling or a follow-up code slice (Linear issue) for the e-mail, chat id and name in code, scripts and tests; the script defaults should read only from environment variables.

## Not checked
- Binary files, images and pnpm-lock.yaml contents.
- Vercel, GitHub Actions and Supabase settings, and whether the exposed webhook secret is still active.
- Full history of main before this branch (only the branch range and removed lines were examined).


## Round 2 (2026-10-06, head 518fddd)
Re-run after fix round 1 (13f01a1 redaction, fdf56ee widened gates and the new e-mail gate G18, 518fddd STATE and owner queue).

### Scans over every tracked Markdown file, .github/ and .claude/
| Type | Hits | Assessment |
| --- | --- | --- |
| E-mail addresses | 2, both `admi…@example.com` | Example values; clean |
| Owner chat id, Linear team id, bot handle | 0 | Clean |
| Owner name, home paths | 0 real; 1 false positive (this record's own mention of `/admin/users/`) | Clean |
| Secret shapes (hex 40+, `sk_`, `whsec_`, tokens, keys, JWTs, credentialed connection strings) | 0 real; truncated placeholders `sk_l…` and `whs…` in docs/runbooks/stripe-skus-v2.md:104–105 and this record's own pattern list | Clean |

### Required items from round 1
1. apps/web/README.md:157 now uses an `@example.com` address. Done.
2. services/prices/README.md:6 says "the owner"; proposals/brief-manage-mode-plan.md:4 uses `<old-workspace>/`. Done.
3. Code values: no script, test or code file changed since round 1 (every file changed after fb89a07 is Markdown). Against main, the branch's only non-Markdown changes are the three comment-only path edits from T023. docs/OWNER-QUEUE.md has OQ-10, which asks the owner to decide whether the contact values in code move to configuration. The wording is generic, with no URLs and no names, and it links to this record. Done as a queued owner decision.

### Gates and lint as now written
G4, G5, G6 and G18 exit 0; `bun .standard/standard-check.mjs .` exits 0 (0 FAIL, 1 WARN: LICENSE). G18 closes the e-mail gap the round-1 plant exposed, and G4–G6 now reach every tracked Markdown file, including the three that were missed before.

### Residual, accepted under OQ-10
These values are still in code and tests and were there before this branch: the owner's e-mail (`faee…`, 11 occurrences), the owner's chat id (`2764…`, 6 occurrences) and the owner's first name in 41 non-Markdown files. These files are outside a documentation slice, and OQ-10 holds the decision on them. The lint still has no secret-shape or e-mail rule; once this slice closes, CI will not run G6 or G18. That gap is a finding for the standard repository.

VERDICT: APPROVE — documents, archive, records and agent files are clean of secrets, e-mails, chat ids, names and home paths; the remaining pre-existing contact values in code are queued for the owner as OQ-10.
