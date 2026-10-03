"""
Tether Agent — Remote Terminal Access (run on the laptop)

The remote terminal gives a paired phone a shell as you, so it's switched on
and granted per device from here rather than from the app. A stolen phone can
use the terminal only if you already allowed it, and it can't allow itself.

    py -3.14 -m agent.scripts.terminal_access status
    py -3.14 -m agent.scripts.terminal_access enable
    py -3.14 -m agent.scripts.terminal_access allow "Pixel 8"
    py -3.14 -m agent.scripts.terminal_access deny "Pixel 8"
    py -3.14 -m agent.scripts.terminal_access disable

A device can be named by its name (as shown in the app's Devices tab) or by
the start of its id. Changes apply immediately; open sessions from a phone
that loses access are cut off within TERMINAL_RECHECK_SECS.

Run from the repo root.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from agent.core import db, terminal


def _find_device(query: str) -> dict:
    devices = db.get_active_devices()
    q = query.strip()
    matches = [d for d in devices if d["id"] == q]
    if not matches:
        matches = [d for d in devices if d["name"].casefold() == q.casefold()]
    if not matches and len(q) >= 4:
        matches = [d for d in devices if d["id"].startswith(q)]

    if len(matches) == 1:
        return matches[0]
    if not matches:
        sys.exit(f"No paired device matches {query!r}. Run 'status' to list them.")
    listing = "\n".join(f"  {d['id']}  {d['name']}" for d in matches)
    sys.exit(f"{query!r} matches more than one device; use its id instead:\n{listing}")


def _status() -> None:
    access = terminal.get_access()
    print(f"Remote terminal: {'ON' if access.enabled else 'off'}")
    devices = db.get_active_devices()
    if not devices:
        print("No paired devices.")
        return
    print("\nPaired devices:")
    for d in devices:
        mark = "allowed" if d["id"] in access.allowed_devices else "-"
        print(f"  [{mark:^7}]  {d['name']:<24}  {d['id']}")
    if access.enabled and not any(d["id"] in access.allowed_devices for d in devices):
        print("\nNo device is allowed yet; use 'allow <device>'.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Control access to Tether's remote terminal.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="show whether it's on and which devices are allowed")
    sub.add_parser("enable", help="turn the remote terminal on")
    sub.add_parser("disable", help="turn it off (cuts off open sessions)")
    allow = sub.add_parser("allow", help="let a paired device use it")
    allow.add_argument("device", help="device name or id")
    deny = sub.add_parser("deny", help="stop a device using it (cuts off its open sessions)")
    deny.add_argument("device", help="device name or id")
    args = parser.parse_args()

    db.init_db()

    if args.command == "enable":
        terminal.set_enabled(True)
        print("Remote terminal turned ON.")
    elif args.command == "disable":
        terminal.set_enabled(False)
        print("Remote terminal turned off.")
    elif args.command == "allow":
        device = _find_device(args.device)
        terminal.allow_device(device["id"])
        print(f"Allowed {device['name']} ({device['id']}).")
    elif args.command == "deny":
        device = _find_device(args.device)
        terminal.deny_device(device["id"])
        print(f"Denied {device['name']} ({device['id']}).")

    print()
    _status()


if __name__ == "__main__":
    main()
