# Tether — Remote Laptop Control

Control your Windows laptop from your phone: lock it, put it to sleep,
adjust volume, toggle Wi-Fi, grab a screenshot, and watch a live status
dashboard (battery, active window, lock state) — from the same room or from
anywhere, over Tailscale.

This guide is for **using** the app. If you're looking for implementation
details, see `tether-app-plan.md` and the `docs/phaseN_summary.md` files.

---

## How it works, in short

```
[Phone app] <--HTTPS/WSS--> [Tailscale mesh, or same WiFi] <--> [Agent running on your laptop]
```

- **The agent** is a small Python service that runs on your laptop and does
  the actual work (locking the screen, changing volume, etc.).
- **The phone app** is what you tap buttons on. It talks to the agent over
  the network.
- The two only work together while **the agent is running** on your laptop.
  Nothing happens on the laptop side until you start it (or set it to
  auto-start — see below).

---

## 1. One-time setup — the laptop (agent)

### Requirements
- Windows 10/11.
- Python (this project was built/tested against **Python 3.14** specifically —
  other versions may be missing dependencies; see Troubleshooting below).

### Install and run

```powershell
cd tether
py -3.14 -m pip install -r agent/requirements.txt
py -3.14 run.py
```

You should see a banner and a line like:

```
Uvicorn running on http://0.0.0.0:8765
```

Leave this running — the agent needs to stay open for the phone app to work.
Open `http://127.0.0.1:8765/docs` in a browser on the laptop to confirm it's
alive (an interactive API page should load).

### Make it start automatically (recommended)

Instead of manually running `run.py` every time, register it as a Windows
Scheduled Task that starts at login and restarts itself if it ever crashes:

```powershell
cd tether
.\agent\scripts\install_task.ps1
```

No admin rights needed. This replaces the manual `run.py` step above — once
installed, the agent just runs in the background from now on. To remove it
later: `.\agent\scripts\uninstall_task.ps1`.

---

## 2. One-time setup — the phone app

The Android app isn't on an app store — you build and install it yourself.
**Expo Go (the generic testing app) does not currently support this
project's SDK version**, so you need a one-time custom build instead — it's
a normal-looking app icon on your phone afterward, same as any other app.

From the `frontend/` folder:

```powershell
cd frontend
npm install
npx eas-cli login          # free Expo account, one-time
npx eas-cli build:configure
```

Then pick **one** of these, depending on how you plan to use it:

- **Just want to use the app day-to-day** (recommended): build a standalone
  APK with the JS bundled in. No dev server ever needs to be running —
  it behaves like any other installed app.
  ```powershell
  npx eas-cli build --profile preview --platform android
  ```
- **Actively developing/changing the app's code**: build a dev-client APK,
  then run Metro (`npx expo start --dev-client`) every time you want the
  app to load JS. Rebuilding isn't required for JS changes — Metro serves
  them live — but Metro's dev server has to be running on your laptop for
  the app to load at all; a blank screen almost always means it isn't.
  ```powershell
  npx eas-cli build --profile development --platform android
  ```

Either way, the build runs in the cloud (~10–15 min) and gives you a
link/QR code to download an installable APK straight to your phone — no
Play Store, no cable. Allow "install from unknown sources" once when prompted.

---

## 3. Pairing your phone with the laptop

The app needs to be told which laptop to talk to, and needs your permission
(a pairing code) before it can control it.

1. **On the laptop**, with the agent running, open a browser to:
   `http://127.0.0.1:8765/pair/view`
   This shows a QR code and the raw pairing code as text, valid for 5
   minutes (the page auto-refreshes with a fresh one once it expires — get
   a new one anytime with the "Get a new code now" link).

2. **On the phone**, open the app:
   - **Connect screen**: enter your laptop's address. Find it on the laptop
     via `ipconfig` (look for "IPv4 Address" under your WiFi adapter) — e.g.
     `192.168.1.42:8765`. (For remote/Tailscale access, see section 5 instead.)
   - **Pair screen**: either tap **Scan QR code** and point the camera at
     the laptop's screen, or tap **Enter code manually** and type/paste the
     code shown under the QR. Give the phone a name and submit.

You're now paired — the app remembers this laptop and won't ask again.

(There's also a raw `GET /pair` JSON endpoint the phone/other tools can call
directly — `/pair/view` above is just a human-friendly page wrapped around
the same thing, for scanning from a browser.)

---

## 4. Using the app

- **Dashboard** — the main screen:
  - Live status card: battery %, charging state, lock state, active window,
    with a "Live" badge when the real-time connection is active.
  - **Lock** / **Sleep** buttons.
  - **Volume** stepper (±10%).
  - **Toggle Wi-Fi** button.
  - **Take Screenshot** — captures and displays the laptop's screen.
