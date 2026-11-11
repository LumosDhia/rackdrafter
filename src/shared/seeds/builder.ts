import type {
  CanvasNode,
  DeviceNode,
  DeviceRole,
  GroupNode,
  K8sCluster,
  Link,
  LinkKind,
  NetworkNode,
  NodeId,
  NoteNode,
  PortId,
  Project,
  ServiceNode,
  StorageId,
  Subnet,
  SubnetPurpose,
} from '../domain/types.ts';
import { CURRENT_SCHEMA_VERSION } from '../domain/types.ts';
import { defaultSettings, newDeviceFromCatalog, newServiceFromCatalog } from '../domain/defaults.ts';
import { clock } from '../domain/clock.ts';
import { getCatalogItem } from '../catalog/index.ts';
import { defaultAttrs } from '../domain/linkRules.ts';
import { newId, ID_PREFIX } from '../domain/ids.ts';

export interface SubnetInput {
  name: string;
  cidr: string;
  purpose: SubnetPurpose;
  gateway?: string | null;
  vlan?: number | null;
  dhcp?: { start: string; end: string } | null;
  external?: boolean;
  scope?: Subnet['scope'];
}

export interface DeviceInput {
  slug: string;
  label: string;
  pos: { x: number; y: number };
  host?: NodeId;
  role?: DeviceRole;
  cpu?: number;
  ramMb?: number;
  ip?: string | null;
  nicName?: string;
  nicKind?: 'ethernet' | 'wifi' | 'bridge' | 'virtual' | 'tunnel' | 'cellular';
  subnetId?: string | null;
  vlan?: number | null;
  storage?: {
    label: string;
    kind: 'nvme' | 'sata-ssd' | 'hdd' | 'usb-ssd' | 'usb-hdd' | 'lvm-thin' | 'zfs-pool' | 'virtual-disk';
    capacityGb: number;
    mountPath?: string | null;
    external?: boolean;
  }[];
  status?: DeviceNode['status'];
  notes?: string;
  groupId?: NodeId | null;
}

export interface ServiceInput {
  slug: string;
  label?: string;
  pos: { x: number; y: number };
  host?: NodeId;
  cluster?: {
    clusterId: string;
    namespace: string;
    workload?: 'deployment' | 'statefulset' | 'daemonset';
    replicas?: number;
  };
  ip?: string | null;
  ports?: Record<string, { host?: number | null; bind?: string | null }>;
  cpu?: number;
  ramMb?: number;
  status?: ServiceNode['status'];
  notes?: string;
}

