#!/usr/bin/env bash
# Assert that the active GitHub identity is the one that owns this repository.
#
# WHY THIS EXISTS
# The `gh` CLI keeps a single global "active account" shared across every repo on the
# machine. An agent working here can therefore create issues, comments, and reviews as
# whatever account happened to be active in an unrelated context — with no signal that
# anything is wrong, because git pushes are authenticated separately (by SSH key) and
# stay correctly attributed. So `git log` looks right while the GitHub-side activity is
# posted by the wrong person. That happened in this repo on 2026-07-28 and required the
# owner to delete published issue content.
#
# WHY THE EXPECTED ACCOUNT IS DERIVED, NOT HARDCODED
# The failure mode is an account that must not be associated with this repository. This
# repo is public, so writing that account's name into a committed file — even inside a
# "never use this" rule — would publish exactly what the rule exists to protect. The
# check therefore derives the expected login from the repo owner and never names any
# other account. It is also more robust: it works for any owner, and it cannot go stale.
#
# Usage:  scripts/audit/check-identity.sh [expected_override] [actual_override]
#         (the two overrides exist so the test can prove this script fails when it should)
set -euo pipefail

EXPECTED="${1:-}"
ACTUAL="${2:-}"

if [ -z "$EXPECTED" ]; then
  REMOTE=$(git remote get-url origin 2>/dev/null || true)
  if [ -z "$REMOTE" ]; then
    echo "identity check: no 'origin' remote; skipping (nothing to be wrong about)."
    exit 0
  fi
  # git@github.com:OWNER/REPO.git  or  https://github.com/OWNER/REPO.git
  EXPECTED=$(sed -E 's#^.*[:/]([^/]+)/[^/]+$#\1#' <<<"${REMOTE%.git}")
fi

if [ -z "$ACTUAL" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "identity check: gh not installed; skipping."
    exit 0
  fi
  ACTUAL=$(gh api user --jq .login 2>/dev/null || true)
  if [ -z "$ACTUAL" ]; then
    echo "identity check: not logged in to gh; skipping."
    exit 0
  fi
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  cat >&2 <<MSG
IDENTITY CHECK FAIL

  active GitHub account : $ACTUAL
  this repo is owned by : $EXPECTED

Every GitHub-side action from this repository — issues, comments, reviews, releases —
must come from the owning account. Pushes are authenticated separately and will look
correct even when this is wrong, so nothing else will warn you.

  fix:  gh auth switch -u $EXPECTED

Do not work around this by using the API directly.
MSG
  exit 1
fi

echo "identity ok — $ACTUAL"
