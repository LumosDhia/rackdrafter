export type NodeId = string;
export type LinkId = string;
export type SubnetId = string;
export type NicId = string;
export type StorageId = string;
export type GpuId = string;
export type PortId = string;
export type VolumeId = string;
export type ClusterId = string;
export type ZoneId = string;
export type Ipv4 = string;
export type Cidr = string;
export type Iso8601 = string;
export type CatalogSlug = string;
export type Cron = string;

export const CURRENT_SCHEMA_VERSION = 1 as const;

export interface Project {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  name: string;
  description: string;
  createdAt: Iso8601;
  updatedAt: Iso8601;
  settings: ProjectSettings;
  nodes: CanvasNode[];
  links: Link[];
  subnets: Subnet[];
  clusters: K8sCluster[];
  dnsZones: DnsZone[];
  viewport: { x: number; y: number; zoom: number };
}

export interface ProjectSettings {
  currency: string;
  electricityPricePerKwh: number;
  averageLoadFactor: number;
  amortizeMonths: number;
  thresholds: {
    ramWarn: number;
    ramError: number;
    cpuInfo: number;
    cpuWarn: number;
    diskWarn: number;
    diskError: number;
    subnetWarn: number;
    upsWarn: number;
  };
  timezone: string;
  disabledRules: RuleId[];
  snapToGrid: boolean;
}

export type CanvasNodeKind = 'device' | 'service' | 'network' | 'group' | 'note';
export type NodeStatus = 'planned' | 'running' | 'degraded' | 'broken' | 'retired';

export interface NodeBase {
  id: NodeId;
  kind: CanvasNodeKind;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number } | null;
  groupId: NodeId | null;
  status: NodeStatus;
  notes: string;
  tags: string[];
  locked: boolean;
}

export type CanvasNode = DeviceNode | ServiceNode | NetworkNode | GroupNode | NoteNode;

export type DeviceRole =
  | 'hypervisor'
  | 'docker-host'
  | 'k8s-control-plane'
  | 'k8s-worker'
  | 'server'
  | 'nas'
  | 'transcoder'
  | 'workstation'
  | 'router'
  | 'firewall'
  | 'switch'
  | 'access-point'
  | 'modem'
  | 'ups'
  | 'smart-plug'
  | 'vps'
  | 'internet'
  | 'cloud-edge'
  | 'storage-device'
  | 'laptop'
  | 'phone'
  | 'tablet'
  | 'handheld'
  | 'tv'
  | 'console'
  | 'iot'
  | 'camera';

export type FormFactor =
  | 'mini-pc'
  | 'sff'
  | 'tower'
  | 'rack'
  | 'sbc'
  | 'laptop'
  | 'handheld'
  | 'phone'
  | 'tablet'
  | 'appliance'
  | 'virtual'
  | 'cloud'
  | 'external-drive'
  | 'wall-plug'
  | 'abstract';

export interface DeviceNode extends NodeBase {
  kind: 'device';
  catalogSlug: CatalogSlug;
  spec: DeviceSpec;
  placement: DevicePlacement;
  expanded: boolean;
}

export type DevicePlacement =
  { kind: 'physical' } | { kind: 'guest'; hostId: NodeId; guestType: 'lxc' | 'vm'; guestId: number | null };

export interface DeviceSpec {
  role: DeviceRole;
  formFactor: FormFactor;
  hostname: string;
  fqdn: string | null;
  vendor: string | null;
  model: string | null;
  os: string | null;
  cpu: {
    model: string | null;
    cores: number;
    threads: number;
    arch: 'x86_64' | 'arm64' | 'armv7' | 'other';
  };
  ramMb: number;
  reservedRamMb: number;
  storage: StorageDevice[];
  gpus: Gpu[];
  gpuPassthrough: { deviceId: NodeId; gpuId: GpuId }[];
  nics: NetworkInterface[];
  power: PowerSpec;
  cost: CostSpec;
  rackUnits: number;
  firewall: FirewallPolicy;
  advertisedRoutes: Cidr[];
  portForwards: PortForward[];
}

export interface StorageDevice {
  id: StorageId;
  label: string;
  kind:
    | 'nvme'
    | 'sata-ssd'
    | 'hdd'
    | 'usb-ssd'
    | 'usb-hdd'
    | 'sd'
    | 'emmc'
    | 'lvm-thin'
    | 'zfs-pool'
    | 'virtual-disk';
  capacityGb: number;
  mountPath: string | null;
  external: boolean;
  backing: { deviceId: NodeId; storageId: StorageId } | null;
}

export type GpuApi = 'qsv' | 'vaapi' | 'nvenc' | 'cuda' | 'amf' | 'videotoolbox';

export interface Gpu {
  id: GpuId;
  model: string;
  kind: 'igpu' | 'dgpu';
  vendor: 'intel' | 'nvidia' | 'amd' | 'apple' | 'other';
  vramMb: number | null;
  apis: GpuApi[];
  encodeCodecs: ('h264' | 'hevc' | 'av1' | 'vp9')[];
}

