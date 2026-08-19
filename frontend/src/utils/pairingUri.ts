// Parses the tether://pair?token=<token>&laptop_id=<id> URI encoded in the
// agent's /pair QR code. Avoids relying on the URL global (inconsistent across
// RN/Hermes versions) — a plain query-string split is enough for this shape.
export function parseTetherPairingUri(raw: string): { token: string; laptopId: string | null } | null {
  const match = raw.match(/^tether:\/\/pair\?(.+)$/);
  if (!match) return null;

  const params = new Map<string, string>();
  for (const pair of match[1].split('&')) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) params.set(key, decodeURIComponent(value));
  }

  const token = params.get('token');
  if (!token) return null;
  return { token, laptopId: params.get('laptop_id') ?? null };
}
