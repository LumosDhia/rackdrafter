import type { CanvasNode, DeviceNode, Link, LinkKind, Project } from './types.ts';
import { nodeById } from './selectors.ts';

export type ConnectResult = { ok: true } | { ok: false; reason: string };

function nodeLabel(n: CanvasNode): string {
  return n.label;
}

function hasWiredNic(d: DeviceNode): boolean {
  return d.spec.nics.some((n) => n.kind === 'ethernet' || n.kind === 'bridge');
}

function hasWifiNic(d: DeviceNode): boolean {
  return d.spec.nics.some((n) => n.kind === 'wifi');
}

function isGuest(n: CanvasNode): n is DeviceNode {
  return n.kind === 'device' && n.placement.kind === 'guest';
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function hasDuplicate(
  project: Project,
  kind: LinkKind,
  source: string,
  target: string,
  ordered: boolean,
): boolean {
  return project.links.some((l) => {
    if (l.kind !== kind) return false;
    if (ordered) return l.source === source && l.target === target;
    return pairKey(l.source, l.target) === pairKey(source, target);
  });
}

function hardDependsCycle(project: Project, source: string, target: string): boolean {
  const adj = new Map<string, string[]>();
  for (const l of project.links) {
    if (l.kind !== 'depends-on') continue;
    if (!l.attrs.hard) continue;
    const list = adj.get(l.source) ?? [];
    list.push(l.target);
    adj.set(l.source, list);
  }
  const seed = adj.get(source) ?? [];
  seed.push(target);
  adj.set(source, seed);

  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adj.get(cur) ?? []) stack.push(n);
  }
  return false;
}

export function canConnect(
  kind: LinkKind,
  sourceId: string,
  targetId: string,
  project: Project,
): ConnectResult {
  if (sourceId === targetId) return { ok: false, reason: 'Cannot connect a node to itself' };
  const nodes = nodeById(project);
  const source = nodes.get(sourceId);
  const target = nodes.get(targetId);
  if (!source || !target) return { ok: false, reason: 'Both nodes must exist' };
  if (
    source.kind === 'group' ||
    source.kind === 'note' ||
    target.kind === 'group' ||
    target.kind === 'note'
  ) {
    return { ok: false, reason: 'Groups and notes cannot be linked' };
  }

  if (kind === 'ethernet' || kind === 'wifi' || kind === 'vpn-tunnel') {
    if (hasDuplicate(project, kind, sourceId, targetId, false) && kind !== 'ethernet') {
      return { ok: false, reason: 'Link already exists' };
    }
  } else if (hasDuplicate(project, kind, sourceId, targetId, true)) {
    return { ok: false, reason: 'Link already exists' };
  }

  switch (kind) {
    case 'ethernet':
      return ethernetRules(source, target, project);
    case 'wifi':
      return wifiRules(source, target);
    case 'vpn-tunnel':
      return vpnRules(source, target);
    case 'reverse-proxy':
      return reverseProxyRules(source, target);
    case 'depends-on':
      return dependsOnRules(source, target, project);
    case 'replicates-to':
      return replicatesRules(source, target);
    case 'backup-to':
      return backupRules(source, target);
    case 'mounts':
      return mountsRules(source, target);
    default:
      return { ok: false, reason: 'Pick a link type (1–8)' };
  }
}

function ethernetRules(source: CanvasNode, target: CanvasNode, project: Project): ConnectResult {
  const kinds = new Set([source.kind, target.kind]);
  if (![...kinds].every((k) => k === 'device' || k === 'network')) {
    return { ok: false, reason: 'Ethernet links devices or network buses' };
  }
  if (source.kind === 'network' && target.kind === 'network') {
    return { ok: false, reason: 'Connect two subnets through a router' };
  }
  for (const n of [source, target]) {
    if (n.kind === 'device' && !hasWiredNic(n)) {
      return { ok: false, reason: `${nodeLabel(n)} has no wired NIC` };
    }
  }
  for (const [a, b] of [
    [source, target],
    [target, source],
  ] as const) {
    if (isGuest(a)) {
      const hostId = a.placement.kind === 'guest' ? a.placement.hostId : null;
      const ok = b.kind === 'network' || (b.kind === 'device' && b.id === hostId);
      if (!ok) return { ok: false, reason: 'A guest connects through its host bridge' };
    }
  }
  if (hasDuplicate(project, 'ethernet', source.id, target.id, false)) {
    return { ok: false, reason: 'Link already exists' };
  }
  return { ok: true };
}

function wifiRules(source: CanvasNode, target: CanvasNode): ConnectResult {
  const pair = [source, target];
  if (!pair.every((n) => n.kind === 'device' || n.kind === 'network')) {
    return { ok: false, reason: 'Wi-Fi links devices or network buses' };
  }
  const apRoles = new Set(['access-point', 'router', 'modem']);
  const apOrNet = pair.filter(
    (n) => n.kind === 'network' || (n.kind === 'device' && apRoles.has(n.spec.role)),
  );
  if (apOrNet.length < 1) {
    return { ok: false, reason: 'One endpoint must be an access point, router, modem, or network' };
  }
  const other = pair.find((n) => n !== apOrNet[0]);
  if (other?.kind === 'device' && !hasWifiNic(other)) {
    return { ok: false, reason: `${nodeLabel(other)} has no Wi-Fi NIC` };
  }
  return { ok: true };
}

