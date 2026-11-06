import { parseCidr, parseIpv4 } from '../lib/net/ipv4.ts';
import type {
  CanvasNode,
  DeviceNode,
  Link,
  NetworkInterface,
  NodeId,
  Project,
  ServiceNode,
} from './types.ts';

const cache = {
  nodeById: new WeakMap<Project, Map<NodeId, CanvasNode>>(),
  linksByNode: new WeakMap<Project, Map<NodeId, Link[]>>(),
};

export function nodeById(p: Project): Map<NodeId, CanvasNode> {
  let m = cache.nodeById.get(p);
  if (!m) {
    m = new Map(p.nodes.map((n) => [n.id, n]));
    cache.nodeById.set(p, m);
  }
  return m;
}

export function linksByNode(p: Project): Map<NodeId, Link[]> {
  let m = cache.linksByNode.get(p);
  if (!m) {
    m = new Map();
    for (const link of p.links) {
      const src = m.get(link.source) ?? [];
      src.push(link);
      m.set(link.source, src);
      if (link.target !== link.source) {
        const tgt = m.get(link.target) ?? [];
        tgt.push(link);
        m.set(link.target, tgt);
      }
    }
    cache.linksByNode.set(p, m);
  }
  return m;
}

export function childrenOf(p: Project, id: NodeId): CanvasNode[] {
  return p.nodes.filter((n) => {
    if (n.groupId === id) return true;
    if (n.kind === 'device' && n.placement.kind === 'guest' && n.placement.hostId === id) return true;
    if (n.kind === 'service' && n.placement.kind === 'host' && n.placement.hostId === id) return true;
    return false;
  });
}

export function hostOf(p: Project, id: NodeId): DeviceNode | null {
  const n = nodeById(p).get(id);
  if (!n) return null;
  if (n.kind === 'device' && n.placement.kind === 'guest') {
    const h = nodeById(p).get(n.placement.hostId);
    return h?.kind === 'device' ? h : null;
  }
  if (n.kind === 'service' && n.placement.kind === 'host') {
    const h = nodeById(p).get(n.placement.hostId);
    return h?.kind === 'device' ? h : null;
  }
  return null;
}

export function physicalHostOf(p: Project, id: NodeId): DeviceNode | null {
  const n = nodeById(p).get(id);
  if (!n) return null;
  if (n.kind === 'device' && n.placement.kind === 'physical') return n;
  const host = hostOf(p, id);
  if (!host) return n.kind === 'device' ? n : null;
  return physicalHostOf(p, host.id) ?? host;
}

export function primaryNic(device: DeviceNode): NetworkInterface | null {
  return device.spec.nics.find((n) => n.primary) ?? device.spec.nics[0] ?? null;
}

export function effectiveIp(p: Project, serviceId: NodeId): string | null {
  const n = nodeById(p).get(serviceId);
  if (!n || n.kind !== 'service') return null;
  if (n.placement.kind !== 'host') return null;
  const host = nodeById(p).get(n.placement.hostId);
  if (!host || host.kind !== 'device') return null;
  return primaryNic(host)?.ip ?? null;
}

export function getDependsOn(p: Project, id: NodeId): NodeId[] {
  return p.links.filter((l) => l.kind === 'depends-on' && l.source === id).map((l) => l.target);
}

export function getDependents(p: Project, id: NodeId): NodeId[] {
  return p.links.filter((l) => l.kind === 'depends-on' && l.target === id).map((l) => l.source);
}

export function nicsBySubnet(p: Project, subnetId: string): { device: DeviceNode; nic: NetworkInterface }[] {
  const out: { device: DeviceNode; nic: NetworkInterface }[] = [];
  for (const n of p.nodes) {
    if (n.kind !== 'device') continue;
    for (const nic of n.spec.nics) {
      if (nic.subnetId === subnetId) out.push({ device: n, nic });
    }
  }
  return out;
}

export function servicesOnDevice(
  p: Project,
  deviceId: NodeId,
  opts: { recursive?: boolean } = {},
): ServiceNode[] {
  const out: ServiceNode[] = [];
  for (const n of p.nodes) {
    if (n.kind !== 'service') continue;
    if (n.placement.kind === 'host' && n.placement.hostId === deviceId) out.push(n);
  }
  if (opts.recursive) {
    for (const child of childrenOf(p, deviceId)) {
      if (child.kind === 'device') out.push(...servicesOnDevice(p, child.id, opts));
    }
  }
  return out;
}

export function subnetForIp(p: Project, ip: string): Project['subnets'][number] | null {
  let addr: number;
  try {
    addr = parseIpv4(ip);
  } catch {
    return null;
  }
  for (const s of p.subnets) {
    try {
      const c = parseCidr(s.cidr);
      if ((addr & c.mask) >>> 0 === c.network) return s;
    } catch {
      /* skip */
    }
  }
  return null;
}

export function flowParentId(node: CanvasNode): NodeId | null {
  if (node.kind === 'service' && node.placement.kind === 'host') return node.placement.hostId;
  if (node.kind === 'device' && node.placement.kind === 'guest') return node.placement.hostId;
  return node.groupId;
}
