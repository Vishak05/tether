"""
Tether Agent — Headless Entry Point (used by the Task Scheduler task)

Not just `python -m uvicorn agent.main:app ...` because uvicorn installs its
own logging config by default (its `uvicorn.error`/`uvicorn.access` loggers
attach StreamHandlers pointed at sys.stdout/sys.stderr). Under pythonw.exe
(no console — see install_task.ps1's DESCRIPTION for why the task uses it),
sys.stdout and sys.stderr are both None, and uvicorn's default logging setup
crashes on its very first log line trying to write to them.

Confirmed live: the agent process started, its own JSON logger correctly
wrote a single "Tether agent starting" line to ~/.tether/agent.log (it
checks for a usable stdout before attaching a stream handler — see
agent/core/logging.py), then the process vanished with no further log lines
and no error surfaced anywhere, consistent with an unhandled exception
inside uvicorn's own startup logging with no console/log target to report
it to.

log_config=None tells uvicorn to skip installing its own logging setup
entirely — it just uses the Python logging config already in place (i.e.
nothing extra), avoiding the crash. The agent's own request/command logging
(agent/core/logging.py) is unaffected either way — it's independent of
uvicorn's internal loggers.
"""
import argparse
import sys
from pathlib import Path

# Running this file by path (not `python -m ...`) puts this script's own
# directory (agent\scripts\) at sys.path[0], not the repo root — so `import
# agent...` below would fail. `-m` mode adds the CWD instead, which is why
# the previous `-m uvicorn agent.main:app` invocation didn't have this
# problem. Confirmed live: under pythonw.exe (no console), this import
# failure produced no visible error and no log line at all — Python's
# default unhandled-exception printer also needs a working stderr, so the
# process just silently vanished.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import uvicorn

from agent.core.config import HOST, PORT

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()

    uvicorn.run(
        "agent.main:app",
        host=args.host,
        port=args.port,
        reload=False,
        log_config=None,
    )
