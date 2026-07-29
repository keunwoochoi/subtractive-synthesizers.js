#!/usr/bin/env bash
# Owns the harness rules that would otherwise be enforced by memory.
# Two things this must do, in order:
#   1. Prove the audit still fails on deliberately broken input. A green audit that
#      cannot go red is not evidence. (METR task standard, applied to ourselves.)
#   2. Audit the real repo.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== identity =="
# First, because a wrong GitHub identity is the one harness failure that publishes
# something the owner then has to delete. Everything else is recoverable in-repo.
scripts/audit/check-identity.sh --warn

echo
echo "== proving the audit can fail =="
python3 scripts/audit/test_harness_audit.py 2>&1 | tail -3

echo
echo "== proving verify-spec rejects cheats =="
python3 scripts/verify/test_verify_spec.py 2>&1 | tail -3

echo
echo "== patch intents (PRINCIPLES #2) =="
python3 scripts/verify/check_intents.py

echo
echo "== auditing the repo =="
python3 scripts/audit/harness_audit.py