export interface NetworkInterface {
  id: NicId;
  name: string;
  kind: 'ethernet' | 'wifi' | 'bridge' | 'virtual' | 'tunnel' | 'cellular';
  subnetId: SubnetId | null;
  ip: Ipv4 | null;
  dhcp: boolean;
  reserved: boolean;
  mac: string | null;
  vlan: number | null;
  speedMbps: number | null;
  primary: boolean;
  publicIp: boolean;
}

export interface PowerSpec {
  idleW: number;
  maxW: number;
  upsCapacityW: number | null;
  upsBatteryWh: number | null;
}

export interface CostSpec {
  purchase: number | null;
  monthly: number | null;
  amortizeMonths: number | null;
}

export interface FirewallPolicy {
  enabled: boolean;
  defaultInbound: 'allow' | 'deny';
  rules: FirewallRule[];
}

export interface FirewallRule {
  ports: { from: number; to: number };
  proto: 'tcp' | 'udp';
  source: 'any' | 'lan' | 'tailnet' | Cidr;
  action: 'allow' | 'deny';
  comment: string;
}

export interface PortForward {
  id: string;
  wanNicId: NicId;
  externalPort: number;
  proto: 'tcp' | 'udp';
  targetNodeId: NodeId;
  targetPort: number;
}

export type ServiceCategory =
  | 'media'
  | 'downloads'
  | 'networking'
  | 'monitoring'
  | 'dashboards'
  | 'data'
  | 'files'
  | 'apps'
  | 'devops'
  | 'k8s'
  | 'home'
  | 'gaming'
  | 'backup'
  | 'platform'
  | 'security'
  | 'ai'
  | 'custom';

export interface ServiceNode extends NodeBase {
  kind: 'service';
  catalogSlug: CatalogSlug;
  spec: ServiceSpec;
  placement: ServicePlacement;
}

export type ServicePlacement =
  | { kind: 'host'; hostId: NodeId }
  | {
      kind: 'cluster';
      clusterId: ClusterId;
      namespace: string;
      workload: 'deployment' | 'statefulset' | 'daemonset';
      replicas: number;
    }
  | { kind: 'standalone' };

export interface ServiceSpec {
  runtime: 'docker' | 'systemd' | 'lxc-native' | 'k8s' | 'external';
  image: string | null;
  containerName: string | null;
  command: string[] | null;
  category: ServiceCategory;
  officialUrl: string;
  iconSlug: string;
  ports: PortMapping[];
  env: EnvVar[];
  volumes: VolumeMount[];
  networks: SubnetId[];
  healthcheck: Healthcheck | null;
  resources: ResourceRequests;
  restart: 'unless-stopped' | 'always' | 'on-failure' | 'no';
  user: string | null;
  labels: Record<string, string>;
  capabilities: ServiceCapability[];
  adminUi: boolean;
}

export type ServiceCapability =
  | 'reverse-proxy'
  | 'tunnel'
  | 'vpn'
  | 'dns'
  | 'database'
  | 'cache'
  | 'backup-target'
  | 'file-share'
  | 'monitoring'
  | 'ci-runner'
  | 'registry'
  | 'ingress-controller'
  | 'media-server'
  | 'auth';

export interface PortMapping {
  id: PortId;
  name: string;
  containerPort: number;
  hostPort: number | null;
  proto: 'tcp' | 'udp';
  bindIp: Ipv4 | null;
  appProtocol:
    'http' | 'https' | 'tcp' | 'udp' | 'dns' | 'smb' | 'ssh' | 'grpc' | 'minecraft' | 'wireguard' | 'other';
}

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  secret: boolean;
}

export interface VolumeMount {
  id: VolumeId;
  name: string;
  kind: 'named' | 'bind' | 'tmpfs' | 'pvc';
  source: string;
  target: string;
  readOnly: boolean;
  sizeGb: number;
  class: 'config' | 'data' | 'database' | 'media' | 'cache' | 'tmp';
  storageRef: { deviceId: NodeId; storageId: StorageId } | null;
  backup: 'required' | 'optional' | 'none';
}

export interface Healthcheck {
  test: string[];
  intervalS: number;
  timeoutS: number;
  retries: number;
  startPeriodS: number;
}

export interface ResourceRequests {
  cpuMillicores: number;
  ramMb: number;
  ramLimitMb: number | null;
  gpu: 'none' | 'optional' | 'required';
  gpuApis: GpuApi[];
}

export interface NetworkNode extends NodeBase {
  kind: 'network';
  subnetId: SubnetId;
  orientation: 'horizontal' | 'vertical';
}

export interface GroupNode extends NodeBase {
  kind: 'group';
  groupKind: 'site' | 'rack' | 'zone' | 'frame';
  failureDomain: boolean;
  tone: 'neutral' | 'accent' | 'muted';
}

export interface NoteNode extends NodeBase {
  kind: 'note';
  text: string;
}

