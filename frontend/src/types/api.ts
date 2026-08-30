// Mirrors the Pydantic response/request models in agent/routes/*.py and agent/os_layer/windows.py

export interface PairCodeResponse {
  pairing_token: string;
  qr_data_url: string | null;
  expires_in: number;
  laptop_id: string;
}

export interface PairRequest {
  pairing_token: string;
  device_name: string;
}

export interface PairResponse {
  device_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface Device {
  id: string;
  name: string;
  paired_at: string;
  last_seen: string;
}

export interface DeviceListResponse {
  devices: Device[];
}

export interface CommandResponse<TResult = unknown> {
  ok: boolean;
  action: string;
  result: TResult | null;
  error: string | null;
}

export interface VolumeResult {
  volume: number;
  method?: string;
}

export interface WifiResult {
  wifi: string;
  interface: string;
}

export interface ScreenshotResult {
  format: string;
  width: number;
  height: number;
  data_base64: string;
}

export interface BatteryState {
  percent: number;
  charging: boolean;
  time_left_secs: number | null;
}

export interface ActiveWindowState {
  title: string;
  process: string;
  pid: number;
}

export interface SystemResources {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
}

export interface LaptopState {
  battery: BatteryState | null;
  active_window: ActiveWindowState | null;
  locked: boolean;
  system: SystemResources;
  idle_secs: number | null;
  // null when the laptop can't report it (no audio endpoint / no
  // brightness-capable display). The UI must disable the control rather than
  // substitute a default — inventing a value is what made the first volume
  // tap snap the laptop to a made-up level.
  volume: number | null;
  brightness: number | null;
}

// WS /ws/status heartbeat payload — same fields as LaptopState, flattened
// alongside a discriminator and timestamp (see agent/routes/ws_status.py).
export interface HeartbeatMessage {
  type: 'heartbeat';
  ts: string;
  battery: BatteryState | null;
  active_window: ActiveWindowState | null;
  locked: boolean;
  system: SystemResources;
  idle_secs: number | null;
  volume: number | null;
  brightness: number | null;
}

export interface MediaResult {
  action: string;
}

export interface BrightnessResult {
  brightness: number;
}

export interface StatusResponse {
  ok: boolean;
  laptop_id: string;
  platform: string;
  version: string;
  uptime_secs: number;
  state: LaptopState | null;
}

// ── Proximity auto-lock (agent-side) ────────────────────────────────────────
// Mirrors agent/routes/proximity.py. Detection runs on the laptop, so these
// are configuration and observation only — the feature keeps working with
// this app closed.

export interface ProximityState {
  enabled: boolean;
  target_mac: string | null;
  target_name: string | null;
  poll_interval_secs: number;
  miss_threshold: number;
  /** null until the agent's first probe completes */
  present: boolean | null;
  armed: boolean;
  consecutive_misses: number;
  last_probe_at: string | null;
  last_detail: string | null;
  last_lock_at: string | null;
  last_error: string | null;
  running: boolean;
}

export interface UpdateProximityBody {
  enabled?: boolean;
  target_mac?: string;
  target_name?: string;
  poll_interval_secs?: number;
  miss_threshold?: number;
}

export interface BondedDevice {
  mac: string;
  name: string;
}

export interface BondedListResponse {
  devices: BondedDevice[];
}

export interface ApiErrorBody {
  detail: string | { loc: (string | number)[]; msg: string; type: string }[];
}

export interface FileEntry {
  id: string;
  name: string;
  size_bytes: number;
  modified_at: number;
}

export interface FileListResponse {
  files: FileEntry[];
}
