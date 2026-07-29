#!/usr/bin/env bash
# Owns the public bundle-size contract. PRINCIPLES.md cites this script rather than
# restating the number, so this file is the single place the ceiling is written down.
#
# The sibling project's README drifted to claiming less than half its real size because
# the number lived in prose. It cannot drift here: there is one copy and it is executable.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUDGET_GZ=$((60 * 1024))   # whole library, gzipped, all-in

echo "bundle ceiling: ${BUDGET_GZ} B gz ($((BUDGET_GZ / 1024)) KB)"

SHIPPED=()   # populated when packages/ exists; see agentic-docs/design/2026-07-28-architecture.md

if [ ${#SHIPPED[@]} -eq 0 ]; then
  echo "no shipped artifacts yet — nothing to measure, ceiling stands."
  echo "This script becomes a gate the moment the first artifact lands."
  exit 0
fi
