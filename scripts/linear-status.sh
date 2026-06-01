#!/usr/bin/env bash
# Update a Linear issue state. Usage: linear-status.sh <issueId> <stateId>
# Requires LINEAR_API_KEY in env (source ~/.openclaw/secrets.env first).
set -eo pipefail
ISSUE_ID="$1"
STATE_ID="$2"
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation{issueUpdate(id:\\\"$ISSUE_ID\\\",input:{stateId:\\\"$STATE_ID\\\"}){success}}\"}" \
  | grep -o '"success":[a-z]*'
echo
