import { z } from 'zod';
import { isIpv4, isValidCidr } from '../lib/net/ipv4.ts';

export const ipv4 = z.string().refine((s) => isIpv4(s), { message: 'invalid IPv4' });

export const cidr = z.string().refine((s) => isValidCidr(s), { message: 'invalid CIDR' });

export const mac = z
  .string()
  .regex(/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/, 'invalid MAC (lowercase aa:bb:cc:dd:ee:ff)');

const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

export function isHostname(s: string): boolean {
  if (s.length === 0 || s.length > 253) return false;
  if (s.endsWith('.')) return false;
  return s.split('.').every((label) => HOST_LABEL.test(label));
}

export const hostname = z.string().refine(isHostname, { message: 'invalid hostname' });

export function isFqdn(s: string): boolean {
  if (!s.includes('.')) return false;
  if (!isHostname(s)) return false;
  const tld = s.slice(s.lastIndexOf('.') + 1);
  return /^[a-z]{2,}$/i.test(tld);
}

export const fqdn = z.string().refine(isFqdn, { message: 'invalid FQDN' });

const CRON_FIELD = /^(\*|\d+(-\d+)?|\*\/\d+)(,\d+(-\d+)?)*$/;

export const cron = z.string().refine(
  (s) => {
    const fields = s.trim().split(/\s+/);
    if (fields.length !== 5) return false;
    return fields.every((f) => CRON_FIELD.test(f));
  },
  { message: 'invalid cron' },
);

export const port = z.number().int().min(1).max(65535);

export const vlan = z.number().int().min(1).max(4094);

export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid kebab-case slug');

export const iso8601 = z.string().refine(
  (s) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s)) return false;
    const t = Date.parse(s);
    return Number.isFinite(t);
  },
  { message: 'invalid ISO-8601 timestamp' },
);

export const nodeId = z.string().min(1);
export const linkId = z.string().min(1);
export const subnetId = z.string().min(1);
export const nicId = z.string().min(1);
export const storageId = z.string().min(1);
export const gpuId = z.string().min(1);
export const portId = z.string().min(1);
export const volumeId = z.string().min(1);
export const clusterId = z.string().min(1);
export const zoneId = z.string().min(1);
export const catalogSlug = slug;
export const ruleId = z.string().min(1);