function vpnRules(source: CanvasNode, target: CanvasNode): ConnectResult {
  if (source.kind !== 'device' || target.kind !== 'device') {
    return { ok: false, reason: 'VPN tunnels connect devices' };
  }
  const banned = new Set(['switch', 'ups', 'smart-plug', 'internet']);
  if (banned.has(source.spec.role) || banned.has(target.spec.role)) {
    return { ok: false, reason: 'That device cannot terminate a VPN' };
  }
  if (
    (source.placement.kind === 'guest' && source.placement.hostId === target.id) ||
    (target.placement.kind === 'guest' && target.placement.hostId === source.id)
  ) {
    return { ok: false, reason: 'Not host↔own guest' };
  }
  return { ok: true };
}

function reverseProxyRules(source: CanvasNode, target: CanvasNode): ConnectResult {
  if (source.kind !== 'service') {
    return { ok: false, reason: `${nodeLabel(source)} is not a reverse proxy` };
  }
  const caps = new Set(source.spec.capabilities);
  if (!caps.has('reverse-proxy') && !caps.has('tunnel')) {
    return { ok: false, reason: `${nodeLabel(source)} is not a reverse proxy` };
  }
  if (target.kind !== 'service') return { ok: false, reason: 'Target must be a service' };
  if (target.spec.ports.length < 1) return { ok: false, reason: 'Target exposes no ports' };
  if (source.id === target.id) return { ok: false, reason: 'Target is not the source' };
  return { ok: true };
}

function dependsOnRules(source: CanvasNode, target: CanvasNode, project: Project): ConnectResult {
  const bothServices = source.kind === 'service' && target.kind === 'service';
  const bothDevices = source.kind === 'device' && target.kind === 'device';
  if (!bothServices && !bothDevices) {
    return { ok: false, reason: 'depends-on links services, or devices for power/network' };
  }
  if (hardDependsCycle(project, source.id, target.id)) {
    return {
      ok: false,
      reason: `Creates a dependency cycle: ${source.label} → ${target.label} → ${source.label}`,
    };
  }
  return { ok: true };
}

function replicatesRules(_source: CanvasNode, target: CanvasNode): ConnectResult {
  if (target.kind === 'device' && target.spec.storage.length > 0) return { ok: true };
  if (target.kind === 'service' && target.spec.volumes.length > 0) return { ok: true };
  return { ok: false, reason: 'Target needs storage or a volume' };
}

function backupRules(_source: CanvasNode, target: CanvasNode): ConnectResult {
  const roles = new Set(['nas', 'server', 'hypervisor', 'vps', 'storage-device', 'docker-host']);
  if (target.kind === 'device' && roles.has(target.spec.role)) return { ok: true };
  if (target.kind === 'service' && target.spec.capabilities.includes('backup-target')) return { ok: true };
  return { ok: false, reason: 'Target is not a backup destination' };
}

function mountsRules(_source: CanvasNode, target: CanvasNode): ConnectResult {
  if (target.kind === 'device' && target.spec.storage.length > 0) return { ok: true };
  if (target.kind === 'service' && target.spec.capabilities.includes('file-share')) return { ok: true };
  return { ok: false, reason: 'Target has no shareable storage' };
}

export function inferLinkKind(
  source: CanvasNode,
  target: CanvasNode,
): LinkKind | { ok: false; reason: string } {
  const pair = [source, target];
  if (pair.every((n) => n.kind === 'device' || n.kind === 'network')) {
    const device = pair.find((n): n is DeviceNode => n.kind === 'device');
    if (device && device.spec.nics.length > 0 && device.spec.nics.every((n) => n.kind === 'wifi')) {
      return 'wifi';
    }
    return 'ethernet';
  }
  if (source.kind === 'service' && target.kind === 'service') {
    const caps = new Set(source.spec.capabilities);
    if (caps.has('reverse-proxy') || caps.has('tunnel')) return 'reverse-proxy';
    return 'depends-on';
  }
  if (
    source.kind === 'service' &&
    target.kind === 'device' &&
    (target as DeviceNode).spec.storage.length > 0
  ) {
    return 'mounts';
  }
  return { ok: false, reason: 'Pick a link type (1–8)' };
}

export function defaultAttrs(kind: LinkKind): Link['attrs'] {
  switch (kind) {
    case 'ethernet':
      return {
        sourceNicId: null,
        targetNicId: null,
        speedMbps: null,
        poe: false,
        cable: null,
        vlanMode: 'access',
        vlans: [],
      };
    case 'wifi':
      return { sourceNicId: null, targetNicId: null, band: '5', ssid: '' };
    case 'vpn-tunnel':
      return {
        protocol: 'wireguard',
        transport: 'udp',
        endpointHost: '',
        endpointPort: null,
        overlaySubnetId: null,
        routedCidrs: [],
        fullTunnel: false,
      };
    case 'reverse-proxy':
      return {
        hostname: '',
        targetPortId: '',
        pathPrefix: '/',
        tls: true,
        auth: 'none',
        websockets: false,
      };
    case 'depends-on':
      return { reason: 'service', hard: true };
    case 'replicates-to':
      return {
        method: 'rsync',
        schedule: null,
        sourcePath: null,
        targetPath: null,
        targetStorageId: null,
      };
    case 'backup-to':
      return {
        tool: 'restic',
        schedule: '0 3 * * *',
        retention: '7d4w6m',
        targetStorageId: null,
        volumeIds: [],
        offsite: false,
      };
    case 'mounts':
      return { protocol: 'nfs', exportPath: '', mountPath: '', readOnly: false, storageId: null };
  }
}
