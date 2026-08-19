import { parseTetherPairingUri } from '../pairingUri';

describe('parseTetherPairingUri', () => {
  it('parses token and laptop_id from a valid pairing URI', () => {
    const result = parseTetherPairingUri('tether://pair?token=abc123&laptop_id=DESKTOP-XYZ');
    expect(result).toEqual({ token: 'abc123', laptopId: 'DESKTOP-XYZ' });
  });

  it('returns a null laptopId when the URI omits laptop_id', () => {
    const result = parseTetherPairingUri('tether://pair?token=abc123');
    expect(result).toEqual({ token: 'abc123', laptopId: null });
  });

  it('decodes percent-encoded values', () => {
    const result = parseTetherPairingUri('tether://pair?token=abc%2Bxyz&laptop_id=My%20Laptop');
    expect(result).toEqual({ token: 'abc+xyz', laptopId: 'My Laptop' });
  });

  it('returns null for a non-tether URI', () => {
    expect(parseTetherPairingUri('https://example.com')).toBeNull();
  });

  it('returns null when the token param is missing', () => {
    expect(parseTetherPairingUri('tether://pair?laptop_id=DESKTOP-XYZ')).toBeNull();
  });
});
