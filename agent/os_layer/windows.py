"""
Tether Agent — Windows OS Command Layer

All system-level interactions are isolated here so that the rest of the
agent (routes, auth, logging) stays OS-agnostic.  Each public function
returns a dict:

    {"ok": True,  "result": <payload>}   — success
    {"ok": False, "error": <message>}    — failure

Phase 4 will add a Linux layer alongside this file; the dispatcher in
routes/commands.py selects the right layer at import time.
"""
import base64
import ctypes
import io
import os
import subprocess
import sys
from typing import Any

import psutil

# ── lazy imports for heavy Windows-only libs ──────────────────────────────────
try:
    import win32gui
    import win32process
    _HAS_WIN32 = True
except ImportError:
    _HAS_WIN32 = False

try:
    from PIL import ImageGrab
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False

try:
    from ctypes import POINTER, cast
    import comtypes
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
    _HAS_PYCAW = True
except ImportError:
    _HAS_PYCAW = False

try:
    # The `wmi` package (a thin, well-behaved wrapper around win32com.client)
    # is used instead of calling win32com.client directly for WMI method
    # calls — raw win32com's positional-argument COM marshaling silently
    # fails typed WMI methods like WmiSetBrightness with a generic "Invalid
    # parameter" error (confirmed live: identical call succeeds via
    # PowerShell's Get-WmiObject and via wmi's keyword-argument call, but
    # fails via win32com.client's positional call). `wmi` calls methods with
    # keyword arguments, which avoids the marshaling issue entirely.
    import wmi as wmi_module
    _HAS_WMI = True
except ImportError:
    _HAS_WMI = False


# ── helpers ───────────────────────────────────────────────────────────────────

def _ok(result: Any = None) -> dict:
    return {"ok": True, "result": result}

def _err(msg: str) -> dict:
    return {"ok": False, "error": msg}


# ── commands ──────────────────────────────────────────────────────────────────

def lock_workstation() -> dict:
    """Lock the Windows workstation immediately."""
    ret = ctypes.windll.user32.LockWorkStation()
    if ret:
        return _ok("workstation locked")
    return _err(f"LockWorkStation() failed (error code {ctypes.GetLastError()})")


def sleep_system() -> dict:
    """Put the machine into sleep/suspend state (S3)."""
    try:
        # SetSuspendState(hibernate=False, force=False, wakeup_events_disabled=False)
        result = ctypes.windll.powrprof.SetSuspendState(False, False, False)
        if result:
            return _ok("system sleeping")
        return _err("SetSuspendState returned 0")
    except Exception as exc:
        return _err(str(exc))


def restart_system() -> dict:
    """Restart the machine immediately (no forced app closure delay)."""
    try:
        subprocess.run(["shutdown", "/r", "/t", "0"], check=True, capture_output=True, timeout=10)
        return _ok("restarting")
    except subprocess.CalledProcessError as exc:
        return _err(f"shutdown /r failed: {exc.stderr.decode(errors='replace').strip()}")
    except Exception as exc:
        return _err(str(exc))


def shutdown_system() -> dict:
    """Shut the machine down immediately."""
    try:
        subprocess.run(["shutdown", "/s", "/t", "0"], check=True, capture_output=True, timeout=10)
        return _ok("shutting down")
    except subprocess.CalledProcessError as exc:
        return _err(f"shutdown /s failed: {exc.stderr.decode(errors='replace').strip()}")
    except Exception as exc:
        return _err(str(exc))


# Virtual key codes for media keys (winuser.h)
_VK_MEDIA_NEXT_TRACK = 0xB0
_VK_MEDIA_PREV_TRACK = 0xB1
_VK_MEDIA_STOP = 0xB2
_VK_MEDIA_PLAY_PAUSE = 0xB3
_MEDIA_KEYS = {
    "play_pause": _VK_MEDIA_PLAY_PAUSE,
    "next": _VK_MEDIA_NEXT_TRACK,
    "previous": _VK_MEDIA_PREV_TRACK,
    "stop": _VK_MEDIA_STOP,
}
_KEYEVENTF_KEYUP = 0x0002


def media_control(action: str) -> dict:
    """
    Simulate a media key press (play/pause, next, previous, stop) — whatever
    app currently owns the system media session (Spotify, browser, etc.)
    receives it, same as a hardware media key would.
    """
    vk = _MEDIA_KEYS.get(action)
    if vk is None:
        return _err(f"Unknown media action '{action}' (expected one of {sorted(_MEDIA_KEYS)})")
    try:
        ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
        ctypes.windll.user32.keybd_event(vk, 0, _KEYEVENTF_KEYUP, 0)
        return _ok({"action": action})
    except Exception as exc:
        return _err(str(exc))


def get_brightness() -> dict:
    """Read the internal display's current brightness (0-100). Laptop panels only."""
    if not _HAS_WMI:
        return _err("the 'wmi' package is not available")
    try:
        c = wmi_module.WMI(namespace="wmi")
        monitors = c.WmiMonitorBrightness()
        if not monitors:
            return _err("No brightness-capable display found (internal laptop panel required)")
        return _ok({"brightness": monitors[0].CurrentBrightness})
    except Exception as exc:
        return _err(str(exc))


def set_brightness(level: int) -> dict:
    """Set the internal display's brightness (0-100). Laptop panels only."""
    level = max(0, min(100, level))
    if not _HAS_WMI:
        return _err("the 'wmi' package is not available")
    try:
        c = wmi_module.WMI(namespace="wmi")
        methods = c.WmiMonitorBrightnessMethods()
        if not methods:
            return _err("No brightness-capable display found (internal laptop panel required)")
        methods[0].WmiSetBrightness(Timeout=1, Brightness=level)
        return _ok({"brightness": level})
    except Exception as exc:
        return _err(str(exc))


