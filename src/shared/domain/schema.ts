import { z } from 'zod';
import { parseCidr } from '../lib/net/ipv4.ts';
import {
  catalogSlug,
  cidr,
  clusterId,
  cron,
  fqdn,
  gpuId,
  hostname,
  ipv4,
  iso8601,
  linkId,
  mac,
  nicId,
  nodeId,
  port,
  portId,
  ruleId,
  storageId,
  subnetId,
  vlan,
  volumeId,
  zoneId,
} from './primitives.ts';
import type {
  CanvasNode,
  DevicePlacement,
  DeviceSpec,
  FirewallPolicy,
  Link,
  NetworkInterface,
  Project,
  ProjectSettings,
  ServicePlacement,
  ServiceSpec,
  Subnet,
} from './types.ts';
import { CURRENT_SCHEMA_VERSION } from './types.ts';

const handleSide = z.enum(['top', 'right', 'bottom', 'left']);

const sizeSchema = z.union([z.strictObject({ width: z.number(), height: z.number() }), z.null()]);

const nodeBaseFields = {
  id: nodeId,
  label: z.string().min(1).max(64),
  position: z.strictObject({ x: z.number(), y: z.number() }),
  size: sizeSchema,
  groupId: nodeId.nullable(),
  status: z.enum(['planned', 'running', 'degraded', 'broken', 'retired']),
  notes: z.string(),
  tags: z.array(z.string()),
  locked: z.boolean(),
};

export const StorageDeviceSchema = z.strictObject({
  id: storageId,
  label: z.string().min(1),
  kind: z.enum([
    'nvme',
    'sata-ssd',
    'hdd',
    'usb-ssd',
    'usb-hdd',
    'sd',
    'emmc',
    'lvm-thin',
    'zfs-pool',
    'virtual-disk',
  ]),
  capacityGb: z.number(),
  mountPath: z.string().nullable(),
  external: z.boolean(),
  backing: z
    .strictObject({
      deviceId: nodeId,
      storageId,
    })
    .nullable(),
});

const gpuApi = z.enum(['qsv', 'vaapi', 'nvenc', 'cuda', 'amf', 'videotoolbox']);

export const GpuSchema = z.strictObject({
  id: gpuId,
  model: z.string(),
  kind: z.enum(['igpu', 'dgpu']),
  vendor: z.enum(['intel', 'nvidia', 'amd', 'apple', 'other']),
  vramMb: z.number().nullable(),
  apis: z.array(gpuApi),
  encodeCodecs: z.array(z.enum(['h264', 'hevc', 'av1', 'vp9'])),
});

export const NetworkInterfaceSchema: z.ZodType<NetworkInterface> = z.strictObject({
  id: nicId,
  name: z.string().min(1),
  kind: z.enum(['ethernet', 'wifi', 'bridge', 'virtual', 'tunnel', 'cellular']),
  subnetId: subnetId.nullable(),
  ip: ipv4.nullable(),
  dhcp: z.boolean(),
  reserved: z.boolean(),
  mac: mac.nullable(),
  vlan: vlan.nullable(),
  speedMbps: z.number().nullable(),
  primary: z.boolean(),
  publicIp: z.boolean(),
});

export const PowerSpecSchema = z.strictObject({
  idleW: z.number(),
  maxW: z.number(),
  upsCapacityW: z.number().nullable(),
  upsBatteryWh: z.number().nullable(),
});

export const CostSpecSchema = z.strictObject({
  purchase: z.number().nullable(),
  monthly: z.number().nullable(),
  amortizeMonths: z.number().nullable(),
});

const cidrOrKeyword = z.union([z.literal('any'), z.literal('lan'), z.literal('tailnet'), cidr]);

export const FirewallRuleSchema = z.strictObject({
  ports: z.strictObject({ from: port, to: port }),
  proto: z.enum(['tcp', 'udp']),
  source: cidrOrKeyword,
  action: z.enum(['allow', 'deny']),
  comment: z.string(),
});

export const FirewallPolicySchema: z.ZodType<FirewallPolicy> = z.strictObject({
  enabled: z.boolean(),
  defaultInbound: z.enum(['allow', 'deny']),
  rules: z.array(FirewallRuleSchema),
});

