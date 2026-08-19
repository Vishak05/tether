import client from './client';
import type { DeviceListResponse } from '../types/api';

export async function listDevices(): Promise<DeviceListResponse> {
  const { data } = await client.get<DeviceListResponse>('/devices');
  return data;
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await client.delete(`/devices/${deviceId}`);
}
