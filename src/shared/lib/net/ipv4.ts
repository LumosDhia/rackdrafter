export class Ipv4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ipv4Error';
  }
}

const OCTET = /^(?:0|[1-9]\d{0,2})$/;

export function isIpv4(s: string): boolean {
  const parts = s.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!OCTET.test(p)) return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

export function parseIpv4(s: string): number {
  if (!isIpv4(s)) throw new Ipv4Error(`invalid IPv4: ${s}`);
  return toUint32(s);
}

export function toUint32(s: string): number {
  const parts = s.split('.');
  if (parts.length !== 4) throw new Ipv4Error(`invalid IPv4: ${s}`);
  let n = 0;
  for (const p of parts) {
    if (!OCTET.test(p)) throw new Ipv4Error(`invalid IPv4: ${s}`);
    const o = Number(p);
    if (o < 0 || o > 255) throw new Ipv4Error(`invalid IPv4: ${s}`);
    n = ((n << 8) + o) >>> 0;
  }
  return n;
}

export function fromUint32(n: number): string {
  const x = n >>> 0;
  return `${(x >>> 24) & 0xff}.${(x >>> 16) & 0xff}.${(x >>> 8) & 0xff}.${x & 0xff}`;
}

export interface ParsedCidr {
  network: number;
  prefix: number;
  mask: number;
  size: number;
  firstHost: number;
  lastHost: number;
  broadcast: number;
}

export function parseCidr(s: string): ParsedCidr {
  const slash = s.lastIndexOf('/');
  if (slash < 0) throw new Ipv4Error(`invalid CIDR: ${s}`);
  const ip = s.slice(0, slash);
  const prefixStr = s.slice(slash + 1);
  if (!/^\d{1,2}$/.test(prefixStr)) throw new Ipv4Error(`invalid CIDR: ${s}`);
  const prefix = Number(prefixStr);
  if (prefix < 0 || prefix > 32) throw new Ipv4Error(`invalid CIDR prefix: ${s}`);
  const addr = parseIpv4(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (addr & mask) >>> 0;
  if (network !== addr) {
    throw new Ipv4Error(`${s} is not a network address (expected ${fromUint32(network)}/${prefix})`);
  }
  const size = prefix === 0 ? 0x100000000 : 2 ** (32 - prefix);
  const broadcast = prefix === 32 ? network : (network + size - 1) >>> 0;
  let firstHost: number;
  let lastHost: number;
  if (prefix >= 31) {
    firstHost = network;
    lastHost = broadcast;
  } else {
    firstHost = (network + 1) >>> 0;
    lastHost = (broadcast - 1) >>> 0;
  }
  return { network, prefix, mask, size, firstHost, lastHost, broadcast };
}

export function isValidCidr(s: string): boolean {
  try {
    parseCidr(s);
    return true;
  } catch {
    return false;
  }
}

export function cidrContains(cidr: string, ip: string): boolean {
  const c = parseCidr(cidr);
  const n = parseIpv4(ip);
  return (n & c.mask) >>> 0 === c.network;
}

export function overlaps(a: string, b: string): boolean {
  const ca = parseCidr(a);
  const cb = parseCidr(b);
  const aEnd = ca.prefix === 32 ? ca.network : (ca.network + ca.size - 1) >>> 0;
  const bEnd = cb.prefix === 32 ? cb.network : (cb.network + cb.size - 1) >>> 0;
  return ca.network <= bEnd && cb.network <= aEnd;
}

export interface NextFreeOpts {
  gateway?: string | null;
  dhcpRange?: { start: string; end: string } | null;
  used: Iterable<string>;
}

export function nextFreeIp(cidr: string, opts: NextFreeOpts): string | null {
  const c = parseCidr(cidr);
  if (c.prefix >= 31) return null;
  const skip = new Set<number>();
  if (opts.gateway) skip.add(parseIpv4(opts.gateway));
  if (opts.dhcpRange) {
    const start = parseIpv4(opts.dhcpRange.start);
    const end = parseIpv4(opts.dhcpRange.end);
    for (let i = start; i <= end; i++) skip.add(i >>> 0);
  }
  for (const u of opts.used) skip.add(parseIpv4(u));
  for (let i = c.firstHost; i <= c.lastHost; i++) {
    const n = i >>> 0;
    if (!skip.has(n)) return fromUint32(n);
  }
  return null;
}
