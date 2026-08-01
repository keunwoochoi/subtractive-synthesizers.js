#!/usr/bin/env bash
# Is CI actually green at the commit we are sitting on?
#
# WHY THIS EXISTS
# Two commits shipped red without anyone noticing, because "it passed locally" was
# treated as "it passes". AGENTS.md already says evidence is bound to an exact head and
# a clean tree; nothing enforced the remote half of that, so the enforcement lived in
# whether I remembered to poll `gh run list` after pushing. Twice, I did not.
#
# This reports rather than blocks by default: CI status is not a property of the working
# tree, a run takes minutes, and wedging local work on a remote queue is the obstructive
# failure that scripts/audit/check-identity.sh had to be walked back from. Release
# readiness uses --require-green, which fails closed instead.
#
#     scripts/audit/check-ci.sh [--wait | --require-green]
set -euo pipefail
cd "$(dirname "$0")/../.."

WAIT=0
REQUIRE_GREEN=0
case "${1:-}" in
  "") ;;
  --wait) WAIT=1 ;;
  --require-green) REQUIRE_GREEN=1 ;;
  *) echo "usage: scripts/audit/check-ci.sh [--wait | --require-green]" >&2; exit 2 ;;
esac

report_unavailable() {
  echo "ci check: ci.yml unavailable — $1"
  [ "$REQUIRE_GREEN" = "0" ]
}

[ -x scripts/gh-owner.sh ] || { report_unavailable "scripts/gh-owner.sh is missing"; exit $?; }
git rev-parse --git-dir >/dev/null 2>&1 || { report_unavailable "not a git repo"; exit $?; }

SHA=$(git rev-parse HEAD)
SHORT=${SHA:0:7}

if ! git merge-base --is-ancestor "$SHA" "@{u}" 2>/dev/null; then
  echo "ci check: ci.yml at $SHORT — HEAD is not pushed to its upstream"
  [ "$REQUIRE_GREEN" = "0" ]
  exit $?
fi

query() {
  # Both filters are essential. --workflow prevents a successful Pages deployment from
  # impersonating CI; --commit binds the result to the commit whose evidence is claimed.
  scripts/gh-owner.sh run list --workflow ci.yml --commit "$SHA" --limit 1 \
    --json headSha,status,conclusion,workflowName,url \
    --jq '.[0] // empty'
}

for _ in $(seq 1 60); do
  if ! RUN=$(query 2>/dev/null); then
    echo "ci check: ci.yml at $SHORT — query failed"
    [ "$REQUIRE_GREEN" = "0" ]
    exit $?
  fi
  if [ -z "$RUN" ]; then
    echo "ci check: ci.yml at $SHORT — no run found"
    [ "$REQUIRE_GREEN" = "1" ] && exit 1
    [ "$WAIT" = "1" ] || exit 0
    sleep 15; continue
  fi
  RUN_SHA=$(jq -r '.headSha // "-"' <<<"$RUN")
  STATUS=$(jq -r .status <<<"$RUN")
  CONC=$(jq -r '.conclusion // "-"' <<<"$RUN")
  WORKFLOW=$(jq -r '.workflowName // "ci"' <<<"$RUN")
  if [ "$RUN_SHA" != "$SHA" ]; then
    echo "ci check: ci.yml at $SHORT — observed workflow=$WORKFLOW headSha=$RUN_SHA status=$STATUS conclusion=$CONC"
    [ "$REQUIRE_GREEN" = "1" ] && exit 1
    [ "$WAIT" = "1" ] || exit 0
    sleep 15; continue
  fi
  if [ "$STATUS" != "completed" ]; then
    echo "ci check: ci.yml at $SHORT — observed workflow=$WORKFLOW status=$STATUS conclusion=$CONC"
    [ "$REQUIRE_GREEN" = "1" ] && exit 1
    [ "$WAIT" = "1" ] || exit 0
    sleep 15; continue
  fi
  if [ "$CONC" = "success" ]; then
    echo "ci check: ci.yml at $SHORT — observed workflow=$WORKFLOW status=completed conclusion=success"
    exit 0
  fi
  echo "ci check: ci.yml at $SHORT — observed workflow=$WORKFLOW status=completed conclusion=$CONC"
  exit 1
done
echo "ci check: ci.yml at $SHORT — gave up waiting; no completed successful run observed"
exit 0
