#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: get-logs.sh <github-actions-url>" >&2
  echo "Example: get-logs.sh https://github.com/owner/repo/actions/runs/123456789" >&2
  exit 1
fi

URL="$1"

# Parse GitHub Actions URL
# Formats:
#   https://github.com/owner/repo/actions/runs/RUN_ID
#   https://github.com/owner/repo/actions/runs/RUN_ID/job/JOB_ID
#   https://github.com/owner/repo/actions/runs/RUN_ID/attempts/N
if [[ "$URL" =~ github\.com/([^/]+/[^/]+)/actions/runs/([0-9]+) ]]; then
  REPO="${BASH_REMATCH[1]}"
  RUN_ID="${BASH_REMATCH[2]}"
else
  echo "❌ Could not parse GitHub Actions URL: $URL" >&2
  echo "Expected format: https://github.com/owner/repo/actions/runs/RUN_ID" >&2
  exit 1
fi

echo "📋 Run Summary"
echo "  Repo:   $REPO"
echo "  Run ID: $RUN_ID"
echo ""

# Get run details
RUN_JSON=$(gh run view "$RUN_ID" --repo "$REPO" --json status,conclusion,name,headBranch,createdAt,event,jobs)

echo "$RUN_JSON" | jq -r '"  Workflow: \(.name)\n  Branch:   \(.headBranch)\n  Status:   \(.status) (\(.conclusion // "in progress"))\n  Created:  \(.createdAt)\n  Event:    \(.event)"'
echo ""

# Show job statuses
echo "📊 Jobs:"
echo "$RUN_JSON" | jq -r '.jobs[] | "  \(if .conclusion == "failure" then "❌" elif .conclusion == "success" then "✅" elif .conclusion == "skipped" then "⏭️" else "🔄" end) \(.name) — \(.status) (\(.conclusion // "in progress"))"'
echo ""

# Determine if there are failures
CONCLUSION=$(echo "$RUN_JSON" | jq -r '.conclusion // "in_progress"')
HAS_FAILED_JOBS=$(echo "$RUN_JSON" | jq '[.jobs[] | select(.conclusion == "failure")] | length')

if [[ "$HAS_FAILED_JOBS" -gt 0 ]]; then
  echo "📥 Fetching failed job logs..."
  echo ""
  gh run view "$RUN_ID" --repo "$REPO" --log-failed
elif [[ "$CONCLUSION" == "success" ]]; then
  echo "✅ All jobs passed. Fetching full logs..."
  echo ""
  gh run view "$RUN_ID" --repo "$REPO" --log
else
  echo "📥 Fetching logs..."
  echo ""
  gh run view "$RUN_ID" --repo "$REPO" --log
fi
