"""
Tether Agent — Bluetooth Presence Layer

Answers one question: is a given bonded phone currently within Bluetooth
range of this laptop? Used by the proximity auto-lock service.

── How presence is detected ──────────────────────────────────────────────────
An *uncached* SDP query. We ask the phone to enumerate its Bluetooth services;
if it answers, its radio is in range. Two properties make this the right
mechanism, both established by measurement (agent/scripts/spike_sdp_probe.py):

  - It engages no profile, so Android has nothing to ask permission for. This
    is not a minor detail: the approach tried first opened an RFCOMM channel
    instead, and every channel that answered on the test phone was backed by a
    real profile — channel 6 raised a Messages Access prompt, channel 7 a SIM
    Access prompt. Channels with no service behind them never answered at all.
    There is no silent channel; "ask what's there" works where "knock on a
    door" cannot.

  - BluetoothCacheMode.UNCACHED forces a live query. The cached mode answers
    instantly from Windows' stored SDP records and would report a phone that
    left the building a week ago as present.

Measured separation on the reference device: in range, 6/6 probes answered in
1.26-2.25s; out of range and stationary, 6/6 timed out. Readings taken while
walking out of the room were mixed, which is expected — that's the edge of
radio range, and it's what the miss threshold in core/proximity.py absorbs.

Classic Bluetooth, not BLE: Android rotates its BLE advertising address every
~15 minutes, so a BLE scan cannot track a phone over time. The bonded classic
address is stable.

BluetoothDevice.connection_status is deliberately NOT used. It reports
DISCONNECTED for a bonded-but-idle phone whether it's in your pocket or on
another continent — confirmed on hardware with the phone beside the laptop.
"""
import re
import winreg
from typing import Any

from agent.core.logging import get_logger

log = get_logger("tether.bluetooth")

try:
    import winrt.windows.devices.bluetooth as _bt
    _HAS_WINRT = True
except ImportError:  # pragma: no cover - depends on the install
    _HAS_WINRT = False


# Same {"ok": ..., "result"/"error": ...} shape the rest of the OS layer uses.
def _ok(result: Any = None) -> dict:
    return {"ok": True, "result": result}


def _err(msg: str) -> dict:
    return {"ok": False, "error": msg}


# ── addresses ─────────────────────────────────────────────────────────────────

def normalize_mac(raw: str) -> str | None:
    """
    '5879e0a6c785' | '58:79:E0:A6:C7:85' | '58-79-...' -> '58:79:E0:A6:C7:85'.

    Returns None unless the input holds exactly 12 hex digits. Accepting every
    separator style matters because the registry reports bare hex while people
    type the colon form.
    """
    hex_only = re.sub(r"[^0-9A-Fa-f]", "", raw or "")
    if len(hex_only) != 12:
        return None
    hex_only = hex_only.upper()
    return ":".join(hex_only[i:i + 2] for i in range(0, 12, 2))


def mac_to_int(mac: str) -> int | None:
    """Convert a MAC to the UInt64 the WinRT Bluetooth API expects."""
    normalized = normalize_mac(mac)
    if normalized is None:
        return None
    return int(normalized.replace(":", ""), 16)


# ── bonded device discovery ───────────────────────────────────────────────────

_BTHENUM_KEY = r"SYSTEM\CurrentControlSet\Enum\BTHENUM"
_DEV_KEY_RE = re.compile(r"Dev_([0-9A-Fa-f]{12})")


def list_bonded_devices() -> dict:
    """
    Bonded classic-Bluetooth devices, as [{"mac", "name"}].

    Read straight from the registry with winreg rather than by shelling out to
    PowerShell. winreg is stdlib, needs no admin, and — decisively — cannot
    flash a console window: the agent runs under pythonw.exe, where a
    subprocess call to powershell.exe pops a visible window on the desktop.

    Subkeys look like 'Dev_5879E0A6C785'; sibling service-class GUID keys
    ('{0000110b-...}') are excluded by the pattern. The friendly name lives on
    a per-instance subkey one level further down.
    """
    devices: list[dict] = []
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, _BTHENUM_KEY) as root:
            for i in range(winreg.QueryInfoKey(root)[0]):
                key_name = winreg.EnumKey(root, i)
                match = _DEV_KEY_RE.fullmatch(key_name)
                if not match:
                    continue
                mac = normalize_mac(match.group(1))
                if not mac:
                    continue
                devices.append({"mac": mac, "name": _friendly_name(root, key_name) or mac})
    except OSError as exc:
        log.warning("could not enumerate bonded devices", extra={"error": str(exc)})
        return _err(f"could not read bonded devices: {exc}")

    devices.sort(key=lambda d: d["name"].lower())
    return _ok(devices)


def _friendly_name(root, key_name: str) -> str | None:
    """Pull FriendlyName from the first instance subkey that carries one."""
    try:
        with winreg.OpenKey(root, key_name) as dev_key:
            for j in range(winreg.QueryInfoKey(dev_key)[0]):
                instance = winreg.EnumKey(dev_key, j)
                try:
                    with winreg.OpenKey(dev_key, instance) as instance_key:
                        return winreg.QueryValueEx(instance_key, "FriendlyName")[0]
                except OSError:
                    continue
    except OSError:
        pass
    return None


# ── presence probe ────────────────────────────────────────────────────────────

async def probe_presence(mac: str, timeout: float) -> dict:
    """
    Is the device at `mac` in Bluetooth range right now?

    Returns _ok({"present": bool, "detail": str, "elapsed_secs": float}).
    Errors are returned, never raised — this runs on a loop that must not die.

    Naturally async: the WinRT calls are genuine IAsyncOperations, so unlike a
    blocking socket probe this needs no thread offload to stay off the event
    loop.
    """
    import asyncio
    import time

    if not _HAS_WINRT:
        return _err("winrt-Windows.Devices.Bluetooth is not installed")

    address = mac_to_int(mac)
    if address is None:
        return _err(f"'{mac}' is not a valid Bluetooth address")

    started = time.perf_counter()
    try:
        device = await asyncio.wait_for(
            _bt.BluetoothDevice.from_bluetooth_address_async(address), timeout
        )
        if device is None:
            return _ok({
                "present": False,
                "detail": "device not known to the Bluetooth stack",
                "elapsed_secs": round(time.perf_counter() - started, 2),
            })

        result = await asyncio.wait_for(
            device.get_rfcomm_services_with_cache_mode_async(_bt.BluetoothCacheMode.UNCACHED),
            timeout,
        )
        count = len(result.services)
        return _ok({
            "present": count > 0,
            "detail": f"{count} services" if count else "no services returned",
            "elapsed_secs": round(time.perf_counter() - started, 2),
        })
    except (TimeoutError, asyncio.TimeoutError):
        # The overwhelmingly common out-of-range outcome: nothing answered.
        return _ok({
            "present": False,
            "detail": "timeout",
            "elapsed_secs": round(time.perf_counter() - started, 2),
        })
    except Exception as exc:
        # A radio that's been switched off, a WinRT error, a disappeared
        # device. Reported as an error rather than as absence so the service
        # can tell "definitely away" from "couldn't tell" — it must not lock
        # the machine because the Bluetooth stack hiccupped.
        return _err(f"{type(exc).__name__}: {exc}")
