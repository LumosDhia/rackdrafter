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

export const ProjectSchema: z.ZodType<Project> = z.strictObject({
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
});
