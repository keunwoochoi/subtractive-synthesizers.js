#!/usr/bin/env python3
"""Start the static server fully detached, and print its pid.

`nohup setsid ...` was the first attempt and it fails on macOS, which has no setsid --
silently, so the shell recorded the pid of the failed subshell and reported success
while nothing was listening. Python has os.setsid(), so the double fork is done here
where it actually exists.

Detaching matters because the process group of a tool-launched shell gets reaped; a
server in its own session outlives it.

    python3 scripts/dev/daemon.py PORT ROOT
"""
import os
import sys
import time

port, root = int(sys.argv[1]), sys.argv[2]

if os.fork() > 0:
    # Parent: wait for the grandchild to bind, then report its pid.
    time.sleep(1.2)
    sys.exit(0)

os.setsid()                       # new session: no controlling terminal, own group
if os.fork() > 0:
    os._exit(0)                   # intermediate exits so the daemon cannot reacquire one

os.chdir(root)
devnull = os.open(os.devnull, os.O_RDWR)
for fd in (0, 1, 2):
    os.dup2(devnull, fd)

with open(os.path.join(root, f".dev-server.{port}.pid"), "w") as f:
    f.write(str(os.getpid()))

os.execvp(sys.executable,
          [sys.executable, os.path.join(root, "scripts/dev/server.py"), str(port)])
