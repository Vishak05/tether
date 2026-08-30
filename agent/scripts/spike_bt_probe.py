"""
Tether — Bluetooth presence probe SPIKE (throwaway, not imported by the agent)

Answers the one question the agent-side proximity auto-lock design rests on:
can this laptop tell whether a bonded phone is in Bluetooth range, with the
phone's app closed?

    C:\\Python314\\python.exe agent\\scripts\\spike_bt_probe.py --list
    C:\\Python314\\python.exe agent\\scripts\\spike_bt_probe.py --mac 58:79:E0:A6:C7:85
    C:\\Python314\\python.exe agent\\scripts\\spike_bt_probe.py --mac 5879E0A6C785 --scan-channels

Run this with python.exe (a real console), NOT pythonw.exe — unlike the agent
this is meant to be watched.

── How it works ──────────────────────────────────────────────────────────────
We attempt an RFCOMM connect to the phone's bonded classic-Bluetooth address.
The phone almost certainly has no service listening on the channel, so the
connect is expected to FAIL either way. The presence signal is *how* it fails:

    in range   → the radio answers, its RFCOMM layer rejects the channel
                 → ConnectionRefusedError / WinError 10061      → PRESENT
    out of range → nothing answers the page attempt
                 → TimeoutError / 10060 / unreachable 10051     → ABSENT

So the rule is: anything that is NOT a timeout/unreachable counts as present.

Classic BT is used rather than BLE deliberately — Android rotates its BLE
advertising address every ~15 min, so a BLE scan can't track a phone. The
bonded classic address is stable.

── What this spike must establish before any integration work ────────────────
 1. That in-range and out-of-range produce cleanly separable classifications.
 2. The actual timing split between them (sets the production timeout).
 3. THAT PROBING RAISES NO PROMPT, NOTIFICATION, OR SOUND ON THE PHONE.
    Watch the phone's screen and notification shade for the whole of step 1.
 4. That it doesn't disrupt Bluetooth audio or auto-connect anything.
 5. That it still works with the phone's screen off and in a pocket.

Suggested protocol — run each and record the output:
    1. phone on the desk, screen off      → expect a stable PRESENT
    2. phone at the far end of the house  → expect a stable ABSENT
    3. walk back                          → expect a prompt flip to PRESENT
    4. phone Bluetooth turned off         → expect ABSENT

If steps 1 and 2 don't separate cleanly, stop — the approach needs rethinking
before anything gets built on it.
"""
import argparse
import re
import socket
import sys
import time
import winreg
from datetime import datetime

# Winsock errors that mean "nothing answered" — the device is out of range,
# powered off, or has its radio disabled.
_ABSENT_ERRNOS = {
    10060,  # WSAETIMEDOUT   — page attempt got no response
    10051,  # WSAENETUNREACH — no route to the radio at all
    10064,  # WSAEHOSTDOWN
    10065,  # WSAEHOSTUNREACH
}


def normalize_mac(raw: str) -> str | None:
    """'5879e0a6c785' | '58:79:E0:A6:C7:85' | '58-79-...' → '58:79:E0:A6:C7:85'."""
    hex_only = re.sub(r"[^0-9A-Fa-f]", "", raw or "")
    if len(hex_only) != 12:
        return None
    hex_only = hex_only.upper()
    return ":".join(hex_only[i:i + 2] for i in range(0, 12, 2))


def list_bonded_devices() -> list[tuple[str, str]]:
    """
    Bonded classic-BT devices, read straight from the registry.

    winreg is stdlib, needs no admin, and — unlike shelling out to PowerShell —
    can't flash a console window when called from the windowless agent later.
    Subkeys look like 'Dev_5879E0A6C785'; sibling service-class GUID keys
    ('{0000110b-...}') are filtered out by the pattern.
    """
    devices: list[tuple[str, str]] = []
    base = r"SYSTEM\CurrentControlSet\Enum\BTHENUM"
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base) as root:
            for i in range(winreg.QueryInfoKey(root)[0]):
                key_name = winreg.EnumKey(root, i)
                match = re.fullmatch(r"Dev_([0-9A-Fa-f]{12})", key_name)
                if not match:
                    continue
                mac = normalize_mac(match.group(1))
                name = ""
                try:
                    with winreg.OpenKey(root, key_name) as dev_key:
                        for j in range(winreg.QueryInfoKey(dev_key)[0]):
                            inst = winreg.EnumKey(dev_key, j)
                            with winreg.OpenKey(dev_key, inst) as inst_key:
                                try:
                                    name = winreg.QueryValueEx(inst_key, "FriendlyName")[0]
                                    break
                                except FileNotFoundError:
                                    continue
                except OSError:
                    pass
                if mac:
                    devices.append((mac, name or "(unnamed)"))
    except OSError as exc:
        print(f"  ! could not read {base}: {exc}", file=sys.stderr)
    return sorted(devices, key=lambda d: d[1].lower())


