#!/usr/bin/env bash
# G4 (slice 004-fix-deps): the lockfile diff against the branch base touches only the bumped
# packages and their dependents. Prints every package name outside the allowlist and exits 1
# if there is one. The allowlist and why each entry is there: notes.md, "Lockfile scope".
set -euo pipefail
base=$(git merge-base origin/main HEAD)
allowed='^(next|eslint-config-next|@next/[a-z0-9-]+|semver|@sentry/[a-z0-9-]+|@sentry-internal/[a-z0-9-]+|@opentelemetry/[a-z0-9-]+|inngest|@trpc/next|next-axiom)$'
names=$(git diff -U0 "$base" -- pnpm-lock.yaml \
  | grep -E '^[-+] ' \
  | grep -oE "^[-+] +'?(@[a-z0-9.-]+/)?[a-z0-9.-]+@[0-9]" \
  | sed -E "s/^[-+] +'?//; s/@[0-9]$//" \
  | sort -u)
[ -n "$names" ] || { echo "no package lines changed in pnpm-lock.yaml"; exit 1; }
outside=$(printf '%s\n' "$names" | grep -vE "$allowed" || true)
if [ -n "$outside" ]; then echo "outside the allowlist:"; printf '%s\n' "$outside"; exit 1; fi
echo "lockfile scope ok: $(printf '%s\n' "$names" | wc -l | tr -d ' ') package names, all allowlisted"
