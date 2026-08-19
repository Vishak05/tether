import client from './client';
import type { CommandResponse, ScreenshotResult, VolumeResult, WifiResult } from '../types/api';

export async function lock(): Promise<CommandResponse> {
  const { data } = await client.post<CommandResponse>('/commands/lock');
  return data;
}

export async function sleep(): Promise<CommandResponse> {
  const { data } = await client.post<CommandResponse>('/commands/sleep');
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
