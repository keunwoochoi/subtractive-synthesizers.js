#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "→ http://localhost:8174/apps/playground/"
exec python3 -m http.server 8174
