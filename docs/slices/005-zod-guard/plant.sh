#!/usr/bin/env bash
# Slice 005 gate G4: plant each defect the new guards guard against, run the
# matching test, require it to FAIL, then restore the file from git.
# Prints "all planted defects caught" only when every plant was caught.
set -u
ROOT="$(git rev-parse --show-toplevel)"
WEB="$ROOT/apps/web"
caught=0
total=0

restore() { git -C "$ROOT" checkout -- "$1"; }

plant() { # name, file (repo-relative), perl substitution, test file
  local name="$1" file="$2" subst="$3" test="$4"
  total=$((total + 1))
  perl -0pi -e "$subst" "$ROOT/$file"
  if git -C "$ROOT" diff --quiet -- "$file"; then
    echo "PLANT DID NOT APPLY: $name"
    return
  fi
  if (cd "$WEB" && npx vitest run "$test" >/dev/null 2>&1); then
    echo "NOT CAUGHT: $name"
  else
    echo "caught: $name"
    caught=$((caught + 1))
  fi
  restore "$file"
}

trap 'git -C "$ROOT" checkout -- apps/web/server/http/body-limit.ts "apps/web/app/api/trpc/[trpc]/route.ts" apps/web/app/api/chat/route.ts apps/web/lib/scheduling/rule.ts' EXIT

plant "guard trusts Content-Length only (no running count)" \
  apps/web/server/http/body-limit.ts \
  's/if \(total > limit\) \{/if (false) {/' \
  test/body-limit.test.ts

plant "tRPC route not wrapped" \
  "apps/web/app/api/trpc/[trpc]/route.ts" \
  's/const handler = withBodyLimit\(/const handler = ((h) => h)(/' \
  test/body-limit-routes.test.ts

plant "chat route not wrapped" \
  apps/web/app/api/chat/route.ts \
  's/export const POST = withBodyLimit\(handleChatTurn\);/export const POST = handleChatTurn;/' \
  test/body-limit-routes.test.ts

plant "weekly weekdays .max removed" \
  apps/web/lib/scheduling/rule.ts \
  's/\.min\(1\)\.max\(MAX_WEEKDAYS\)/.min(1)/' \
  test/scheduling-rule-bounds.test.ts

plant "daily weekdays .max removed" \
  apps/web/lib/scheduling/rule.ts \
  's/\n\s*\.max\(MAX_WEEKDAYS\)\n/\n/' \
  test/scheduling-rule-bounds.test.ts

plant "skipDates .max removed" \
  apps/web/lib/scheduling/rule.ts \
  's/\.max\(MAX_SKIP_DATES\)//' \
  test/scheduling-rule-bounds.test.ts

echo "$caught of $total planted defects caught"
if [ "$caught" -eq "$total" ]; then
  echo "all planted defects caught"
  exit 0
fi
exit 1