export type SubnetPurpose =
  | 'wan'
  | 'lan'
  | 'mgmt'
  | 'servers'
  | 'iot'
  | 'guest'
  | 'dmz'
  | 'storage'
  | 'vpn-overlay'
  | 'docker'
  | 'k8s-pod'
  | 'k8s-service';

export interface Subnet {
  id: SubnetId;
  name: string;
  cidr: Cidr;
  vlan: number | null;
  gateway: Ipv4 | null;
  dhcpRange: { start: Ipv4; end: Ipv4 } | null;
  dns: Ipv4[];
  purpose: SubnetPurpose;
  scope: { kind: 'global' } | { kind: 'host'; hostId: NodeId } | { kind: 'cluster'; clusterId: ClusterId };
  external: boolean;
  siteGroupId: NodeId | null;
}

export interface K8sCluster {
  id: ClusterId;
  name: string;
  distro: 'k3s' | 'k8s' | 'talos' | 'microk8s';
  version: string;
  nodeIds: NodeId[];
  podSubnetId: SubnetId;
  serviceSubnetId: SubnetId;
  ingressClass: string;
  storageClass: string;
  namespaces: string[];
}

export interface DnsZone {
  id: ZoneId;
  apex: string;
  provider: 'cloudflare' | 'other';
}

export type LinkKind =
  | 'ethernet'
  | 'wifi'
  | 'vpn-tunnel'
  | 'reverse-proxy'
  | 'depends-on'
  | 'replicates-to'
  | 'backup-to'
  | 'mounts';

export const LINK_KINDS: readonly LinkKind[] = [
  'ethernet',
  'wifi',
  'vpn-tunnel',
  'reverse-proxy',
  'depends-on',
  'replicates-to',
  'backup-to',
  'mounts',
] as const;

export interface LinkBase<K extends LinkKind, A> {
  id: LinkId;
  kind: K;
  source: NodeId;
  target: NodeId;
  sourceHandle: 'top' | 'right' | 'bottom' | 'left' | null;
  targetHandle: 'top' | 'right' | 'bottom' | 'left' | null;
  label: string;
  attrs: A;
}

export interface EthernetAttrs {
  sourceNicId: NicId | null;
  targetNicId: NicId | null;
  speedMbps: number | null;
  poe: boolean;
  cable: 'cat5e' | 'cat6' | 'cat6a' | 'dac' | 'fiber' | null;
  vlanMode: 'access' | 'trunk';
  vlans: number[];
}

export interface WifiAttrs {
  sourceNicId: NicId | null;
  targetNicId: NicId | null;
  band: '2.4' | '5' | '6';
  ssid: string;
}

export interface VpnTunnelAttrs {
  protocol: 'wireguard' | 'tailscale' | 'openvpn' | 'ipsec' | 'ssh';
  transport: 'udp' | 'tcp' | 'wstunnel' | 'ssh' | 'derp';
  endpointHost: string;
  endpointPort: number | null;
  overlaySubnetId: SubnetId | null;
  routedCidrs: Cidr[];
  fullTunnel: boolean;
}

export interface ReverseProxyAttrs {
  hostname: string;
  targetPortId: PortId;
  pathPrefix: string;
  tls: boolean;
  auth: 'none' | 'basic' | 'sso' | 'cloudflare-access';
  websockets: boolean;
}

export interface DependsOnAttrs {
  reason: 'service' | 'database' | 'cache' | 'auth' | 'storage' | 'power' | 'network' | 'ci';
  hard: boolean;
}

export interface ReplicatesToAttrs {
  method: 'rsync' | 'zfs-send' | 'syncthing' | 'rclone' | 'db-replication' | 'custom';
  schedule: Cron | null;
  sourcePath: string | null;
  targetPath: string | null;
  targetStorageId: StorageId | null;
}

export interface BackupToAttrs {
  tool: 'restic' | 'borg' | 'kopia' | 'pbs' | 'vzdump' | 'rsync' | 'custom';
  schedule: Cron;
  retention: string;
  targetStorageId: StorageId | null;
  volumeIds: VolumeId[];
  offsite: boolean;
}

export interface MountsAttrs {
  protocol: 'nfs' | 'smb' | 'sshfs' | 'bind' | 'iscsi' | 'rclone';
  exportPath: string;
  mountPath: string;
  readOnly: boolean;
  storageId: StorageId | null;
}

export type Link =
  | LinkBase<'ethernet', EthernetAttrs>
  | LinkBase<'wifi', WifiAttrs>
  | LinkBase<'vpn-tunnel', VpnTunnelAttrs>
  | LinkBase<'reverse-proxy', ReverseProxyAttrs>
  | LinkBase<'depends-on', DependsOnAttrs>
  | LinkBase<'replicates-to', ReplicatesToAttrs>
  | LinkBase<'backup-to', BackupToAttrs>
  | LinkBase<'mounts', MountsAttrs>;

export type RuleId = string;

export type HandleSide = 'top' | 'right' | 'bottom' | 'left';

export interface ImportError {
  path: string;
  message: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
