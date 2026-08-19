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
