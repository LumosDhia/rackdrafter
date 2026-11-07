import { z } from 'zod';
import { parseCidr } from '../lib/net/ipv4.ts';

// back to a real number now, the inspector parses before dispatching
const port = z.number().int().min(1).max(65535);

// x.y.z.w with every part <= 255, the regex alone let 999.1.1.1 through
const ipv4 = z.string().refine((s) => {
  const parts = s.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}, 'not an IPv4 address');

const cidr = z.string().refine((s) => {
  try {
    parseCidr(s);
    return true;
  } catch {
    return false;
  }
}, 'not a CIDR');

const nodeBase = {
  id: z.string(),
  label: z.string().min(1).max(64),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number(), height: z.number() }).nullable(),
  groupId: z.string().nullable(),
  status: z.enum(['planned', 'running', 'degraded', 'broken', 'retired']),
  notes: z.string(),
  tags: z.array(z.string()),
  locked: z.boolean(),
};

export const NicSchema = z.object({
  id: z.string(),
  name: z.string(),
  ip: ipv4.nullable(),
  subnetId: z.string().nullable(),
  mac: z.string().nullable(),
});

export const PortMappingSchema = z.object({
  id: z.string(),
  containerPort: port,
  hostPort: port.nullable(),
  proto: z.enum(['tcp', 'udp']),
  bindIp: ipv4.nullable(),
});

export const DeviceNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('device'),
  catalogSlug: z.string(),
  spec: z.object({
    role: z.string(),
    ramMb: z.number(),
    nics: z.array(NicSchema),
  }),
  placement: z.object({ kind: z.enum(['physical', 'guest']), hostId: z.string().optional() }),
});

export const ServiceNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('service'),
  catalogSlug: z.string(),
  spec: z.object({
    image: z.string().nullable(),
    ports: z.array(PortMappingSchema),
  }),
  placement: z.object({ kind: z.enum(['host', 'cluster']), hostId: z.string().optional() }),
});

// TODO network / group / note nodes
export const CanvasNodeSchema = z.discriminatedUnion('kind', [DeviceNodeSchema, ServiceNodeSchema]);

export const SubnetSchema = z.object({
  id: z.string(),
  name: z.string(),
  cidr,
  gateway: ipv4.nullable(),
  vlan: z.number().int().min(1).max(4094).nullable(),
});

export const LinkSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'ethernet',
    'wifi',
    'vpn-tunnel',
    'reverse-proxy',
    'depends-on',
    'replicates-to',
    'backup-to',
    'mounts',
  ]),
  source: z.string(),
  target: z.string(),
  label: z.string(),
  attrs: z.record(z.string(), z.unknown()),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(80),
  description: z.string(),
  nodes: z.array(CanvasNodeSchema),
  links: z.array(LinkSchema),
  subnets: z.array(SubnetSchema),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
});
