# Tether — Remote Laptop Control App

Control your laptop's settings and state remotely from your phone.

---

## Architecture

```
[React Native App] <--HTTPS/WSS--> [Tailscale mesh] <--> [FastAPI agent on laptop]
                                                              |
                                                    OS command layer (subprocess/PowerShell/AppleScript)
```

**Stack choices:**
- **Laptop agent**: FastAPI (lighter than Django for a background service, async-native for websockets) running as a system service/daemon
- **Mobile app**: React Native (Expo)
- **Connectivity**: Tailscale for cross-network access (zero port forwarding, WireGuard-based, free tier is enough), fallback to local IP when on same wifi
- **Auth**: JWT with short-lived access tokens + refresh token, laptop as the issuer
- **Real-time channel**: WebSocket for status pushes (battery, lock state, notifications), REST for one-shot commands

---

## Core Workflows

### 1. Pairing (first-time setup)
- Laptop agent generates a pairing code/QR containing `{laptop_id, pairing_token, tailscale_ip}`
- Phone scans QR → exchanges pairing_token for a long-lived JWT refresh token via a one-time `/pair` endpoint
- Laptop stores the paired device's public key (or device ID) in a local SQLite file — this becomes the trusted device list

### 2. Auth workflow
- Phone requests `/auth/refresh` on app launch → gets short-lived (15 min) access token
- Every command endpoint validates the access token
- Laptop-side: reject any request not from a Tailscale IP in the paired-device range (defense in depth beyond JWT)

### 3. Command execution workflow
- Phone sends `POST /commands/{action}` with JWT in header
- Agent validates → maps action to OS call → returns result (success/failure + optional payload like a screenshot)
- Log every executed command locally on laptop (audit trail)

**Example endpoint-to-OS mapping:**

| Endpoint | Windows | Linux |
|---|---|---|
| `/lock` | `rundll32.exe user32.dll,LockWorkStation` | `loginctl lock-session` |
| `/sleep` | `powercfg /hibernate off && shutdown /h` | `systemctl suspend` |
| `/volume/{level}` | `nircmd setsysvolume` or `pycaw` | `pactl set-sink-volume` |
| `/wifi/toggle` | `netsh interface set interface` | `nmcli radio wifi` |
| `/screenshot` | `PIL.ImageGrab` | `scrot` / `gnome-screenshot` |

### 4. Real-time status workflow
- Laptop agent opens a WebSocket to a connected phone session
- Pushes periodic heartbeat (battery %, lock state, active app) every 5–10s
- Phone shows this as a live dashboard card

### 5. Offline/reconnection handling
- Phone caches last-known laptop state
- On reconnect, agent sends a full state sync
- Decide per-command whether to queue actions sent while laptop was unreachable (e.g. lock/unlock shouldn't queue, "run backup script" could)

### 6. Notification bridge workflow
- Laptop-side listener (native notification hooks per OS) forwards select notifications to phone via the websocket
- Phone can forward back (e.g., reply to a laptop Slack notification) — more complex, optional for v2

---

## Implementation Phases

1. **MVP (same-wifi only)** — FastAPI agent + 5 core commands (lock, sleep, volume, wifi toggle, screenshot) + basic RN app hitting local IP directly, no auth yet, just prove the loop works
2. **Auth + security** — JWT pairing flow, request validation, command audit log
3. **Remote access** — Tailscale integration so it works off home network
4. **Real-time layer** — WebSocket status dashboard, push notifications
5. **Polish** — Widget/quick-actions on phone lock screen, background service reliability (auto-restart agent on laptop boot)

---

## Feature Suggestions (beyond core control)

- **Proximity auto-lock** — use phone Bluetooth presence; when phone leaves BLE range of laptop, auto-lock
- **Clipboard sync** — push clipboard content between phone and laptop over the same channel
- **Remote terminal (scoped)** — locked-down shell where only whitelisted commands run (not arbitrary `exec`), e.g. trigger `git pull` or restart a dev server from phone
- **Voice control** — reuse Gemini Live API integration pattern (as in Tappy Live) to say "lock my laptop" and hit the same command endpoint
- **Scheduled/conditional actions** — "sleep laptop at 1 AM if idle," "mute volume during a calendar meeting" — small rules engine on the agent side
- **File quick-send** — drag a file from laptop into a "send to phone" queue, or vice versa, over the same tunnel
- **Macro chains** — bundle multiple commands into one button (e.g. "Presentation Mode" = mute + close background apps + set volume to 50%)
- **Multi-device dashboard** — pair with multiple laptops (home + work) and switch context in-app

---

## Security Notes
- Never expose the agent directly to the open internet — Tailscale (or an equivalent private mesh) is a hard requirement, not optional
- Rotate JWT signing secret periodically; short-lived access tokens only
- Maintain a local audit log of all executed commands, with timestamps and source device ID
- Support remote de-pairing (revoke a lost/stolen phone's access from the laptop side)