/** Deterministic id factory: `n_hl0001`, `l_hl0001`, … */
class Ids {
  private counters = new Map<string, number>();
  private readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${this.tag}${String(n).padStart(4, '0')}`;
  }
}

export class SeedBuilder {
  readonly project: Project;
  private readonly ids: Ids;
  private readonly byLabel = new Map<string, CanvasNode>();

  constructor(tag: string, name: string, description: string) {
    const now = clock.nowIso();
    this.ids = new Ids(tag);
    this.project = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: newId(ID_PREFIX.project),
      name,
      description,
      createdAt: now,
      updatedAt: now,
      settings: defaultSettings(),
      nodes: [],
      links: [],
      subnets: [],
      clusters: [],
      dnsZones: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }

  subnet(input: SubnetInput): Subnet {
    const subnet: Subnet = {
      id: this.ids.next('s'),
      name: input.name,
      cidr: input.cidr,
      vlan: input.vlan ?? null,
      gateway: input.gateway ?? null,
      dhcpRange: input.dhcp ?? null,
      dns: [],
      purpose: input.purpose,
      scope: input.scope ?? { kind: 'global' },
      external: input.external ?? false,
      siteGroupId: null,
    };
    this.project.subnets.push(subnet);
    return subnet;
  }

  device(input: DeviceInput): DeviceNode {
    const item = getCatalogItem(input.slug);
    if (!item || item.kind !== 'device') throw new Error(`seed: unknown device catalog item ${input.slug}`);
    const node = newDeviceFromCatalog(item, input.pos);
    node.id = this.ids.next('n') as NodeId;
    node.label = input.label;
    node.status = input.status ?? 'running';
    node.notes = input.notes ?? '';
    node.groupId = input.groupId ?? null;
    if (input.role) node.spec.role = input.role;
    if (input.cpu !== undefined) {
      node.spec.cpu.cores = input.cpu;
      node.spec.cpu.threads = Math.max(node.spec.cpu.threads, input.cpu);
    }
    if (input.ramMb !== undefined) node.spec.ramMb = input.ramMb;
    if (input.storage) {
      node.spec.storage = input.storage.map((s) => ({
        id: newId(ID_PREFIX.storage),
        label: s.label,
        kind: s.kind,
        capacityGb: s.capacityGb,
        mountPath: s.mountPath ?? null,
        external: s.external ?? false,
        backing: null,
      }));
    }
    if (input.host) {
      node.placement = { kind: 'guest', hostId: input.host, guestType: item.guest ?? 'lxc', guestId: null };
    }
    const nic = node.spec.nics[0];
    if (nic) {
      if (input.nicName) nic.name = input.nicName;
      if (input.nicKind) nic.kind = input.nicKind;
      if (input.ip !== undefined) {
        nic.ip = input.ip;
        nic.dhcp = input.ip === null;
      }
      if (input.subnetId !== undefined) nic.subnetId = input.subnetId;
      if (input.vlan !== undefined) nic.vlan = input.vlan;
    }
    // Deterministic inner ids so two builds are byte-identical.
    node.spec.storage = node.spec.storage.map((st, i) => ({ ...st, id: `d_${node.id.slice(2)}_${i}` }));
    node.spec.gpus = node.spec.gpus.map((g, i) => ({ ...g, id: `g_${node.id.slice(2)}_${i}` }));
    node.spec.nics = node.spec.nics.map((nic, i) => ({ ...nic, id: `i_${node.id.slice(2)}_${i}` }));
    this.project.nodes.push(node);
    this.byLabel.set(input.label, node);
    return node;
  }

  service(input: ServiceInput): ServiceNode {
    const item = getCatalogItem(input.slug);
    if (!item || item.kind !== 'service') throw new Error(`seed: unknown service catalog item ${input.slug}`);
    const node = newServiceFromCatalog(item, input.pos);
    node.id = this.ids.next('n') as NodeId;
    if (input.label) node.label = input.label;
    node.status = input.status ?? 'running';
    node.notes = input.notes ?? '';
    if (input.host) node.placement = { kind: 'host', hostId: input.host };
    if (input.cluster) {
      node.placement = {
        kind: 'cluster',
        clusterId: input.cluster.clusterId,
        namespace: input.cluster.namespace,
        workload: input.cluster.workload ?? 'deployment',
        replicas: input.cluster.replicas ?? 1,
      };
    }
    if (input.cpu !== undefined) node.spec.resources.cpuMillicores = input.cpu;
    if (input.ramMb !== undefined) node.spec.resources.ramMb = input.ramMb;
    if (input.ports) {
      for (const port of node.spec.ports) {
        const override = input.ports[port.name];
        if (!override) continue;
        if (override.host !== undefined) port.hostPort = override.host;
        if (override.bind !== undefined) port.bindIp = override.bind;
      }
    }
    node.spec.ports = node.spec.ports.map((port, i) => ({ ...port, id: `p_${node.id.slice(2)}_${i}` }));
    node.spec.volumes = node.spec.volumes.map((vol, i) => ({ ...vol, id: `v_${node.id.slice(2)}_${i}` }));
    node.spec.env = node.spec.env.map((env, i) => ({ ...env, id: `e_${node.id.slice(2)}_${i}` }));
    this.project.nodes.push(node);
    this.byLabel.set(input.label ?? input.slug, node);
    return node;
  }

  group(input: {
    label: string;
    kind: GroupNode['groupKind'];
    pos: { x: number; y: number };
    size: { width: number; height: number };
    failureDomain?: boolean;
    tone?: GroupNode['tone'];
  }): GroupNode {
    const node: GroupNode = {
      id: this.ids.next('n') as NodeId,
      kind: 'group',
      label: input.label,
      position: input.pos,
      size: input.size,
      groupId: null,
      status: 'running',
      notes: '',
      tags: [],
      locked: false,
      groupKind: input.kind,
      failureDomain: input.failureDomain ?? false,
      tone: input.tone ?? 'neutral',
    };
    this.project.nodes.push(node);
    this.byLabel.set(input.label, node);
    return node;
  }

  note(
    label: string,
    text: string,
    pos: { x: number; y: number },
    size = { width: 260, height: 120 },
  ): NoteNode {
    const node: NoteNode = {
      id: this.ids.next('n') as NodeId,
      kind: 'note',
      label,
      position: pos,
      size,
      groupId: null,
      status: 'planned',
      notes: '',
      tags: [],
      locked: false,
      text,
    };
    this.project.nodes.push(node);
    return node;
  }

  network(label: string, subnet: Subnet, pos: { x: number; y: number }): NetworkNode {
    const node: NetworkNode = {
      id: this.ids.next('n') as NodeId,
      kind: 'network',
      label,
      position: pos,
      size: { width: 240, height: 48 },
      groupId: null,
      status: 'running',
      notes: '',
      tags: [],
      locked: false,
      subnetId: subnet.id,
      orientation: 'horizontal',
    };
    this.project.nodes.push(node);
    return node;
  }

  cluster(input: Omit<K8sCluster, 'id'>): K8sCluster {
    const cluster: K8sCluster = { id: this.ids.next('k'), ...input };
    this.project.clusters.push(cluster);
    return cluster;
  }

  node(label: string): CanvasNode {
    const node = this.byLabel.get(label);
    if (!node) throw new Error(`seed: unknown node ${label}`);
    return node;
  }

  deviceNode(label: string): DeviceNode {
    const node = this.node(label);
    if (node.kind !== 'device') throw new Error(`seed: ${label} is not a device`);
    return node;
  }

  serviceNode(label: string): ServiceNode {
    const node = this.node(label);
    if (node.kind !== 'service') throw new Error(`seed: ${label} is not a service`);
    return node;
  }

  /** Adds a port to a service that the catalog did not declare (e.g. a bespoke container). */
  addPort(
    label: string,
    name: string,
    containerPort: number,
    hostPort: number | null,
    appProtocol: 'http' | 'https' | 'tcp' | 'udp' = 'http',
  ): PortId {
    const service = this.serviceNode(label);
    const port = {
      id: `p_${service.id.slice(2)}_${service.spec.ports.length}`,
      name,
      containerPort,
      hostPort,
      proto: 'tcp' as const,
      bindIp: null,
      appProtocol,
    };
    service.spec.ports.push(port);
    return port.id;
  }

  port(label: string, name?: string): PortId {
    const service = this.serviceNode(label);
    const port = name ? service.spec.ports.find((p) => p.name === name) : service.spec.ports[0];
    if (!port) throw new Error(`seed: ${label} has no port ${name ?? '(first)'}`);
    return port.id;
  }

  storage(label: string, storageLabel: string): StorageId {
    const device = this.deviceNode(label);
    const st = device.spec.storage.find((s) => s.label === storageLabel);
    if (!st) throw new Error(`seed: ${label} has no storage ${storageLabel}`);
    return st.id;
  }

  link(kind: LinkKind, from: string, to: string, attrs: Partial<Link['attrs']> = {}): Link {
    const source = this.node(from);
    const target = this.node(to);
    const link = {
      id: this.ids.next('l'),
      kind,
      source: source.id,
      target: target.id,
      sourceHandle: null,
      targetHandle: null,
      label: '',
      attrs: { ...defaultAttrs(kind), ...attrs },
    } as Link;
    this.project.links.push(link);
    return link;
  }

  finish(): Project {
    this.project.updatedAt = clock.nowIso();
    return this.project;
  }
}
