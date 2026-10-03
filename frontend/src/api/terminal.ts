import client, { getApiBaseUrl } from './client';
import type { TerminalState } from '../types/api';

// The terminal itself runs in a page the agent serves (agent/static/terminal),
// shown in a WebView — these calls only cover access state and sessions.

/** Same rule the agent applies (agent/os_layer/wsl_tmux.py SESSION_NAME_RE). */
export const SESSION_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

export async function fetchTerminal(): Promise<TerminalState> {
  const { data } = await client.get<TerminalState>('/terminal');
  return data;
}

export async function killTerminalSession(name: string): Promise<void> {
  await client.delete(`/terminal/sessions/${encodeURIComponent(name)}`);
}

export function terminalPageUrl(session: string): string {
  return `${getApiBaseUrl()}/terminal/page?session=${encodeURIComponent(session)}`;
}