export const PortForwardSchema = z.strictObject({
  id: z.string().min(1),
  wanNicId: nicId,
  externalPort: port,
  proto: z.enum(['tcp', 'udp']),
  targetNodeId: nodeId,
  targetPort: port,
});

export const DevicePlacementSchema: z.ZodType<DevicePlacement> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('physical') }),
  z.strictObject({
    kind: z.literal('guest'),
    hostId: nodeId,
    guestType: z.enum(['lxc', 'vm']),
    guestId: z.number().int().nullable(),
  }),
]);

export const DeviceSpecSchema: z.ZodType<DeviceSpec> = z.strictObject({
  role: z.enum([
    'hypervisor',
    'docker-host',
    'k8s-control-plane',
    'k8s-worker',
    'server',
    'nas',
    'transcoder',
    'workstation',
    'router',
    'firewall',
    'switch',
    'access-point',
    'modem',
    'ups',
    'smart-plug',
    'vps',
    'internet',
    'cloud-edge',
    'storage-device',
    'laptop',
    'phone',
    'tablet',
    'handheld',
    'tv',
    'console',
    'iot',
    'camera',
  ]),
  formFactor: z.enum([
    'mini-pc',
    'sff',
    'tower',
    'rack',
    'sbc',
    'laptop',
    'handheld',
    'phone',
    'tablet',
    'appliance',
    'virtual',
    'cloud',
    'external-drive',
    'wall-plug',
    'abstract',
  ]),
  hostname,
  fqdn: fqdn.nullable(),
  vendor: z.string().nullable(),
  model: z.string().nullable(),
  os: z.string().nullable(),
  cpu: z.strictObject({
    model: z.string().nullable(),
    cores: z.number().int().min(0),
    threads: z.number().int().min(0),
    arch: z.enum(['x86_64', 'arm64', 'armv7', 'other']),
  }),
  ramMb: z.number(),
  reservedRamMb: z.number(),
  storage: z.array(StorageDeviceSchema),
  gpus: z.array(GpuSchema),
  gpuPassthrough: z.array(z.strictObject({ deviceId: nodeId, gpuId })),
  nics: z.array(NetworkInterfaceSchema),
  power: PowerSpecSchema,
  cost: CostSpecSchema,
  rackUnits: z.number(),
  firewall: FirewallPolicySchema,
  advertisedRoutes: z.array(cidr),
  portForwards: z.array(PortForwardSchema),
});

export const DeviceNodeSchema = z.strictObject({
  ...nodeBaseFields,
  kind: z.literal('device'),
  catalogSlug,
  spec: DeviceSpecSchema,
  placement: DevicePlacementSchema,
  expanded: z.boolean(),
});

export const ServicePlacementSchema: z.ZodType<ServicePlacement> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('host'), hostId: nodeId }),
  z.strictObject({
    kind: z.literal('cluster'),
    clusterId,
    namespace: z.string(),
    workload: z.enum(['deployment', 'statefulset', 'daemonset']),
    replicas: z.number().int().min(1),
  }),
  z.strictObject({ kind: z.literal('standalone') }),
]);

export const PortMappingSchema = z.strictObject({
  id: portId,
  name: z.string(),
  containerPort: port,
  hostPort: port.nullable(),
  proto: z.enum(['tcp', 'udp']),
  bindIp: ipv4.nullable(),
  appProtocol: z.enum([
    'http',
    'https',
    'tcp',
    'udp',
    'dns',
    'smb',
    'ssh',
    'grpc',
    'minecraft',
    'wireguard',
    'other',
  ]),
});

export const EnvVarSchema = z.strictObject({
  id: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
  secret: z.boolean(),
});

export const VolumeMountSchema = z.strictObject({
  id: volumeId,
  name: z.string(),
  kind: z.enum(['named', 'bind', 'tmpfs', 'pvc']),
  source: z.string(),
  target: z.string(),
  readOnly: z.boolean(),
  sizeGb: z.number(),
  class: z.enum(['config', 'data', 'database', 'media', 'cache', 'tmp']),
  storageRef: z.strictObject({ deviceId: nodeId, storageId }).nullable(),
  backup: z.enum(['required', 'optional', 'none']),
});

export const HealthcheckSchema = z.strictObject({
  test: z.array(z.string()),
  intervalS: z.number(),
  timeoutS: z.number(),
  retries: z.number(),
  startPeriodS: z.number(),
});

