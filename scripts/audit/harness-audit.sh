#!/usr/bin/env bash
# Owns the harness rules that would otherwise be enforced by memory.
# Two things this must do, in order:
#   1. Prove the audit still fails on deliberately broken input. A green audit that
#      cannot go red is not evidence. (METR task standard, applied to ourselves.)
#   2. Audit the real repo.
set -euo pipefail
cd "$(dirname "$0")/../.."

# Show the last few lines when a suite passes, and EVERYTHING when it fails. The first
# version piped through `tail -3` unconditionally, which meant the one time it mattered
# -- a missing dependency on CI -- the traceback naming the module was cut off and the
# log showed only "exit code 1".
run_tests() {
  local out
  if out=$(python3 "$1" 2>&1); then
    printf '%s\n' "$out" | tail -3
  else
    printf '%s\n' "$out"
    if grep -q ModuleNotFoundError <<<"$out"; then
      echo
      echo "Missing a dev dependency. Install with:"
      echo "    pip install -r scripts/requirements-dev.txt"
    fi
    return 1
  fi
}

echo "== identity =="
# First, because a wrong GitHub identity is the one harness failure that publishes
# something the owner then has to delete. Everything else is recoverable in-repo.
scripts/audit/check-identity.sh --warn

echo
echo "== CI at head =="
scripts/audit/check-ci.sh || true

echo
echo "== proving the audit can fail =="
run_tests scripts/audit/test_harness_audit.py

echo
echo "== proving verify-spec rejects cheats =="
run_tests scripts/verify/test_verify_spec.py

echo
echo "== rust unit tests (filter response shapes) =="
if command -v cargo >/dev/null 2>&1; then cargo test -q -p subtractive-dsp --lib 2>&1 | tail -3; else echo "cargo not installed; skipping"; fi

echo
echo "== engine checks (stability, headroom, effects) =="
node scripts/verify/check_engine.mjs | tail -3

echo
echo "== patch bank (stability, loudness match, distinctness) =="
node scripts/verify/check_patches.mjs | tail -4

echo
echo "== dsp-bench (audio-thread budget) =="
node scripts/verify/dsp_bench.mjs | grep -E "active voices|bench|BENCH"

echo
echo "== patch intents (PRINCIPLES #2) =="
python3 scripts/verify/check_intents.py

echo
echo "== generated docs match their measurements =="
python3 scripts/gen_docs.py --check

echo
echo "== auditing the repo =="
python3 scripts/audit/harness_audit.py