def set_volume(level: int) -> dict:
    """
    Set master system volume.

    Args:
        level: 0–100 (integer percentage)

    Uses pycaw (Windows Core Audio) for reliable, no-external-tool volume control.
    Falls back to a PowerShell one-liner if pycaw is unavailable.
    """
    level = max(0, min(100, level))

    if _HAS_PYCAW:
        try:
            devices = AudioUtilities.GetSpeakers()
            interface = devices.Activate(IAudioEndpointVolume._iid_, comtypes.CLSCTX_ALL, None)
            volume = cast(interface, POINTER(IAudioEndpointVolume))
            # IAudioEndpointVolume uses scalar 0.0–1.0
            volume.SetMasterVolumeLevelScalar(level / 100.0, None)
            return _ok({"volume": level})
        except Exception as exc:
            return _err(f"pycaw error: {exc}")

    # PowerShell fallback
    try:
        ps_cmd = (
            f"$obj = New-Object -com wscript.shell; "
            f"$obj.SendKeys([char]174*50); "   # first mute all the way down
            f"1..{round(level/2)} | % {{$obj.SendKeys([char]175)}}"
        )
        subprocess.run(
            ["powershell", "-Command", ps_cmd],
            check=True, capture_output=True, timeout=10
        )
        return _ok({"volume": level, "method": "powershell-fallback"})
    except Exception as exc:
        return _err(f"PowerShell fallback error: {exc}")


def toggle_wifi(enable: bool | None = None) -> dict:
    """
    Toggle or explicitly set the Wi-Fi adapter state.

    Args:
        enable: True → enable, False → disable, None → toggle current state.

    Returns the new state in the result payload.
    """
    # Find the Wi-Fi interface name
    try:
        info = subprocess.run(
            ["netsh", "interface", "show", "interface"],
            capture_output=True, text=True, timeout=10
        )
        wifi_name: str | None = None
        for line in info.stdout.splitlines():
            if "wi-fi" in line.lower() or "wireless" in line.lower():
                # Line format: "Enabled   Connected   Dedicated      Wi-Fi"
                parts = line.split()
                if parts:
                    wifi_name = parts[-1]
                    current_enabled = parts[0].lower() == "enabled"
                break

        if wifi_name is None:
            return _err("No Wi-Fi interface found via netsh")

        target = (not current_enabled) if enable is None else enable
        action = "enable" if target else "disable"

        subprocess.run(
            ["netsh", "interface", "set", "interface", wifi_name, action],
            check=True, capture_output=True, timeout=10
        )
        return _ok({"wifi": action + "d", "interface": wifi_name})
    except subprocess.CalledProcessError as exc:
        return _err(f"netsh error: {exc.stderr.strip()}")
    except Exception as exc:
        return _err(str(exc))


def take_screenshot() -> dict:
    """
    Capture a full-screen screenshot and return it as a base64-encoded JPEG.

    The image is compressed to JPEG (quality=70) before encoding to keep
    the payload size manageable over the REST channel.
    """
    if not _HAS_PIL:
        return _err("Pillow is not installed — cannot take screenshot")
    try:
        img = ImageGrab.grab()
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode()
        return _ok({
            "format": "jpeg",
            "width": img.width,
            "height": img.height,
            "data_base64": b64,
        })
    except Exception as exc:
        return _err(str(exc))


# ── status ────────────────────────────────────────────────────────────────────

def get_status() -> dict:
    """
    Collect current laptop state snapshot:
      - battery percentage + charging state
      - workstation lock state (best-effort, no reliable public API)
      - foreground window title + process name
    """
    payload: dict[str, Any] = {}

    # Battery
    batt = psutil.sensors_battery()
    if batt:
        payload["battery"] = {
            "percent": round(batt.percent, 1),
            "charging": batt.power_plugged,
            "time_left_secs": batt.secsleft if batt.secsleft != psutil.POWER_TIME_UNLIMITED else None,
        }
    else:
        payload["battery"] = None

    # Foreground window (requires pywin32)
    if _HAS_WIN32:
        try:
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            proc = psutil.Process(pid)
            payload["active_window"] = {
                "title": title,
                "process": proc.name(),
                "pid": pid,
            }
        except Exception:
            payload["active_window"] = None
    else:
        payload["active_window"] = None

    # Lock state — Windows doesn't expose a direct API; we approximate by checking
    # whether the Desktop window station is accessible.
    payload["locked"] = _is_locked()

    # System resources
    payload["system"] = {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "memory_percent": psutil.virtual_memory().percent,
        "disk_percent": psutil.disk_usage(os.environ.get("SystemDrive", "C:") + "\\").percent,
    }

    # Idle time (seconds since last keyboard/mouse input)
    payload["idle_secs"] = _get_idle_seconds()

    return _ok(payload)


def _is_locked() -> bool:
    """
    Heuristic: try to open the interactive desktop. Returns True if locked.
    This is not 100% reliable but is good enough for a status dashboard.
    """
    try:
        # OpenDesktop returns NULL when the user is at the lock screen
        hdesk = ctypes.windll.user32.OpenDesktopW(
            "Default", 0, False, 0x0100  # DESKTOP_READOBJECTS
        )
        if hdesk == 0:
            return True
        ctypes.windll.user32.CloseDesktop(hdesk)
        return False
    except Exception:
        return False


class _LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


def _get_idle_seconds() -> float | None:
    """Seconds since the last keyboard/mouse input, system-wide."""
    try:
        lii = _LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(_LASTINPUTINFO)
        if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
            return None
        tick_count = ctypes.windll.kernel32.GetTickCount()
        return round((tick_count - lii.dwTime) / 1000, 1)
    except Exception:
        return None
