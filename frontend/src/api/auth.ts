import client from './client';
import type { PairCodeResponse, PairRequest, PairResponse } from '../types/api';

export async function fetchPairCode(): Promise<PairCodeResponse> {
  const { data } = await client.get<PairCodeResponse>('/pair');
  return data;
}

export async function pairDevice(request: PairRequest): Promise<PairResponse> {
  const { data } = await client.post<PairResponse>('/auth/pair', request);
  return data;
}

export async function revokeSelf(): Promise<void> {
  await client.post('/auth/revoke');
}