- **Devices** tab — see every phone that's ever been paired, and revoke
  access for any of them (e.g. a lost phone) with one tap.
- **Settings** tab — change the laptop's address, or log out.

---

## 5. Using it from anywhere (not just home WiFi)

By default, only devices on the same WiFi network as the laptop can reach
the agent — plus **Tailscale**, a private mesh VPN, which is what makes
"from anywhere" possible without exposing your laptop to the open internet.

1. Install [Tailscale](https://tailscale.com) on **both** the laptop and the
   phone, and sign into the same account on both.
2. On the laptop, run `tailscale ip` to get its Tailscale address (looks
   like `100.x.x.x`).
3. In the phone app's **Settings**, change the laptop address to that
   Tailscale IP instead of the local WiFi IP.

Now the phone can reach the laptop over Tailscale's encrypted tunnel from
any network, anywhere — home WiFi, cellular data, another country. The
agent only accepts connections from Tailscale (or localhost) by default;
plain open-internet requests are rejected.

---

## 6. Troubleshooting

**"Network error" when pairing or using the app**
Check, in order: is the agent actually running? Is the address you entered
correct (not `127.0.0.1` — that only means "this device")? Are the phone and
laptop on the same WiFi (or both on Tailscale)?

**"Invalid or expired pairing token"**
Pairing tokens are one-time-use and expire after 5 minutes. Get a fresh one
from `http://127.0.0.1:8765/pair/view` and use it right away.

**The app opens to a blank screen (dev-client builds only)**
This means the app can't reach Metro, not a bug in a specific screen — dev-client
builds have no JS bundled in and load it live from your laptop. Make sure
`npx expo start --dev-client` is running in a terminal, and that the phone
is on the same WiFi network as the laptop it's running from. If you don't
want this dependency at all, build a standalone `preview` APK instead (see
section 2) — it has the JS bundled in and never needs Metro running.

**"Network error" specifically on a standalone (`preview`/`production`) build, when a dev-client build worked fine**
Android blocks plain `http://` traffic by default on release builds (since
Android 9) — the agent doesn't use HTTPS, so every request would silently
fail. Dev-client builds don't hit this because debug builds are exempt by
default. Fixed via `expo-build-properties`'s `usesCleartextTraffic: true` in
`app.json` — if you're on a build from before this was added, rebuild:
`npx eas-cli build --profile preview --platform android`.

**`ModuleNotFoundError: No module named 'uvicorn'` (or similar) when running `run.py`**
You're running a different Python than the one the dependencies were
installed for. Use `py -3.14 run.py` specifically, or reinstall
dependencies for whichever `python` your terminal defaults to:
`python -m pip install -r agent/requirements.txt`.

**Requests get rejected with 403 "Forbidden: source IP not on Tailscale network or private LAN"**
The agent accepts connections from Tailscale, plain private WiFi/LAN
(192.168.x.x, 10.x.x.x, 172.16-31.x.x), or localhost — same-WiFi access
should just work without Tailscale. If you're still seeing this, either the
phone's actual source IP isn't in one of those ranges (uncommon home
networks, VPNs active on the phone, or corporate/guest WiFi with client
isolation), or you're on an older build predating this — restart the agent
to pick up the latest code. As a last resort for debugging, you can disable
the filter entirely:
```powershell
$env:TETHER_IP_FILTER_ENABLED = "false"
py -3.14 run.py
```
(if running via the scheduled task instead, edit the task's action to set
this environment variable, or temporarily run `run.py` directly instead).

**Nothing responds on the laptop's LAN IP from another device, but `127.0.0.1` works fine**
Windows Firewall is likely blocking the inbound connection the first time.
Run this once in an **elevated** PowerShell:
```powershell
New-NetFirewallRule -DisplayName "Tether Agent" -Direction Inbound -Protocol TCP -LocalPort 8765 -Action Allow
```

**The agent seems to be running an old/stale version, or a port won't free up**
If you've ever run `run.py` directly (which uses hot-reload for development),
a crashed or killed process can occasionally leave an orphaned background
worker still holding the port, invisible to Task Manager under the PID you'd
expect. Check what's really listening with:
```powershell
Get-NetTCPConnection -LocalPort 8765 -State Listen
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Select ProcessId, CommandLine
```
and stop the process shown. This is specific to `run.py`'s dev/reload mode —
the scheduled task (section 1) doesn't use reload and doesn't have this issue.

---

## Security notes

- Never expose the agent to the open internet directly — Tailscale (or an
  equivalent private mesh) is a hard requirement for remote access, not
  optional.
- Every paired device gets its own long-lived credential; revoke any device
  individually from the **Devices** tab at any time.
- Every command the agent executes is logged locally (device, timestamp,
  success/failure) for your own audit trail.
