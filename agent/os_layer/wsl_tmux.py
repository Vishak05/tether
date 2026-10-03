"""
Tether Agent — WSL tmux Layer

Backs the remote terminal. Every terminal session is a tmux session inside
WSL, and every phone connection is one more tmux *client* attached to it,
running in a Windows pseudo-console (ConPTY, via pywinpty).

Leaning on tmux is what makes the terminal behave like a remote control
rather than a disposable shell:

  - The session lives in tmux, not in the agent. A dropped phone connection
    only detaches its client; whatever was running carries on.
  - Reattaching makes tmux redraw the screen, so the agent keeps no
    scrollback of its own.
  - The same session can be attached at the laptop (`tmux attach -t tether`
    in a WSL shell), so you can pick up at the desk what you started on the
    phone, and the reverse.

Measured on the reference machine: terminating the ConPTY process detaches
the client and leaves the session running with zero clients, and a thread
blocked in read() gets EOFError rather than hanging.
"""
import re
import subprocess
from typing import Any

from agent.core.config import TERMINAL_WSL_DISTRO
from agent.core.logging import get_logger

log = get_logger("tether.wsl_tmux")

try:
    import winpty
    _HAS_WINPTY = True
except ImportError:  # pragma: no cover - depends on the install
    _HAS_WINPTY = False

# Names are passed to tmux as arguments (never through a shell), but tmux
# itself gives ':' and '.' meaning in target names, so stick to a safe set.
SESSION_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")

# wsl.exe is a console program. Without this, every list/kill call from the
# headless agent (pythonw.exe) would flash a console window on the desktop.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

# tmux's exit message when no session exists at all — an empty list, not a
# failure.
_NO_SERVER = ("no server running", "error connecting to")


def _ok(result: Any = None) -> dict:
    return {"ok": True, "result": result}


def _err(msg: str) -> dict:
    return {"ok": False, "error": msg}


def _wsl(*args: str) -> list[str]:
    cmd = ["wsl.exe"]
    if TERMINAL_WSL_DISTRO:
        cmd += ["-d", TERMINAL_WSL_DISTRO]
    return cmd + list(args)


def _decode(raw: bytes) -> str:
    # tmux's own output is UTF-8, but wsl.exe's errors (no distro, WSL not
    # installed) come out as UTF-16, which decodes as UTF-8 with NULs in it.
    return raw.decode("utf-8", errors="replace").replace("\x00", "").strip()


def _tmux(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        _wsl("-e", "tmux", *args),
        capture_output=True,
        timeout=15,
        creationflags=_NO_WINDOW,
    )


def list_sessions() -> dict:
    """
    Every tmux session in WSL, whether started from the phone or the laptop.

    Returns _ok([{"name", "windows", "attached", "created", "activity"}]),
    with created/activity as UNIX timestamps.
    """
    fmt = "\t".join([
        "#{session_name}",
        "#{session_windows}",
        "#{session_attached}",
        "#{session_created}",
        "#{session_activity}",
    ])
    try:
        proc = _tmux("list-sessions", "-F", fmt)
    except FileNotFoundError:
        return _err("WSL is not installed (wsl.exe not found)")
    except subprocess.TimeoutExpired:
        return _err("WSL did not respond")

    stdout, stderr = _decode(proc.stdout), _decode(proc.stderr)
    if proc.returncode != 0:
        if any(marker in stderr for marker in _NO_SERVER):
            return _ok([])
        return _err(stderr or stdout or f"tmux exited with code {proc.returncode}")

    sessions = []
    for line in stdout.splitlines():
        parts = line.split("\t")
        if len(parts) != 5:
            continue
        name, windows, attached, created, activity = parts
        try:
            sessions.append({
                "name": name,
                "windows": int(windows),
                "attached": int(attached),
                "created": int(created),
                "activity": int(activity),
            })
        except ValueError:
            continue
    return _ok(sessions)


def kill_session(name: str) -> dict:
    """End a session and everything running in it. Returns _ok() or _err()."""
    if not SESSION_NAME_RE.match(name):
        return _err(f"invalid session name {name!r}")
    try:
        proc = _tmux("kill-session", "-t", f"={name}")   # '=' = exact match, not prefix
    except FileNotFoundError:
        return _err("WSL is not installed (wsl.exe not found)")
    except subprocess.TimeoutExpired:
        return _err("WSL did not respond")
    if proc.returncode != 0:
        return _err(_decode(proc.stderr) or f"tmux exited with code {proc.returncode}")
    return _ok()


def spawn_client(name: str, cols: int, rows: int) -> dict:
    """
    Attach to session `name`, creating it if it doesn't exist yet.

    Returns _ok(PtyProcess). The caller owns the process: read() output,
    write() keystrokes, setwinsize() on resize, and terminate() it to detach.
    New sessions start in the WSL home directory.
    """
    if not _HAS_WINPTY:
        return _err("pywinpty is not installed")
    if not SESSION_NAME_RE.match(name):
        return _err(f"invalid session name {name!r}")
    try:
        proc = winpty.PtyProcess.spawn(
            _wsl("--cd", "~", "-e", "tmux", "new-session", "-A", "-s", name),
            dimensions=(rows, cols),
        )
    except Exception as exc:
        return _err(f"{type(exc).__name__}: {exc}")
    return _ok(proc)