export const ResourceRequestsSchema = z.strictObject({
  cpuMillicores: z.number(),
  ramMb: z.number(),
  ramLimitMb: z.number().nullable(),
  gpu: z.enum(['none', 'optional', 'required']),
  gpuApis: z.array(gpuApi),
});

const serviceCapability = z.enum([
  'reverse-proxy',
  'tunnel',
  'vpn',
  'dns',
  'database',
  'cache',
  'backup-target',
  'file-share',
  'monitoring',
  'ci-runner',
  'registry',
  'ingress-controller',
  'media-server',
  'auth',
]);

export const ServiceSpecSchema: z.ZodType<ServiceSpec> = z.strictObject({
  runtime: z.enum(['docker', 'systemd', 'lxc-native', 'k8s', 'external']),
  image: z.string().nullable(),
  containerName: z.string().nullable(),
  command: z.array(z.string()).nullable(),
  category: z.enum([
    'media',
    'downloads',
    'networking',
    'monitoring',
    'dashboards',
    'data',
    'files',
    'apps',
    'devops',
    'k8s',
    'home',
    'gaming',
    'backup',
    'platform',
    'security',
    'ai',
    'custom',
  ]),
  officialUrl: z.string(),
  iconSlug: z.string(),
  ports: z.array(PortMappingSchema),
  env: z.array(EnvVarSchema),
  volumes: z.array(VolumeMountSchema),
  networks: z.array(subnetId),
  healthcheck: HealthcheckSchema.nullable(),
  resources: ResourceRequestsSchema,
  restart: z.enum(['unless-stopped', 'always', 'on-failure', 'no']),
  user: z.string().nullable(),
  labels: z.record(z.string(), z.string()),
  capabilities: z.array(serviceCapability),
  adminUi: z.boolean(),
});

export const ServiceNodeSchema = z.strictObject({
  ...nodeBaseFields,
  kind: z.literal('service'),
  catalogSlug,
  spec: ServiceSpecSchema,
  placement: ServicePlacementSchema,
});

export const NetworkNodeSchema = z.strictObject({
  ...nodeBaseFields,
  kind: z.literal('network'),
  subnetId,
  orientation: z.enum(['horizontal', 'vertical']),
});

export const GroupNodeSchema = z.strictObject({
  ...nodeBaseFields,
  kind: z.literal('group'),
  groupKind: z.enum(['site', 'rack', 'zone', 'frame']),
  failureDomain: z.boolean(),
  tone: z.enum(['neutral', 'accent', 'muted']),
});

export const NoteNodeSchema = z.strictObject({
  ...nodeBaseFields,
  kind: z.literal('note'),
  text: z.string(),
});

export const CanvasNodeSchema: z.ZodType<CanvasNode> = z.discriminatedUnion('kind', [
  DeviceNodeSchema,
  ServiceNodeSchema,
  NetworkNodeSchema,
  GroupNodeSchema,
  NoteNodeSchema,
]);

const subnetScope = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('global') }),
  z.strictObject({ kind: z.literal('host'), hostId: nodeId }),
  z.strictObject({ kind: z.literal('cluster'), clusterId }),
]);

export const SubnetSchema: z.ZodType<Subnet> = z.strictObject({
  id: subnetId,
  name: z.string().min(1),
  cidr,
  vlan: vlan.nullable(),
  gateway: ipv4.nullable(),
  dhcpRange: z.strictObject({ start: ipv4, end: ipv4 }).nullable(),
  dns: z.array(ipv4),
  purpose: z.enum([
    'wan',
    'lan',
    'mgmt',
    'servers',
    'iot',
    'guest',
    'dmz',
    'storage',
    'vpn-overlay',
    'docker',
    'k8s-pod',
    'k8s-service',
  ]),
  scope: subnetScope,
  external: z.boolean(),
  siteGroupId: nodeId.nullable(),
});

export const K8sClusterSchema = z.strictObject({
  id: clusterId,
  name: z.string().min(1),
  distro: z.enum(['k3s', 'k8s', 'talos', 'microk8s']),
  version: z.string(),
  nodeIds: z.array(nodeId),
  podSubnetId: subnetId,
  serviceSubnetId: subnetId,
  ingressClass: z.string(),
  storageClass: z.string(),
  namespaces: z.array(z.string()),
});

