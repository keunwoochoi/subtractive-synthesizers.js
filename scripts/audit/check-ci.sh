#!/usr/bin/env bash
# Is CI actually green at the commit we are sitting on?
#
# WHY THIS EXISTS
# Two commits shipped red without anyone noticing, because "it passed locally" was
# treated as "it passes". AGENTS.md already says evidence is bound to an exact head and
# a clean tree; nothing enforced the remote half of that, so the enforcement lived in
# whether I remembered to poll `gh run list` after pushing. Twice, I did not.
#
# This reports rather than blocks: CI status is not a property of the working tree, a
# run takes minutes, and wedging local work on a remote queue is the obstructive failure
# that scripts/audit/check-identity.sh had to be walked back from.
#
#     scripts/audit/check-ci.sh [--wait]
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v gh >/dev/null 2>&1 || { echo "ci check: gh not installed; skipping."; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "ci check: not a git repo; skipping."; exit 0; }

SHA=$(git rev-parse HEAD)
SHORT=${SHA:0:7}

if ! git merge-base --is-ancestor "$SHA" "@{u}" 2>/dev/null; then
  echo "ci check: $SHORT is not pushed yet — nothing for CI to have run."
  exit 0
fi

query() {
  gh run list --limit 20 --json headSha,status,conclusion,workflowName \
    --jq "[.[] | select(.headSha == \"$SHA\")] | .[0] // empty" 2>/dev/null || true
}

WAIT=0
[ "${1:-}" = "--wait" ] && WAIT=1

for _ in $(seq 1 60); do
  RUN=$(query)
  if [ -z "$RUN" ]; then
    echo "ci check: no run found for $SHORT yet."
    [ "$WAIT" = "1" ] || exit 0
    sleep 15; continue
  fi
  STATUS=$(jq -r .status <<<"$RUN")
  CONC=$(jq -r '.conclusion // "-"' <<<"$RUN")
  if [ "$STATUS" != "completed" ]; then
    echo "ci check: $SHORT is $STATUS."
    [ "$WAIT" = "1" ] || exit 0
    sleep 15; continue
  fi
  if [ "$CONC" = "success" ]; then
    echo "ci check: $SHORT is green."
    exit 0
  fi
  echo "CI IS $CONC AT HEAD ($SHORT)."
  echo "  Evidence claimed against this commit is not valid until CI is green."
  echo "  gh run list --limit 3"
  exit 1
done
echo "ci check: gave up waiting for $SHORT."
exit 0
