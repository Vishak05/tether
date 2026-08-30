"""
Tether — Bluetooth presence probe SPIKE #2: SDP service query (WinRT)

Replaces the RFCOMM approach in spike_bt_probe.py, which is RULED OUT.

    C:\\Python314\\python.exe agent\\scripts\\spike_sdp_probe.py --mac 58:79:E0:A6:C7:85

── Why the first approach failed ─────────────────────────────────────────────
spike_bt_probe.py opened an RFCOMM connection to a channel and read presence
off how the connect failed. On this phone, measured:

    channels 1-5, 10  → never answer (timeout), even with the phone on the desk
    channel 6         → connects, but raises a MESSAGES ACCESS prompt (MAP)
    channel 7         → connects, but raises a SIM ACCESS prompt (SAP)
    channels 8, 9     → only answer while another profile already holds the
                        baseband link; standalone they time out

So the only channels that answer are backed by a real profile, and profiles
ask permission. There is no silent channel to find. Presence-by-connecting is
a dead end here.

── Why SDP works instead ─────────────────────────────────────────────────────
An SDP query asks the phone to *enumerate* its services rather than connecting
to one. It needs a baseband link — which is the presence signal we want — but
engages no profile, so there is nothing for Android to prompt about. This is
"ask what's there", not "knock on a door".

BluetoothCacheMode.UNCACHED is essential: the cached mode answers instantly
from Windows' stored SDP records and would report a phone that's been in
another country for a week as present. Uncached forces a live query.

Note that BluetoothDevice.connection_status is NOT usable for this. It reads
DISCONNECTED for a bonded-but-idle phone whether it's in your pocket or on
another continent — measured on this phone while it sat next to the laptop.

Classic Bluetooth, not BLE: Android rotates its BLE advertising address every
~15 min, while the bonded classic address is stable.

── What this spike must still establish ──────────────────────────────────────
 1. NO PROMPT on the phone. Expected, since no profile is engaged, but the
    first approach's whole failure was an unexpected prompt — verify, don't
    assume.
 2. Out-of-range produces a clean, clearly different result from in-range.
 3. It still works with the phone's screen off and in a pocket.
 4. It doesn't disturb Bluetooth audio.

Protocol — run each and record the output:
    1. phone on the desk, screen off      → expect stable PRESENT
    2. phone at the far end of the house  → expect stable ABSENT
    3. walk back                          → expect a prompt flip to PRESENT
    4. phone Bluetooth off                → expect ABSENT
"""
import argparse
import asyncio
import re
import time
from datetime import datetime

import winrt.windows.devices.bluetooth as bt


def normalize_mac(raw: str) -> int | None:
    """'58:79:E0:A6:C7:85' or '5879E0A6C785' -> the UInt64 WinRT expects."""
    hex_only = re.sub(r"[^0-9A-Fa-f]", "", raw or "")
    if len(hex_only) != 12:
        return None
    return int(hex_only, 16)


async def probe_once(address: int, timeout: float) -> tuple[bool, str, float]:
    """
    One presence probe via an uncached SDP service enumeration.

    Returns (present, classification, elapsed_secs).

    A live SDP response means the radio answered, so the device is in range.
    An empty list or an error means it didn't.
    """
    started = time.perf_counter()
    try:
        device = await asyncio.wait_for(
            bt.BluetoothDevice.from_bluetooth_address_async(address), timeout
        )
        if device is None:
            return False, "unknown-device", time.perf_counter() - started

        result = await asyncio.wait_for(
            device.get_rfcomm_services_with_cache_mode_async(
                bt.BluetoothCacheMode.UNCACHED
            ),
            timeout,
        )
        count = len(result.services)
        elapsed = time.perf_counter() - started
        if count > 0:
            return True, f"sdp:{count}-services", elapsed
        return False, "sdp:empty", elapsed
    except TimeoutError:
        return False, "timeout", time.perf_counter() - started
    except OSError as exc:
        code = getattr(exc, "winerror", None) or exc.errno
        return False, f"error:{code}", time.perf_counter() - started
    except Exception as exc:  # WinRT surfaces its own error types
        return False, f"{type(exc).__name__}", time.perf_counter() - started


async def run(address: int, timeout: float, interval: float, count: int, delay: float) -> None:
    # Lets the operator get clear of the room before the first probe, so the
    # opening readings aren't just "still walking out and genuinely in range".
    if delay > 0:
        print(f"  Waiting {delay:.0f}s before the first probe — walk away now.")
        for remaining in range(int(delay), 0, -1):
            print(f"\r  starting in {remaining:>3}s ", end="", flush=True)
            await asyncio.sleep(1)
        print("\r" + " " * 30 + "\r", end="", flush=True)
        print("  Probing.\n")

    print(f"  {'time':<10} {'verdict':<9} {'classification':<20} {'elapsed':>8}")
    print(f"  {'-' * 10} {'-' * 9} {'-' * 20} {'-' * 8}")

    tally: dict[str, int] = {}
    probes = 0
    try:
        while count == 0 or probes < count:
            present, classification, elapsed = await probe_once(address, timeout)
            tally[classification] = tally.get(classification, 0) + 1
            probes += 1
            stamp = datetime.now().strftime("%H:%M:%S")
            verdict = "PRESENT" if present else "ABSENT"
            print(f"  {stamp:<10} {verdict:<9} {classification:<20} {elapsed:7.2f}s")
            if count == 0 or probes < count:
                await asyncio.sleep(interval)
    except KeyboardInterrupt:
        print("\n  (stopped)")

    print(f"\nSummary of {probes} probe(s):")
    for classification, n in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {classification:<22} {n:>4}")


def main() -> None:
    # Plain-ASCII description rather than __doc__: the Windows console is
    # cp1252, and the docstring's box-drawing characters raise
    # UnicodeEncodeError when argparse prints --help.
    parser = argparse.ArgumentParser(
        description="Bluetooth presence probe via uncached SDP service query. "
                    "See the module docstring for the full write-up.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--mac", required=True, help="Target device MAC (any separator style)")
    parser.add_argument("--timeout", type=float, default=8.0, help="Per-probe timeout (default: 8)")
    parser.add_argument("--interval", type=float, default=10.0, help="Seconds between probes (default: 10)")
    parser.add_argument("--count", type=int, default=0, help="Number of probes; 0 = until Ctrl+C")
    parser.add_argument("--delay", type=float, default=0.0,
                        help="Seconds to wait before the FIRST probe, so you can leave the room (default: 0)")
    args = parser.parse_args()

    address = normalize_mac(args.mac)
    if address is None:
        parser.error(f"'{args.mac}' is not a 12-hex-digit Bluetooth address")

    print(f"\nSDP-probing {args.mac} (timeout {args.timeout}s, every {args.interval}s). Ctrl+C to stop.")
    print(">>> Watch the phone. No prompt is expected — SDP engages no profile —")
    print(">>> but the RFCOMM approach failed on exactly this, so check.\n")
    asyncio.run(run(address, args.timeout, args.interval, args.count, args.delay))


if __name__ == "__main__":
    main()