export const DnsZoneSchema = z.strictObject({
  id: zoneId,
  apex: z.string().min(1),
  provider: z.enum(['cloudflare', 'other']),
});

const linkCommon = {
  id: linkId,
  source: nodeId,
  target: nodeId,
  sourceHandle: handleSide.nullable(),
  targetHandle: handleSide.nullable(),
  label: z.string(),
};

export const EthernetAttrsSchema = z.strictObject({
  sourceNicId: nicId.nullable(),
  targetNicId: nicId.nullable(),
  speedMbps: z.number().nullable(),
  poe: z.boolean(),
  cable: z.enum(['cat5e', 'cat6', 'cat6a', 'dac', 'fiber']).nullable(),
  vlanMode: z.enum(['access', 'trunk']),
  vlans: z.array(vlan),
});

export const WifiAttrsSchema = z.strictObject({
  sourceNicId: nicId.nullable(),
  targetNicId: nicId.nullable(),
  band: z.enum(['2.4', '5', '6']),
  ssid: z.string(),
});

export const VpnTunnelAttrsSchema = z.strictObject({
  protocol: z.enum(['wireguard', 'tailscale', 'openvpn', 'ipsec', 'ssh']),
  transport: z.enum(['udp', 'tcp', 'wstunnel', 'ssh', 'derp']),
  endpointHost: z.string(),
  endpointPort: port.nullable(),
  overlaySubnetId: subnetId.nullable(),
  routedCidrs: z.array(cidr),
  fullTunnel: z.boolean(),
});

export const ReverseProxyAttrsSchema = z.strictObject({
  hostname: z.string(),
  targetPortId: portId,
  pathPrefix: z.string(),
  tls: z.boolean(),
  auth: z.enum(['none', 'basic', 'sso', 'cloudflare-access']),
  websockets: z.boolean(),
});

export const DependsOnAttrsSchema = z.strictObject({
  reason: z.enum(['service', 'database', 'cache', 'auth', 'storage', 'power', 'network', 'ci']),
  hard: z.boolean(),
});

export const ReplicatesToAttrsSchema = z.strictObject({
  method: z.enum(['rsync', 'zfs-send', 'syncthing', 'rclone', 'db-replication', 'custom']),
  schedule: cron.nullable(),
  sourcePath: z.string().nullable(),
  targetPath: z.string().nullable(),
  targetStorageId: storageId.nullable(),
});

export const BackupToAttrsSchema = z.strictObject({
  tool: z.enum(['restic', 'borg', 'kopia', 'pbs', 'vzdump', 'rsync', 'custom']),
  schedule: cron,
  retention: z.string(),
  targetStorageId: storageId.nullable(),
  volumeIds: z.array(volumeId),
  offsite: z.boolean(),
});

export const MountsAttrsSchema = z.strictObject({
  protocol: z.enum(['nfs', 'smb', 'sshfs', 'bind', 'iscsi', 'rclone']),
  exportPath: z.string(),
  mountPath: z.string(),
  readOnly: z.boolean(),
  storageId: storageId.nullable(),
});

export const LinkSchema: z.ZodType<Link> = z.discriminatedUnion('kind', [
  z.strictObject({ ...linkCommon, kind: z.literal('ethernet'), attrs: EthernetAttrsSchema }),
  z.strictObject({ ...linkCommon, kind: z.literal('wifi'), attrs: WifiAttrsSchema }),
  z.strictObject({ ...linkCommon, kind: z.literal('vpn-tunnel'), attrs: VpnTunnelAttrsSchema }),
  z.strictObject({ ...linkCommon, kind: z.literal('reverse-proxy'), attrs: ReverseProxyAttrsSchema }),
  z.strictObject({ ...linkCommon, kind: z.literal('depends-on'), attrs: DependsOnAttrsSchema }),
  z.strictObject({ ...linkCommon, kind: z.literal('replicates-to'), attrs: ReplicatesToAttrsSchema }),
  z.strictObject({ ...linkCommon, kind: z.literal('backup-to'), attrs: BackupToAttrsSchema }),
  z.strictObject({ ...linkCommon, kind: z.literal('mounts'), attrs: MountsAttrsSchema }),
]);

