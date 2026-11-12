import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { fromUint32, nextFreeIp, overlaps, parseCidr, toUint32 } from './ipv4.ts';

describe('ipv4', () => {
  it('parses 192.168.1.0/24 to first .1 last .254 broadcast .255', () => {
    const c = parseCidr('192.168.1.0/24');
    expect(fromUint32(c.firstHost)).toBe('192.168.1.1');
    expect(fromUint32(c.lastHost)).toBe('192.168.1.254');
    expect(fromUint32(c.broadcast)).toBe('192.168.1.255');
  });

  it('rejects 192.168.1.5/24 as non-network address', () => {
    expect(() => parseCidr('192.168.1.5/24')).toThrow(/not a network address/);
  });

  it('overlaps detects 10.0.0.0/8 vs 10.20.0.0/24', () => {
    expect(overlaps('10.0.0.0/8', '10.20.0.0/24')).toBe(true);
    expect(overlaps('10.0.0.0/8', '11.0.0.0/8')).toBe(false);
  });

  it('nextFree skips gateway, dhcp range and used', () => {
    const ip = nextFreeIp('192.168.1.0/24', {
      gateway: '192.168.1.1',
      dhcpRange: { start: '192.168.1.100', end: '192.168.1.199' },
      used: ['192.168.1.2'],
    });
    expect(ip).toBe('192.168.1.3');
  });

  it('nextFree returns null when exhausted', () => {
    const ip = nextFreeIp('10.0.0.0/30', {
      gateway: '10.0.0.1',
      used: ['10.0.0.2'],
    });
    expect(ip).toBe(null);
  });

  it('property: toUint32(fromUint32(n)) === n', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (n) => {
        expect(toUint32(fromUint32(n))).toBe(n >>> 0);
      }),
    );
  });
});
