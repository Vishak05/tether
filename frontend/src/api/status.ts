import client from './client';
import type { StatusResponse } from '../types/api';

export async function fetchStatus(): Promise<StatusResponse> {
  const { data } = await client.get<StatusResponse>('/status');
  return data;
}
