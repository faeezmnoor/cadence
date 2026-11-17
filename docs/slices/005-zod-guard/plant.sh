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

trap 'git -C "$ROOT" checkout -- apps/web/server/http/body-limit.ts "apps/web/app/api/trpc/[trpc]/route.ts" apps/web/app/api/chat/route.ts apps/web/lib/scheduling/rule.ts apps/web/server/chat/message-shape.ts apps/web/server/trpc/error-format.ts apps/web/components/chat/chat-client.tsx' EXIT

plant "guard trusts Content-Length only (no running count)" \
  apps/web/server/http/body-limit.ts \
  's/if \(total > limit\) \{/if (false) {/' \
  test/body-limit.test.ts

plant "tRPC route not wrapped" \
  "apps/web/app/api/trpc/[trpc]/route.ts" \
  's/const handler = withBodyLimit\(/const handler = ((h, _l) => h)(/' \
  test/body-limit-routes.test.ts

plant "chat route not wrapped" \
  apps/web/app/api/chat/route.ts \
  's/export const POST = withBodyLimit\(handleChatTurn, CHAT_BODY_LIMIT_BYTES\);/export const POST = handleChatTurn;/' \
  test/body-limit-routes.test.ts

# Review survivors R4, R5, R7, R10 (docs/records/reviews/005-zod-guard-security.md).
plant "R4: rebuilt request drops the abort signal" \
  apps/web/server/http/body-limit.ts \
  's/return handler\(new Request\(request, \{ body: read\.body \}\)\);/return handler(new Request(request.url, { method: request.method, headers: request.headers, body: read.body }));/' \
  test/body-limit.test.ts

plant "R5: tRPC limit raised to 4 MiB" \
  apps/web/server/http/body-limit.ts \
  's/export const TRPC_BODY_LIMIT_BYTES = 384 \* 1024;/export const TRPC_BODY_LIMIT_BYTES = 4 * 1024 * 1024;/' \
  test/body-limit.test.ts

plant "R5: chat limit raised to 4 MiB" \
  apps/web/server/http/body-limit.ts \
  's/export const CHAT_BODY_LIMIT_BYTES = 1024 \* 1024;/export const CHAT_BODY_LIMIT_BYTES = 4 * 1024 * 1024;/' \
  test/body-limit.test.ts

plant "R5: tRPC route given a 4 MiB limit" \
  "apps/web/app/api/trpc/[trpc]/route.ts" \
  's/\n  TRPC_BODY_LIMIT_BYTES\n\);/\n  4 * 1024 * 1024\n);/' \
  test/body-limit-routes.test.ts

plant "R7: guard skipped when Transfer-Encoding is present" \
  apps/web/server/http/body-limit.ts \
  's/if \(request\.body === null\) return handler\(request\);/if (request.body === null || request.headers.has("transfer-encoding")) return handler(request);/' \
  test/body-limit.test.ts

plant "R10: stream error swallowed, partial body handed on" \
  apps/web/server/http/body-limit.ts \
  's/return \{ ok: false, reason: "read_failed", error \};/break;/' \
  test/body-limit.test.ts

plant "F3: stream error answered 413 instead of the route's 400" \
  apps/web/server/http/body-limit.ts \
  's/if \(read\.reason === "too_large"\) return payloadTooLargeResponse\(\);/return payloadTooLargeResponse();/' \
  test/body-limit-routes.test.ts

# Fix-round guards (F1, F2, F5).
plant "F1: chat shape check bypassed" \
  apps/web/app/api/chat/route.ts \
  's/if \(!shape\.ok\) \{/if (false) {/' \
  test/chat-route-shape.test.ts

plant "F1: shape check on the whole thread, not the forwarded tail" \
  apps/web/app/api/chat/route.ts \
  's/checkChatMessagesShape\(forwardedMessages\)/checkChatMessagesShape(body.messages)/' \
  test/chat-route-shape.test.ts

plant "F1: logged error not capped" \
  apps/web/app/api/chat/route.ts \
  's/\.slice\(0, MAX_LOGGED_ERROR_CHARS\)//' \
  test/chat-route-shape.test.ts

plant "F1: element cap raised to 5000" \
  apps/web/server/chat/message-shape.ts \
  's/MAX_CHAT_MESSAGE_ELEMENTS = 500;/MAX_CHAT_MESSAGE_ELEMENTS = 5000;/' \
  test/chat-message-shape.test.ts

plant "F1: message cap raised to 2000" \
  apps/web/server/chat/message-shape.ts \
  's/MAX_CHAT_MESSAGES = 200;/MAX_CHAT_MESSAGES = 2000;/' \
  test/chat-message-shape.test.ts

plant "F1: text part text not checked" \
  apps/web/server/chat/message-shape.ts \
  's/return typeof part\.text === "string" \? 1 : "text_part";/return 1;/' \
  test/chat-message-shape.test.ts

plant "F1: providerOptions let through" \
  apps/web/server/chat/message-shape.ts \
  's/return "providerOptions" in v \|\| "experimental_providerMetadata" in v;/return false;/' \
  test/chat-message-shape.test.ts

plant "F2: stack kept in the tRPC error response" \
  apps/web/server/trpc/error-format.ts \
  's/const \{ stack: _stack, \.\.\.data \} = shape\.data;/const data = shape.data;/' \
  test/trpc-error-format.test.ts

plant "F2: every Zod issue returned" \
  apps/web/server/trpc/error-format.ts \
  's/\.slice\(0, MAX_ERROR_ISSUES\)//' \
  test/trpc-error-format.test.ts

plant "F2: long messages not cut" \
  apps/web/server/trpc/error-format.ts \
  's/message: shape\.message\.slice\(0, MAX_ERROR_MESSAGE_CHARS\)/message: shape.message/' \
  test/trpc-error-format.test.ts

plant "F5: Retry offered on a 413" \
  apps/web/components/chat/chat-client.tsx \
  's/\{offersRetry\(friendlyError\.code\) && \(/{true \&\& (/' \
  test/chat-error-actions.test.ts

plant "F5: unsent message kept after a 413" \
  apps/web/components/chat/chat-client.tsx \
  's/setMessages\(\(prev\) => withoutUnsentMessage\(prev\)\);//' \
  test/chat-error-actions.test.ts

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
