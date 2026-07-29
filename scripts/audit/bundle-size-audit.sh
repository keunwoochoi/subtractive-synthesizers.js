#!/usr/bin/env bash
# Owns the public bundle-size contract. PRINCIPLES.md cites this script rather than
# restating the number, so this file is the single place the ceiling is written down.
#
# Two failures this exists to make impossible:
#   1. A stale shipped WASM. packages/core/wasm/ is committed; if it drifts from what
#      the current Rust source builds, every published size number and every render
#      gate is measuring a binary nobody can reproduce.
#   2. A README that quietly lies. The sibling project's drifted to claiming less than
#      half its real size, because the number lived in prose.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUDGET_GZ=$((60 * 1024))   # whole library, gzipped, all-in
SHIPPED=packages/core/wasm/subtractive_dsp.wasm
BUILT=target/wasm32-unknown-unknown/release/subtractive_dsp.wasm

if command -v cargo >/dev/null 2>&1; then
  cargo build -q -p subtractive-dsp --target wasm32-unknown-unknown --release
  if [ -f "$BUILT" ] && ! cmp -s "$SHIPPED" "$BUILT"; then
    echo "BUNDLE AUDIT FAIL: shipped WASM is stale."
    echo "  shipped $(shasum -a 256 "$SHIPPED" | cut -c1-16)"
    echo "  built   $(shasum -a 256 "$BUILT" | cut -c1-16)"
    echo "  fix: cp $BUILT $SHIPPED"
    exit 1
  fi
fi

gz() { gzip -9c "$1" | wc -c | tr -d ' '; }
PARTS=("$SHIPPED" packages/core/src/index.js packages/core/worklet/processor.js)

total=0
printf '%-44s %10s %10s\n' file raw gz
for f in "${PARTS[@]}"; do
  [ -f "$f" ] || { echo "BUNDLE AUDIT FAIL: $f is missing."; exit 1; }
  g=$(gz "$f"); total=$((total + g))
  printf '%-44s %10s %10s\n' "$f" "$(wc -c < "$f" | tr -d ' ')" "$g"
done

printf '%-44s %10s %10s\n' TOTAL "" "$total"
echo "budget: $BUDGET_GZ B gz ($((BUDGET_GZ / 1024)) KB) — using $((total * 100 / BUDGET_GZ))%"
if [ "$total" -gt "$BUDGET_GZ" ]; then
  echo "BUNDLE AUDIT FAIL: over budget by $((total - BUDGET_GZ)) B gz."
  exit 1
fi
echo "bundle audit OK"