export const ProjectSettingsSchema: z.ZodType<ProjectSettings> = z.strictObject({
  currency: z.string().min(1),
  electricityPricePerKwh: z.number(),
  averageLoadFactor: z.number(),
  amortizeMonths: z.number(),
  thresholds: z.strictObject({
    ramWarn: z.number(),
    ramError: z.number(),
    cpuInfo: z.number(),
    cpuWarn: z.number(),
    diskWarn: z.number(),
    diskError: z.number(),
    subnetWarn: z.number(),
    upsWarn: z.number(),
  }),
  timezone: z.string().min(1),
  disabledRules: z.array(ruleId),
  snapToGrid: z.boolean(),
});

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

function uniqueIds(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

export const ProjectSchema: z.ZodType<Project> = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    description: z.string(),
    createdAt: iso8601,
    updatedAt: iso8601,
    settings: ProjectSettingsSchema,
    nodes: z.array(CanvasNodeSchema),
    links: z.array(LinkSchema),
    subnets: z.array(SubnetSchema),
    clusters: z.array(K8sClusterSchema),
    dnsZones: z.array(DnsZoneSchema),
    viewport: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number() }),
  })
  .superRefine((project, ctx) => {
    const nodeDup = uniqueIds(project.nodes.map((n) => n.id));
    if (nodeDup) addIssue(ctx, ['nodes'], `duplicate node id ${nodeDup}`);
    const linkDup = uniqueIds(project.links.map((l) => l.id));
    if (linkDup) addIssue(ctx, ['links'], `duplicate link id ${linkDup}`);
    const subnetDup = uniqueIds(project.subnets.map((s) => s.id));
    if (subnetDup) addIssue(ctx, ['subnets'], `duplicate subnet id ${subnetDup}`);
    const clusterDup = uniqueIds(project.clusters.map((c) => c.id));
    if (clusterDup) addIssue(ctx, ['clusters'], `duplicate cluster id ${clusterDup}`);
    const zoneDup = uniqueIds(project.dnsZones.map((z) => z.id));
    if (zoneDup) addIssue(ctx, ['dnsZones'], `duplicate zone id ${zoneDup}`);

    const nodes = new Map(project.nodes.map((n) => [n.id, n]));
    const subnets = new Set(project.subnets.map((s) => s.id));
    const clusters = new Set(project.clusters.map((c) => c.id));

    const nicIds = new Set<string>();
    const storageIds = new Set<string>();
    const gpuIds = new Set<string>();
    const portIds = new Set<string>();
    const volumeIds = new Set<string>();

    for (const node of project.nodes) {
      if (node.kind === 'device') {
        for (const nic of node.spec.nics) nicIds.add(nic.id);
        for (const st of node.spec.storage) storageIds.add(st.id);
        for (const g of node.spec.gpus) gpuIds.add(g.id);
      }
      if (node.kind === 'service') {
        for (const p of node.spec.ports) portIds.add(p.id);
        for (const v of node.spec.volumes) volumeIds.add(v.id);
      }
    }

    const networkBySubnet = new Map<string, string[]>();
    const parentOf = new Map<string, string>();

    for (const [i, node] of project.nodes.entries()) {
      if (node.kind === 'network') {
        const list = networkBySubnet.get(node.subnetId) ?? [];
        list.push(node.id);
        networkBySubnet.set(node.subnetId, list);
        if (!subnets.has(node.subnetId)) {
          addIssue(ctx, ['nodes', i, 'subnetId'], `unknown subnet ${node.subnetId}`);
        }
      }

      if (node.kind === 'device' && node.placement.kind === 'guest') {
        const host = nodes.get(node.placement.hostId);
        if (!host) {
          addIssue(ctx, ['nodes', i, 'placement', 'hostId'], `unknown host ${node.placement.hostId}`);
        } else if (host.kind !== 'device') {
          addIssue(ctx, ['nodes', i, 'placement', 'hostId'], 'guest host must be a device');
        } else if (host.spec.role !== 'hypervisor') {
          addIssue(ctx, ['nodes', i, 'placement', 'hostId'], 'guest on non-hypervisor');
        } else {
          parentOf.set(node.id, host.id);
        }
        if (node.groupId !== null) {
          addIssue(ctx, ['nodes', i, 'groupId'], 'hosted node must have groupId null');
        }
      }

      if (node.kind === 'service' && node.placement.kind === 'host') {
        const host = nodes.get(node.placement.hostId);
        if (!host) {
          addIssue(ctx, ['nodes', i, 'placement', 'hostId'], `unknown host ${node.placement.hostId}`);
        } else if (host.kind !== 'device') {
          addIssue(ctx, ['nodes', i, 'placement', 'hostId'], 'service placed on a non-device');
        } else {
          parentOf.set(node.id, host.id);
        }
        if (node.groupId !== null) {
          addIssue(ctx, ['nodes', i, 'groupId'], 'hosted node must have groupId null');
        }
      }

      if (node.kind === 'service' && node.placement.kind === 'cluster') {
        if (!clusters.has(node.placement.clusterId)) {
          addIssue(
            ctx,
            ['nodes', i, 'placement', 'clusterId'],
            `unknown cluster ${node.placement.clusterId}`,
          );
        }
      }

      if (node.groupId !== null && !nodes.has(node.groupId)) {
        addIssue(ctx, ['nodes', i, 'groupId'], `unknown group ${node.groupId}`);
      }

      if (node.kind === 'device') {
        for (const [si, st] of node.spec.storage.entries()) {
          if (st.backing) {
            if (!nodes.has(st.backing.deviceId)) {
              addIssue(
                ctx,
                ['nodes', i, 'spec', 'storage', si, 'backing', 'deviceId'],
                'unknown backing device',
              );
            }
            if (!storageIds.has(st.backing.storageId)) {
              addIssue(
                ctx,
                ['nodes', i, 'spec', 'storage', si, 'backing', 'storageId'],
                'unknown backing storage',
              );
            }
          }
        }
        for (const [gi, gp] of node.spec.gpuPassthrough.entries()) {
          if (!nodes.has(gp.deviceId)) {
            addIssue(ctx, ['nodes', i, 'spec', 'gpuPassthrough', gi, 'deviceId'], 'unknown GPU device');
          }
          if (!gpuIds.has(gp.gpuId)) {
            addIssue(ctx, ['nodes', i, 'spec', 'gpuPassthrough', gi, 'gpuId'], 'unknown GPU');
          }
        }
        for (const [ni, nic] of node.spec.nics.entries()) {
          if (nic.subnetId && !subnets.has(nic.subnetId)) {
            addIssue(ctx, ['nodes', i, 'spec', 'nics', ni, 'subnetId'], `unknown subnet ${nic.subnetId}`);
          }
        }
        for (const [fi, fw] of node.spec.portForwards.entries()) {
          if (!nicIds.has(fw.wanNicId)) {
            addIssue(ctx, ['nodes', i, 'spec', 'portForwards', fi, 'wanNicId'], 'unknown NIC');
          }
          if (!nodes.has(fw.targetNodeId)) {
            addIssue(ctx, ['nodes', i, 'spec', 'portForwards', fi, 'targetNodeId'], 'unknown target');
          }
        }
      }

      if (node.kind === 'service') {
        for (const [vi, vol] of node.spec.volumes.entries()) {
          if (vol.storageRef) {
            if (!nodes.has(vol.storageRef.deviceId)) {
              addIssue(
                ctx,
                ['nodes', i, 'spec', 'volumes', vi, 'storageRef', 'deviceId'],
                'unknown storage device',
              );
            }
            if (!storageIds.has(vol.storageRef.storageId)) {
              addIssue(
                ctx,
                ['nodes', i, 'spec', 'volumes', vi, 'storageRef', 'storageId'],
                'unknown storage',
              );
            }
          }
        }
        for (const [ni, net] of node.spec.networks.entries()) {
          if (!subnets.has(net)) {
            addIssue(ctx, ['nodes', i, 'spec', 'networks', ni], `unknown subnet ${net}`);
          }
        }
      }
    }

    for (const [subnetIdValue, ids] of networkBySubnet) {
      if (ids.length > 1) {
        addIssue(ctx, ['nodes'], `two network nodes for one subnet ${subnetIdValue}`);
      }
    }

    for (const node of project.nodes) {
      let depth = 0;
      let cur: string | undefined = parentOf.get(node.id);
      const seen = new Set<string>([node.id]);
      while (cur) {
        depth += 1;
        if (seen.has(cur)) {
          addIssue(ctx, ['nodes'], `containment cycle involving ${node.id}`);
          break;
        }
        if (depth > 3) {
          addIssue(ctx, ['nodes'], `host chain deeper than 3 for ${node.id}`);
          break;
        }
        seen.add(cur);
        cur = parentOf.get(cur);
      }
    }

    for (const [i, link] of project.links.entries()) {
      if (!nodes.has(link.source)) {
        addIssue(ctx, ['links', i, 'source'], `unknown node ${link.source}`);
      }
      if (!nodes.has(link.target)) {
        addIssue(ctx, ['links', i, 'target'], `unknown node ${link.target}`);
      }
      if (link.kind === 'ethernet' || link.kind === 'wifi') {
        const a = link.attrs;
        if (a.sourceNicId && !nicIds.has(a.sourceNicId)) {
          addIssue(ctx, ['links', i, 'attrs', 'sourceNicId'], 'unknown NIC');
        }
        if (a.targetNicId && !nicIds.has(a.targetNicId)) {
          addIssue(ctx, ['links', i, 'attrs', 'targetNicId'], 'unknown NIC');
        }
      }
      if (
        link.kind === 'vpn-tunnel' &&
        link.attrs.overlaySubnetId &&
        !subnets.has(link.attrs.overlaySubnetId)
      ) {
        addIssue(ctx, ['links', i, 'attrs', 'overlaySubnetId'], 'unknown subnet');
      }
      if (link.kind === 'reverse-proxy' && !portIds.has(link.attrs.targetPortId)) {
        addIssue(ctx, ['links', i, 'attrs', 'targetPortId'], 'unknown port');
      }
      if (
        link.kind === 'replicates-to' &&
        link.attrs.targetStorageId &&
        !storageIds.has(link.attrs.targetStorageId)
      ) {
        addIssue(ctx, ['links', i, 'attrs', 'targetStorageId'], 'unknown storage');
      }
      if (link.kind === 'backup-to') {
        if (link.attrs.targetStorageId && !storageIds.has(link.attrs.targetStorageId)) {
          addIssue(ctx, ['links', i, 'attrs', 'targetStorageId'], 'unknown storage');
        }
        for (const [vi, vid] of link.attrs.volumeIds.entries()) {
          if (!volumeIds.has(vid)) addIssue(ctx, ['links', i, 'attrs', 'volumeIds', vi], 'unknown volume');
        }
      }
      if (link.kind === 'mounts' && link.attrs.storageId && !storageIds.has(link.attrs.storageId)) {
        addIssue(ctx, ['links', i, 'attrs', 'storageId'], 'unknown storage');
      }
    }

    for (const [i, subnet] of project.subnets.entries()) {
      if (subnet.scope.kind === 'host' && !nodes.has(subnet.scope.hostId)) {
        addIssue(ctx, ['subnets', i, 'scope', 'hostId'], 'unknown host');
      }
      if (subnet.scope.kind === 'cluster' && !clusters.has(subnet.scope.clusterId)) {
        addIssue(ctx, ['subnets', i, 'scope', 'clusterId'], 'unknown cluster');
      }
      if (subnet.siteGroupId && !nodes.has(subnet.siteGroupId)) {
        addIssue(ctx, ['subnets', i, 'siteGroupId'], 'unknown site group');
      }
      if (subnet.gateway) {
        try {
          const c = parseCidr(subnet.cidr);
          const { parseIpv4 } = {
            parseIpv4: (ip: string) => {
              const p = ip.split('.').map(Number);
              return (((p[0] ?? 0) << 24) | ((p[1] ?? 0) << 16) | ((p[2] ?? 0) << 8) | (p[3] ?? 0)) >>> 0;
            },
          };
          void c;
          void parseIpv4;
        } catch {
          /* cidr already validated */
        }
      }
    }

    for (const [i, cluster] of project.clusters.entries()) {
      for (const [ni, nid] of cluster.nodeIds.entries()) {
        if (!nodes.has(nid)) addIssue(ctx, ['clusters', i, 'nodeIds', ni], `unknown node ${nid}`);
      }
      if (!subnets.has(cluster.podSubnetId)) {
        addIssue(ctx, ['clusters', i, 'podSubnetId'], 'unknown subnet');
      }
      if (!subnets.has(cluster.serviceSubnetId)) {
        addIssue(ctx, ['clusters', i, 'serviceSubnetId'], 'unknown subnet');
      }
    }
  });
