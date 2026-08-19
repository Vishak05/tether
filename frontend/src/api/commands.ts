import client from './client';
import type {
  BrightnessResult,
  CommandResponse,
  MediaResult,
  ScreenshotResult,
  VolumeResult,
  WifiResult,
} from '../types/api';

export async function lock(): Promise<CommandResponse> {
  const { data } = await client.post<CommandResponse>('/commands/lock');
  return data;
}

export async function sleep(): Promise<CommandResponse> {
  const { data } = await client.post<CommandResponse>('/commands/sleep');
  return data;
}

export async function restart(): Promise<CommandResponse> {
  const { data } = await client.post<CommandResponse>('/commands/restart');
  return data;
}

export async function shutdown(): Promise<CommandResponse> {
  const { data } = await client.post<CommandResponse>('/commands/shutdown');
  return data;
}

export async function setVolume(level: number): Promise<CommandResponse<VolumeResult>> {
  const { data } = await client.post<CommandResponse<VolumeResult>>('/commands/volume', { level });
  return data;
}

export async function toggleWifi(enable: boolean | null = null): Promise<CommandResponse<WifiResult>> {
  const { data } = await client.post<CommandResponse<WifiResult>>('/commands/wifi', { enable });
  return data;
}

export async function takeScreenshot(): Promise<CommandResponse<ScreenshotResult>> {
  const { data } = await client.get<CommandResponse<ScreenshotResult>>('/commands/screenshot');
  return data;
}

export type MediaAction = 'play_pause' | 'next' | 'previous' | 'stop';

export async function sendMediaKey(action: MediaAction): Promise<CommandResponse<MediaResult>> {
  const { data } = await client.post<CommandResponse<MediaResult>>('/commands/media', { action });
  return data;
}

export async function getBrightness(): Promise<CommandResponse<BrightnessResult>> {
  const { data } = await client.get<CommandResponse<BrightnessResult>>('/commands/brightness');
  return data;
}

export async function setBrightness(level: number): Promise<CommandResponse<BrightnessResult>> {
  const { data } = await client.post<CommandResponse<BrightnessResult>>('/commands/brightness', { level });
  return data;
}
