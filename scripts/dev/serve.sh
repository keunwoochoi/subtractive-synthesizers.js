#!/usr/bin/env bash
# Dev server for the playground and showcase.
#
#   scripts/dev/serve.sh          run in the foreground (ctrl-C to stop)
#   scripts/dev/serve.sh start    detach, survive the parent, record the PID
#   scripts/dev/serve.sh stop     stop the detached one
#   scripts/dev/serve.sh status   is it up, and is it ours?
#
# Two things this exists to prevent, both observed on this machine:
#
#   1. Two servers holding the "same" port -- one on 127.0.0.1, one on ::1 -- so
#      `localhost` served this repo or a stranger's directory depending on nothing the
#      user could see. Hence the explicit bind and the pre-flight check.
#   2. Orphans. Seven stray http.server processes were found here, up to twelve days
#      old, with no way to tell whose they were. `start` writes a PID file so `stop`
#      can clean up exactly what it created and nothing else.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT=${PORT:-8291}
PIDFILE=".dev-server.$PORT.pid"

listening() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; }

case "${1:-run}" in
  stop)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      kill "$(cat "$PIDFILE")" && rm -f "$PIDFILE"
      echo "stopped."
    else
      rm -f "$PIDFILE"
      echo "nothing of ours was running on $PORT."
    fi
    exit 0
    ;;
  status)
    if listening; then
      lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | tail -n +2
      # A listening socket is not proof it is OUR files: check the content.
      if curl -s --max-time 2 "http://127.0.0.1:$PORT/apps/playground/" \
         | grep -q "subtractive-synthesizers"; then
        echo "serving THIS repo."
      else
        echo "WARNING: something else holds $PORT."
      fi
    else
      echo "nothing listening on $PORT."
    fi
    exit 0
    ;;
esac

if listening; then
  echo "port $PORT is already in use:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  echo "  stop it with: scripts/dev/serve.sh stop   (if it is ours)" >&2
  echo "  or choose another: PORT=xxxx scripts/dev/serve.sh" >&2
  exit 1
fi

echo "→ http://127.0.0.1:$PORT/apps/playground/showcase.html   (showcase)"
echo "→ http://127.0.0.1:$PORT/apps/playground/                (patch editor)"

if [ "${1:-run}" = "start" ]; then
  # Detach via a double fork in PYTHON, not `setsid` -- macOS has no setsid, and the
  # first version failed silently there while reporting success.
  python3 scripts/dev/daemon.py "$PORT" "$PWD"
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null && listening; then
    echo "detached, pid $(cat "$PIDFILE"). stop with: scripts/dev/serve.sh stop"
    exit 0
  fi
  echo "failed to detach: nothing is listening on $PORT." >&2
  rm -f "$PIDFILE"
  exit 1
fi

exec python3 scripts/dev/server.py "$PORT"
