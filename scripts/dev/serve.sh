#!/usr/bin/env bash
# Dev server for the playground and showcase.
#
# The port is checked before binding. Two servers CAN hold the "same" port on this
# machine -- one on 127.0.0.1 and one on ::1 -- and `localhost` then resolves to
# whichever the client prefers. That happened on 2026-07-29: a six-day-old server from
# another project held 8174 on IPv4 while this one bound ::1, so the same URL returned
# 200 or 404 depending on nothing the user could see. Failing loudly beats serving the
# wrong directory.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT=${PORT:-8291}
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is already in use:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  echo >&2
  echo "Pick another with: PORT=xxxx scripts/dev/serve.sh" >&2
  exit 1
fi

echo "→ http://127.0.0.1:$PORT/apps/playground/showcase.html   (showcase)"
echo "→ http://127.0.0.1:$PORT/apps/playground/                (patch editor)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
