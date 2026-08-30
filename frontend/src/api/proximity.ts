import client from './client';
import type {
  BondedListResponse,
  ProximityState,
  UpdateProximityBody,
} from '../types/api';

// Proximity auto-lock runs entirely on the laptop — these endpoints configure
// it and report what it currently sees. Nothing here needs to be running for
// the lock itself to work.

export async function fetchProximity(): Promise<ProximityState> {
  const { data } = await client.get<ProximityState>('/proximity');
  return data;
}

export async function updateProximity(body: UpdateProximityBody): Promise<ProximityState> {
  const { data } = await client.patch<ProximityState>('/proximity', body);
  return data;
}

export async function fetchBondedDevices(): Promise<BondedListResponse> {
  const { data } = await client.get<BondedListResponse>('/proximity/bonded');
  return data;
}