# A response arriving this fast cannot have involved a failed page attempt —
# the radio answered, so the device is in range regardless of which error the
# stack chose to report. Measured on this hardware: an in-range rejection
# comes back in 0.01-0.30s, while an out-of-range page runs to the full
# timeout. Anything in between is genuinely ambiguous and treated as absent,
# which is the safe direction for a lock.
_FAST_RESPONSE_SECS = 1.0


def probe_once(mac: str, channel: int, timeout: float) -> tuple[bool, str, float]:
    """
    One presence probe.

    Returns (present, classification, elapsed_secs).

    Presence is decided by whether the remote radio *answered*, not by whether
    the connect succeeded:
      - connected                     → present (a service accepted)
      - refused                       → present (radio answered, declined)
      - any error, answered fast      → present (see _FAST_RESPONSE_SECS)
      - timeout / slow error          → absent  (nothing answered the page)
    """
    started = time.perf_counter()
    sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
    try:
        sock.settimeout(timeout)
        sock.connect((mac, channel))
        return True, "connected", time.perf_counter() - started
    except TimeoutError:
        return False, "timeout", time.perf_counter() - started
    except ConnectionRefusedError:
        # The remote radio answered and declined the channel — it's in range.
        return True, "refused", time.perf_counter() - started
    except OSError as exc:
        elapsed = time.perf_counter() - started
        code = getattr(exc, "winerror", None) or exc.errno
        if elapsed < _FAST_RESPONSE_SECS:
            return True, f"fast-reject({code})", elapsed
        if code in _ABSENT_ERRNOS:
            label = "unreachable" if code != 10060 else "timeout"
            return False, f"{label}({code})", elapsed
        return False, f"error:{code}", elapsed
    finally:
        try:
            sock.close()
        except OSError:
            pass


def scan_channels(mac: str, timeout: float, upto: int = 10) -> None:
    print(f"\nProbing channels 1..{upto} once each — pick the quietest for production.\n")
    for channel in range(1, upto + 1):
        present, classification, elapsed = probe_once(mac, channel, timeout)
        verdict = "PRESENT" if present else "ABSENT "
        print(f"  channel {channel:>2}  {verdict}  {classification:<18} {elapsed:6.2f}s")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mac", help="Target device MAC (any separator style)")
    parser.add_argument("--channel", type=int, default=7, help="RFCOMM channel (default: 7 — the one that answers on this phone)")
    parser.add_argument("--timeout", type=float, default=4.0, help="Per-probe timeout in seconds (default: 4.0)")
    parser.add_argument("--interval", type=float, default=10.0, help="Seconds between probes (default: 10)")
    parser.add_argument("--count", type=int, default=0, help="Number of probes; 0 = until Ctrl+C (default: 0)")
    parser.add_argument("--list", action="store_true", help="List bonded devices and exit")
    parser.add_argument("--scan-channels", action="store_true", help="Probe channels 1-10 once each and exit")
    args = parser.parse_args()

    if args.list or not args.mac:
        print("\nBonded Bluetooth devices:\n")
        for mac, name in list_bonded_devices():
            print(f"  {mac}   {name}")
        if not args.mac:
            print("\nRe-run with --mac <address> to start probing.")
        return

    mac = normalize_mac(args.mac)
    if not mac:
        parser.error(f"'{args.mac}' is not a 12-hex-digit Bluetooth address")

    if args.scan_channels:
        scan_channels(mac, args.timeout)
        return

    print(f"\nProbing {mac} on RFCOMM channel {args.channel} "
          f"(timeout {args.timeout}s, every {args.interval}s). Ctrl+C to stop.")
    print(">>> WATCH THE PHONE'S SCREEN AND NOTIFICATION SHADE. Any prompt, toast,")
    print(">>> or sound is a finding that invalidates this approach.\n")
    print(f"  {'time':<10} {'verdict':<9} {'classification':<18} {'elapsed':>8}")
    print(f"  {'-' * 10} {'-' * 9} {'-' * 18} {'-' * 8}")

    tally: dict[str, int] = {}
    probes = 0
    try:
        while args.count == 0 or probes < args.count:
            present, classification, elapsed = probe_once(mac, args.channel, args.timeout)
            tally[classification] = tally.get(classification, 0) + 1
            probes += 1
            stamp = datetime.now().strftime("%H:%M:%S")
            verdict = "PRESENT" if present else "ABSENT"
            print(f"  {stamp:<10} {verdict:<9} {classification:<18} {elapsed:7.2f}s")
            if args.count == 0 or probes < args.count:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n  (stopped)")

    print(f"\nSummary of {probes} probe(s):")
    for classification, n in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {classification:<20} {n:>4}")
    print("\nRecord these classifications and timings for each phone position — "
          "in-range and out-of-range must be cleanly separable.\n")


if __name__ == "__main__":
    main()
