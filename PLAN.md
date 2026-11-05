# rackdrafter — Architecture Plan

A local-first, monolithic web app for designing homelab and home-server architectures on a canvas. You drag devices and services onto it, connect them, give them addresses, then check the design and generate files from it. It is declarative: it designs, validates and generates. It never emulates packets.

This document is the contract for the implementing agent. Every decision here is final unless a phase acceptance check proves it wrong. Where a fact about the user's infrastructure was not given and had to be invented to make the model complete, it is marked **ASSUMPTION** and listed in §9.6 for the user to confirm.

---

## 0. Decisions at a glance

| Concern | Decision |
|---|---|
| Language / build | TypeScript 5.6+ (strict), Vite 5, React 19 |
| Canvas | `@xyflow/react` v12 |
| State | Zustand 5 + Immer 10 (`produceWithPatches`) for undo/redo |
| Validation | Zod 4 (`zod@^4`) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), CSS variables as tokens |
| UI primitives | Radix UI (`@radix-ui/react-context-menu`, `-dropdown-menu`, `-dialog`, `-tooltip`, `-popover`, `-tabs`, `-toggle-group`) without its styles |
| Fonts | IBM Plex Sans + IBM Plex Mono via `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` (self-hosted woff2, bundled by Vite) |
| Icons | Static SVGs in `public/icons/`, fetched and pinned by `scripts/icons/fetch-icons.ts`; glyphs from `@tabler/icons` (devDependency, stroke 1.5) |
| Persistence | Server-first: SQLite (`better-sqlite3`) + Drizzle behind `HttpRepository`; `IdbRepository` (IndexedDB via `idb-keyval`) as offline fallback and draft safety. One interface, §8 |
| Backend | Fastify 5, `fastify-type-provider-zod`, `@fastify/static`, Vite in middleware mode for dev. One process, one port (`4747`), no Docker |
| DB migrations | `drizzle-kit` generating `drizzle/0000_init.sql`, applied on boot by `migrate()` |
| YAML | `yaml` (eemeli) |
| Zip | `fflate` |
| Image export | `html-to-image@1.11.11` (pinned exactly; later versions break React Flow export) |
| IDs | `nanoid` (10 chars, prefixed), injectable generator for tests |
| Unit tests | Vitest 3 (two projects: `node` and `jsdom`), Testing Library, `fake-indexeddb`, `fast-check` |
| E2E | Playwright (Chromium in `verify`; Firefox and WebKit in `test:e2e:all`), `@axe-core/playwright` |
| Package manager | npm (lockfile committed) |
| One command | `npm run verify` |

### 0.1 Canvas library choice

Use `@xyflow/react`. The product is a typed graph: nodes with handles, edges with kinds, connection rules, and containment (a Proxmox host contains LXCs, which contain services). React Flow models exactly that. It has `isValidConnection` for per-kind link rules, sub-flows via `parentId`/`extent`/`expandParent` for host containment, and built-in `MiniMap`, `Background`, `NodeResizer`, `useOnSelectionChange` and `getIntersectingNodes`. Its documented export path (`getNodesBounds` + `getViewportForBounds` + `html-to-image`) produces SVG and PNG. It is MIT-licensed and v12 supports React 19. tldraw is a freeform whiteboard. Its shapes are not a typed graph, it has its own store and undo stack that would fight our domain model, and its SDK license needs a watermark or a paid key in production. A custom canvas would cost weeks on hit-testing, zoom/pan, edge routing and accessibility, and gain nothing a user would see. React Flow it is.

### 0.2 Stack deviations

I accept the preferred stack with three additions, none of which replace anything. (1) Immer's `produceWithPatches` drives undo/redo. Snapshot history libraries like `zundo` keep whole-state copies and can't label or merge entries; patches are small, have labels and merge cleanly. (2) Radix primitives provide accessible menus, dialogs and tooltips without bringing a visual style along. (3) Zod 4 rather than 3, for faster parsing and `z.strictObject`. npm is chosen over pnpm to reduce setup friction. There are no other deviations.

---

## 1. Scope

### 1.1 v1 — must ship

1. **Editor:** a palette with search and categories. Drag to canvas, or press Enter to insert at the viewport centre. Move, resize (groups, notes, network buses, expanded hosts), delete, multi-select (Shift-click and marquee), copy/cut/paste/duplicate, undo/redo (200 entries), snap to an 8 px grid, alignment helper lines, align/distribute, frames/groups, sticky notes, minimap, context menus, the full keyboard map in §3.8, light and dark themes.
2. **Containment:** drop a service or LXC/VM onto a host to place it there. Hosts expand into frames or collapse into cards with service chips.
3. **Links:** all 8 kinds (`ethernet`, `wifi`, `vpn-tunnel`, `reverse-proxy`, `depends-on`, `replicates-to`, `backup-to`, `mounts`), with per-kind validation, styling and inspector forms.
4. **Networking:** a subnet manager (CIDR, VLAN, gateway, DHCP range, purpose, scope), a NIC editor, a next-free-IP allocator, port mappings, firewall policy, router port forwards, advertised routes, DNS zones and hostnames.
5. **Catalog:** 140 entries (45 devices and 95 services, listed in §5.3) with locally bundled icons and a generated `THIRD_PARTY_NOTICES.md`.
6. **Analysis:** every rule in §6, live (debounced 250 ms), in a findings drawer. Clicking a finding selects its subjects.
7. **Failure simulation mode:** toggle nodes as failed and see down, degraded and unreachable overlays. Also a SPOF ranking.
8. **Budget panel:** per-host CPU/RAM/disk bars and a monthly cost and power table.
9. **Generators:** docker-compose (one file per host), Kubernetes plain manifests (one multi-document file per cluster), IP table in Markdown, Mermaid flowchart, SVG, PNG, project JSON, and a zip of everything.
10. **Importers:** project JSON (with migrations) and docker-compose YAML (paste or file).
11. **Templates:** Blank, "k3s cluster + CI/CD", and "Homelab reference" (the user's real infrastructure). Both reference templates analyse with zero errors.
12. **Backend + DB (v1, not later):** one Node process. Fastify serves the built SPA and a JSON API. SQLite through `better-sqlite3` + Drizzle, migrations applied on boot. Server-side projects, autosave with optimistic concurrency (`baseSeq`/`doc_hash`), version snapshots and restore, read-only share links, on-boot seeding of the two reference designs, optional bearer-token mode. Full contract in §8.
13. **Persistence client:** `ProjectRepository` interface with two implementations: `HttpRepository` (server, default) and `IdbRepository` (IndexedDB via `idb-keyval`, offline fallback + draft safety). Autosave debounce, offline banner, backoff retry, JSON export/import.
14. **Tests:** unit (shared + server + client projects), API tests via `app.inject()` on `:memory:`, e2e + a11y smoke. `npm run verify` is green.

### 1.2 v1.1

Auto-layout (elkjs, lazy-loaded). Helm chart and kustomize outputs. Ansible inventory generator. Proxmox import (paste `pvesh get /cluster/resources --output-format json`). Rack elevation view built from `rackUnits`. User-defined catalog items. IPv6 analysis. PWA offline install. Analysis moved into a Web Worker. Firefox and WebKit e2e in CI. SQLite FTS5 search over project names and node labels.

### 1.3 Later

Accounts and multi-user permissions, real-time collaboration (Yjs on the same API), live status overlays fed from Uptime Kuma or Prometheus, a Terraform/OpenTofu generator for VPS, nmap XML import, live Proxmox/SSH inventory reconciliation, and touch editing on mobile.

### 1.4 Non-goals (never)

Packet simulation, traffic emulation, deploying to real hosts, SSH into anything, or storing real secrets. Env vars marked secret are always emitted as `${VAR}` placeholders.

---

## 2. Domain model

This is the core of the system. Everything else is a projection of `Project`.

### 2.1 Principles

1. **One source of truth per fact.**
   - A service's host is `placement.hostId`. React Flow's `parentId` is derived from it.
   - A service's dependencies are its `depends-on` links. `ServiceSpec.dependsOn` is **not stored**; it is a derived selector `getDependsOn(project, nodeId)`, because storing it would duplicate the links.
   - A NIC's subnet is `nic.subnetId`. Ethernet/wifi links record which NIC they connect, but never which subnet.
2. **Schema validates shape and referential integrity. Analysis validates design correctness.** A project with duplicate IPs is a *valid document* with an *error finding*. A project whose link points at a missing node is an *invalid document* and is rejected on import.
3. **Units:** memory is `Mb` (MiB, 1024²), disk is `Gb` (GiB), power is watts, CPU is millicores for requests and integer cores/threads for hardware, money is a plain number in `project.settings.currency`.
4. **IDs** are prefixed nanoids: `n_` node, `l_` link, `s_` subnet, `i_` NIC, `d_` storage, `g_` GPU, `p_` port, `v_` volume, `e_` env var, `k_` cluster, `z_` DNS zone, `f_` port forward. Seeds use fixed readable IDs (`n_pve`, `n_ct101`).
5. **Arrays, not maps,** for everything ordered or user-visible, so JSON round-trips are stable. `Record` is used only for `labels`.

### 2.2 TypeScript types (`src/domain/types.ts`)

```ts
// ---------- primitives ----------
export type NodeId = string;      // "n_xxxxxxxxxx"
export type LinkId = string;      // "l_..."
export type SubnetId = string;    // "s_..."
export type NicId = string;       // "i_..."
export type StorageId = string;   // "d_..."
export type GpuId = string;       // "g_..."
export type PortId = string;      // "p_..."
export type VolumeId = string;    // "v_..."
export type ClusterId = string;   // "k_..."
export type ZoneId = string;      // "z_..."
export type Ipv4 = string;        // dotted quad, validated by ipv4 regex + octet range
export type Cidr = string;        // "a.b.c.d/nn", network address must equal masked address
export type Iso8601 = string;
export type CatalogSlug = string; // kebab-case, matches a CatalogItem.slug
export type Cron = string;        // 5-field cron

export const CURRENT_SCHEMA_VERSION = 1 as const;

// ---------- project ----------
export interface Project {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;                     // "proj_" + nanoid(10)
  name: string;                   // 1..80 chars
  description: string;            // markdown, may be ""
  createdAt: Iso8601;
  updatedAt: Iso8601;
  settings: ProjectSettings;
  nodes: CanvasNode[];            // order = z-order; invariant: a parent precedes its children
  links: Link[];
  subnets: Subnet[];
  clusters: K8sCluster[];
  dnsZones: DnsZone[];
  viewport: { x: number; y: number; zoom: number };
}

export interface ProjectSettings {
  currency: string;               // ISO 4217, default "EUR"
  electricityPricePerKwh: number; // default 0.20
  averageLoadFactor: number;      // 0..1, default 0.25 (fraction of the way from idleW to maxW)
  amortizeMonths: number;         // default 36
  thresholds: {
    ramWarn: number;              // default 0.85
    ramError: number;             // default 1.00
    cpuInfo: number;              // default 1.00 (overcommit notice)
    cpuWarn: number;              // default 4.00
    diskWarn: number;             // default 0.90
    diskError: number;            // default 1.00
    subnetWarn: number;           // default 0.90 (address-space usage)
    upsWarn: number;              // default 0.80
  };
  timezone: string;               // IANA, default "UTC"; emitted as TZ in compose
  disabledRules: RuleId[];        // default []
  snapToGrid: boolean;            // default true
}

// ---------- nodes ----------
export type CanvasNodeKind = 'device' | 'service' | 'network' | 'group' | 'note';
export type NodeStatus = 'planned' | 'running' | 'degraded' | 'broken' | 'retired';

export interface NodeBase {
  id: NodeId;
  kind: CanvasNodeKind;
  label: string;                  // 1..64 chars, shown on canvas
  position: { x: number; y: number }; // relative to the flow parent (host or group) when one exists
  size: { width: number; height: number } | null; // null = intrinsic; required for group/note/network/expanded host
  groupId: NodeId | null;         // membership in a GroupNode; must be null for hosted nodes (see placement)
  status: NodeStatus;             // default 'running' for seeds, 'planned' for new nodes
  notes: string;                  // markdown
  tags: string[];                 // lowercase kebab, sorted, unique
  locked: boolean;
}

export type CanvasNode = DeviceNode | ServiceNode | NetworkNode | GroupNode | NoteNode;

// ----- device -----
export type DeviceRole =
  | 'hypervisor' | 'docker-host' | 'k8s-control-plane' | 'k8s-worker' | 'server' | 'nas'
  | 'transcoder' | 'workstation' | 'router' | 'firewall' | 'switch' | 'access-point' | 'modem'
  | 'ups' | 'smart-plug' | 'vps' | 'internet' | 'cloud-edge' | 'storage-device'
  | 'laptop' | 'phone' | 'tablet' | 'handheld' | 'tv' | 'console' | 'iot' | 'camera';

export type FormFactor =
  | 'mini-pc' | 'sff' | 'tower' | 'rack' | 'sbc' | 'laptop' | 'handheld' | 'phone' | 'tablet'
  | 'appliance' | 'virtual' | 'cloud' | 'external-drive' | 'wall-plug' | 'abstract';

export interface DeviceNode extends NodeBase {
  kind: 'device';
  catalogSlug: CatalogSlug;
  spec: DeviceSpec;
  placement: DevicePlacement;
  expanded: boolean;              // hosts only: true = frame with children, false = card with chips
}

export type DevicePlacement =
  | { kind: 'physical' }
  | { kind: 'guest'; hostId: NodeId; guestType: 'lxc' | 'vm'; guestId: number | null }; // guestId = Proxmox VMID

export interface DeviceSpec {
  role: DeviceRole;
  formFactor: FormFactor;
  hostname: string;               // e.g. "pve"; RFC 1123 label
  fqdn: string | null;            // e.g. "s.mavubo.com"
  vendor: string | null;          // "Dell"
  model: string | null;           // "OptiPlex 3000 Micro"
  os: string | null;              // "Proxmox VE 9", "Ubuntu 24.04"
  cpu: {
    model: string | null;         // "Intel Core i5-12600T"
    cores: number;                // integer >= 0 (0 for switches, modems...)
    threads: number;              // >= cores
    arch: 'x86_64' | 'arm64' | 'armv7' | 'other';
  };
  ramMb: number;                  // guests: allocated limit; physical: installed
  reservedRamMb: number;          // OS/hypervisor overhead; default by role (see §6.4)
  storage: StorageDevice[];
  gpus: Gpu[];
  gpuPassthrough: { deviceId: NodeId; gpuId: GpuId }[]; // guests only: host GPUs exposed to this guest
  nics: NetworkInterface[];
  power: PowerSpec;
  cost: CostSpec;
  rackUnits: number;              // 0 = not rack mounted
  firewall: FirewallPolicy;
  advertisedRoutes: Cidr[];       // e.g. Tailscale subnet router ["192.168.1.0/24"]
  portForwards: PortForward[];    // only meaningful for role router|firewall|modem
}

export interface StorageDevice {
  id: StorageId;
  label: string;                  // "Inventory"
  kind: 'nvme' | 'sata-ssd' | 'hdd' | 'usb-ssd' | 'usb-hdd' | 'sd' | 'emmc'
      | 'lvm-thin' | 'zfs-pool' | 'virtual-disk';
  capacityGb: number;
  mountPath: string | null;       // "/mnt/inventory"
  external: boolean;              // USB/eSATA
  backing: { deviceId: NodeId; storageId: StorageId } | null; // lvm-thin/zfs on a disk; guest virtual disk on host pool
}

export type GpuApi = 'qsv' | 'vaapi' | 'nvenc' | 'cuda' | 'amf' | 'videotoolbox';
export interface Gpu {
  id: GpuId;
  model: string;                  // "Intel UHD Graphics 770"
  kind: 'igpu' | 'dgpu';
  vendor: 'intel' | 'nvidia' | 'amd' | 'apple' | 'other';
  vramMb: number | null;
  apis: GpuApi[];
  encodeCodecs: ('h264' | 'hevc' | 'av1' | 'vp9')[];
}

export interface NetworkInterface {
  id: NicId;
  name: string;                   // "vmbr0", "eth0", "wlan0", "tailscale0", "wg0"
  kind: 'ethernet' | 'wifi' | 'bridge' | 'virtual' | 'tunnel' | 'cellular';
  subnetId: SubnetId | null;
  ip: Ipv4 | null;                // null with dhcp=true means "dynamic, unknown"
  dhcp: boolean;                  // address obtained via DHCP
  reserved: boolean;              // DHCP reservation (dhcp=true and ip set)
  mac: string | null;             // "aa:bb:cc:dd:ee:ff" lowercase
  vlan: number | null;            // 1..4094 tagged; null = untagged/native
  speedMbps: number | null;       // 100 | 1000 | 2500 | 10000 | 25000 | wifi nominal
  primary: boolean;               // exactly one primary per device when nics.length > 0
  publicIp: boolean;              // address reachable from the internet
}

export interface PowerSpec {
  idleW: number;                  // 0 for virtual
  maxW: number;
  upsCapacityW: number | null;    // role 'ups' only
  upsBatteryWh: number | null;    // role 'ups' only
}

export interface CostSpec {
  purchase: number | null;        // one-off, amortised over amortizeMonths
  monthly: number | null;         // VPS/subscription
  amortizeMonths: number | null;  // overrides project default
}

export interface FirewallPolicy {
  enabled: boolean;               // false = everything listening is reachable on attached subnets
  defaultInbound: 'allow' | 'deny';
  rules: FirewallRule[];
}
export interface FirewallRule {
  ports: { from: number; to: number };   // inclusive; single port = from===to
  proto: 'tcp' | 'udp';
  source: 'any' | 'lan' | 'tailnet' | Cidr;
  action: 'allow' | 'deny';
  comment: string;
}

export interface PortForward {
  id: string;                     // "f_..."
  wanNicId: NicId;
  externalPort: number;
  proto: 'tcp' | 'udp';
  targetNodeId: NodeId;           // device whose IP receives the traffic
  targetPort: number;
}

// ----- service -----
export type ServiceCategory =
  | 'media' | 'downloads' | 'networking' | 'monitoring' | 'dashboards' | 'data' | 'files'
  | 'apps' | 'devops' | 'k8s' | 'home' | 'gaming' | 'backup' | 'platform' | 'security'
  | 'ai' | 'custom';

export interface ServiceNode extends NodeBase {
  kind: 'service';
  catalogSlug: CatalogSlug;
  spec: ServiceSpec;
  placement: ServicePlacement;
}

export type ServicePlacement =
  | { kind: 'host'; hostId: NodeId }                       // bare metal, VM, LXC, docker host
  | { kind: 'cluster'; clusterId: ClusterId; namespace: string;
      workload: 'deployment' | 'statefulset' | 'daemonset'; replicas: number }
  | { kind: 'standalone' };                                // unplaced, or external SaaS

export interface ServiceSpec {
  runtime: 'docker' | 'systemd' | 'lxc-native' | 'k8s' | 'external';
  image: string | null;           // required when runtime is docker|k8s: "jellyfin/jellyfin:10.10.3"
  containerName: string | null;   // docker only; defaults to slug(label)
  command: string[] | null;
  category: ServiceCategory;
  officialUrl: string;            // https URL from catalog
  iconSlug: string;               // resolves via icons.lock.json
  ports: PortMapping[];
  env: EnvVar[];
  volumes: VolumeMount[];
  networks: SubnetId[];           // docker networks (subnets with scope.kind==='host')
  healthcheck: Healthcheck | null;
  resources: ResourceRequests;
  restart: 'unless-stopped' | 'always' | 'on-failure' | 'no';
  user: string | null;            // "1000:1000"
  labels: Record<string, string>;
  capabilities: ServiceCapability[]; // copied from catalog at creation; editable
  adminUi: boolean;               // exposes an administrative interface
  // dependsOn: NOT STORED — derived: getDependsOn(project, id) from depends-on links
}

export type ServiceCapability =
  | 'reverse-proxy' | 'tunnel' | 'vpn' | 'dns' | 'database' | 'cache' | 'backup-target'
  | 'file-share' | 'monitoring' | 'ci-runner' | 'registry' | 'ingress-controller'
  | 'media-server' | 'auth';

export interface PortMapping {
  id: PortId;
  name: string;                   // "http", "webui", "dns", "ssh"
  containerPort: number;          // listen port inside container; for systemd/lxc-native equals hostPort
  hostPort: number | null;        // null = not published on the host
  proto: 'tcp' | 'udp';
  bindIp: Ipv4 | null;            // null = 0.0.0.0; "127.0.0.1" = loopback only
  appProtocol: 'http' | 'https' | 'tcp' | 'udp' | 'dns' | 'smb' | 'ssh' | 'grpc' | 'minecraft' | 'wireguard' | 'other';
}

export interface EnvVar { id: string; key: string; value: string; secret: boolean } // "e_..."

export interface VolumeMount {
  id: VolumeId;
  name: string;                   // "config"
  kind: 'named' | 'bind' | 'tmpfs' | 'pvc';
  source: string;                 // bind: absolute host path; named/pvc: volume name; tmpfs: ""
  target: string;                 // absolute path in container
  readOnly: boolean;
  sizeGb: number;                 // planning size; used by RES003 and PVC requests
  class: 'config' | 'data' | 'database' | 'media' | 'cache' | 'tmp';
  storageRef: { deviceId: NodeId; storageId: StorageId } | null;
  backup: 'required' | 'optional' | 'none'; // default: config/data/database→required, media→optional, cache/tmp→none
}

export interface Healthcheck {
  test: string[];                 // ["CMD", "curl", "-fsS", "http://localhost:8096/health"]
  intervalS: number; timeoutS: number; retries: number; startPeriodS: number;
}

export interface ResourceRequests {
  cpuMillicores: number;          // request
  ramMb: number;                  // request (planning estimate)
  ramLimitMb: number | null;
  gpu: 'none' | 'optional' | 'required';
  gpuApis: GpuApi[];              // acceptable APIs, any-of
}

// ----- network (a subnet drawn as a bus) -----
export interface NetworkNode extends NodeBase {
  kind: 'network';
  subnetId: SubnetId;             // invariant: at most one NetworkNode per subnet
  orientation: 'horizontal' | 'vertical';
}

// ----- group / frame -----
export interface GroupNode extends NodeBase {
  kind: 'group';
  groupKind: 'site' | 'rack' | 'zone' | 'frame';
  failureDomain: boolean;         // site/rack default true; used by BAK003 and site-failure simulation
  tone: 'neutral' | 'accent' | 'muted';
}

// ----- note -----
export interface NoteNode extends NodeBase {
  kind: 'note';
  text: string;                   // markdown subset: paragraphs, **bold**, `code`, lists
}

// ---------- subnets ----------
export type SubnetPurpose =
  | 'wan' | 'lan' | 'mgmt' | 'servers' | 'iot' | 'guest' | 'dmz' | 'storage'
  | 'vpn-overlay' | 'docker' | 'k8s-pod' | 'k8s-service';

export interface Subnet {
  id: SubnetId;
  name: string;                   // "LAN", "proxy-nw", "tailnet"
  cidr: Cidr;
  vlan: number | null;
  gateway: Ipv4 | null;
  dhcpRange: { start: Ipv4; end: Ipv4 } | null;
  dns: Ipv4[];
  purpose: SubnetPurpose;
  scope: { kind: 'global' } | { kind: 'host'; hostId: NodeId } | { kind: 'cluster'; clusterId: ClusterId };
  external: boolean;              // docker: network created outside compose (emitted as external: true)
  siteGroupId: NodeId | null;     // the site this L2 segment lives in; VLAN uniqueness is per site
}

// ---------- k8s ----------
export interface K8sCluster {
  id: ClusterId;
  name: string;                   // "lab"
  distro: 'k3s' | 'k8s' | 'talos' | 'microk8s';
  version: string;                // "v1.31"
  nodeIds: NodeId[];              // devices with role k8s-control-plane | k8s-worker
  podSubnetId: SubnetId;          // purpose k8s-pod, scope cluster
  serviceSubnetId: SubnetId;      // purpose k8s-service, scope cluster
  ingressClass: string;           // "traefik"
  storageClass: string;           // "local-path"
  namespaces: string[];           // sorted, unique, DNS-1123 labels
}

// ---------- DNS ----------
export interface DnsZone { id: ZoneId; apex: string; provider: 'cloudflare' | 'other' }

// ---------- links ----------
export type LinkKind =
  | 'ethernet' | 'wifi' | 'vpn-tunnel' | 'reverse-proxy'
  | 'depends-on' | 'replicates-to' | 'backup-to' | 'mounts';

export const LINK_KINDS: readonly LinkKind[] = [
  'ethernet', 'wifi', 'vpn-tunnel', 'reverse-proxy',
  'depends-on', 'replicates-to', 'backup-to', 'mounts',
] as const;

interface LinkBase<K extends LinkKind, A> {
  id: LinkId;
  kind: K;
  source: NodeId;                 // direction: consumer/origin → provider/destination
  target: NodeId;
  sourceHandle: 'top' | 'right' | 'bottom' | 'left' | null;
  targetHandle: 'top' | 'right' | 'bottom' | 'left' | null;
  label: string;                  // free text, may be ""
  attrs: A;
}

export interface EthernetAttrs {
  sourceNicId: NicId | null; targetNicId: NicId | null;   // null when the endpoint is a network node
  speedMbps: number | null; poe: boolean;
  cable: 'cat5e' | 'cat6' | 'cat6a' | 'dac' | 'fiber' | null;
  vlanMode: 'access' | 'trunk'; vlans: number[];
}
export interface WifiAttrs { sourceNicId: NicId | null; targetNicId: NicId | null; band: '2.4' | '5' | '6'; ssid: string }
export interface VpnTunnelAttrs {
  protocol: 'wireguard' | 'tailscale' | 'openvpn' | 'ipsec' | 'ssh';
  transport: 'udp' | 'tcp' | 'wstunnel' | 'ssh' | 'derp';
  endpointHost: string;           // "wg.mavubo.com" or IP
  endpointPort: number | null;
  overlaySubnetId: SubnetId | null;
  routedCidrs: Cidr[];            // reachable through the tunnel
  fullTunnel: boolean;            // default route via tunnel
}
export interface ReverseProxyAttrs {
  hostname: string;               // FQDN, unique across project
  targetPortId: PortId;           // a PortMapping of the target service
  pathPrefix: string;             // default "/"
  tls: boolean;
  auth: 'none' | 'basic' | 'sso' | 'cloudflare-access';
  websockets: boolean;
}
export interface DependsOnAttrs {
  reason: 'service' | 'database' | 'cache' | 'auth' | 'storage' | 'power' | 'network' | 'ci';
  hard: boolean;                  // hard = source is DOWN when target is down; soft = DEGRADED
}
export interface ReplicatesToAttrs {
  method: 'rsync' | 'zfs-send' | 'syncthing' | 'rclone' | 'db-replication' | 'custom';
  schedule: Cron | null;          // null = continuous
  sourcePath: string | null; targetPath: string | null;
  targetStorageId: StorageId | null;
}
export interface BackupToAttrs {
  tool: 'restic' | 'borg' | 'kopia' | 'pbs' | 'vzdump' | 'rsync' | 'custom';
  schedule: Cron;
  retention: string;              // "7d4w6m"
  targetStorageId: StorageId | null;
  volumeIds: VolumeId[];          // [] = all volumes of the source
  offsite: boolean;
}
export interface MountsAttrs {
  protocol: 'nfs' | 'smb' | 'sshfs' | 'bind' | 'iscsi' | 'rclone';
  exportPath: string; mountPath: string; readOnly: boolean;
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

export type RuleId = string; // "NET001" etc., see §6
```

### 2.3 Containment semantics

- **Flow parent** (derived in `src/editor/flowAdapter.ts`):
  - service with `placement.kind==='host'` → its `hostId`;
  - device with `placement.kind==='guest'` → its `hostId`;
  - otherwise → `groupId`, or none.
- **Invariants** (checked by the schema's `superRefine`):
  - a hosted node has `groupId === null`;
  - a host chain is at most 3 deep (physical → guest → service);
  - there are no cycles;
  - `guest.hostId` points to a device with role `hypervisor`;
  - `service.placement.hostId` points to a device.
- **Collapsed host:** its children are hidden on the canvas and drawn as chips inside the host card. Links to hidden children re-anchor to the nearest visible ancestor and draw dashed.
- **Effective IP of a service:**
  - host placement → the primary NIC IP of its host;
  - cluster placement → none (cluster Service);
  - standalone → none.
- **Port binding scope:** a published port binds on the effective host device. For docker, that is the host. For lxc-native/systemd, it is the device the service is placed on (the LXC itself).

### 2.4 Link validation rules (`src/domain/linkRules.ts`)

`canConnect(kind, source, target, project): { ok: true } | { ok: false; reason: string }` is used by React Flow's `isValidConnection` (live red/green feedback), by `connect` commands, and by analysis rule `LNK001` (stale links after edits). Common rules for every kind:
- source ≠ target;
- both nodes exist;
- neither is a `group` or `note`;
- no duplicate (same kind, same unordered pair for ethernet/wifi/vpn-tunnel, same ordered pair otherwise), except that ethernet allows duplicates if both NIC IDs differ.

| Kind | Source | Target | Directed | Kind-specific rules (reason text shown verbatim) |
|---|---|---|---|---|
| `ethernet` | device or network | device or network | no | Not network↔network ("Connect two subnets through a router"). Device endpoint must have a NIC of kind `ethernet` or `bridge` ("{label} has no wired NIC"). Guest devices connect only to a network node or their own host ("A guest connects through its host bridge"). |
| `wifi` | device or network | device or network | no | One endpoint is a device with role `access-point`, `router` or `modem`, or a network node. The other is a device with a `wifi` NIC ("{label} has no Wi-Fi NIC"). |
| `vpn-tunnel` | device | device | no | Both physical or guest devices, not role `switch`, `ups`, `smart-plug` or `internet`. Not host↔own guest. |
| `reverse-proxy` | service with capability `reverse-proxy` or `tunnel` | service | yes | Target has ≥1 port ("Target exposes no ports"). Target is not the source. |
| `depends-on` | service or device | service or device | yes | Both services, or both devices with `reason` ∈ {`power`, `network`}. Adding the link must not create a cycle among `hard` edges ("Creates a dependency cycle: a → b → a"). |
| `replicates-to` | service or device | service or device | yes | Target is a device with `storage.length > 0` or a service with ≥1 volume. |
| `backup-to` | service or device | device or service | yes | Target device role ∈ {`nas`, `server`, `hypervisor`, `vps`, `storage-device`, `docker-host`}, or a service with capability `backup-target`. |
| `mounts` | service or device | device or service | yes | Target device has storage, or target service has capability `file-share`. |

**Link-kind inference** (link tool set to `auto`):
- device/network ↔ device/network → `ethernet`, or `wifi` if the device's only NICs are wifi;
- service(reverse-proxy or tunnel capability) → service → `reverse-proxy`;
- service → service → `depends-on`;
- service → device with storage → `mounts`;
- anything else → rejected with "Pick a link type (1–8)".

### 2.5 Zod schema strategy (`src/domain/schema.ts`)

- Use one Zod schema per type above, all `z.strictObject` (unknown keys are rejected on import). The TS types in `types.ts` are hand-written for readable docs. Each schema is declared as `export const ProjectSchema = z.strictObject({...}) satisfies z.ZodType<Project>`. Also add `src/domain/schema.typetest.ts` with `expectTypeOf<z.infer<typeof ProjectSchema>>().toEqualTypeOf<Project>()`, run by Vitest typecheck mode (`vitest --typecheck` is part of `npm test`), so the types and schemas cannot drift.
- Primitive validators live in `src/domain/primitives.ts`: `ipv4` (regex + octets 0–255, no leading zeros), `cidr` (prefix 0–32, host bits zero), `mac`, `hostname` (RFC 1123), `fqdn`, `cron` (5 fields, permissive per-field regex), `port` (int 1–65535), `vlan` (int 1–4094), `slug`.
- Discriminated unions use `z.discriminatedUnion('kind', [...])` for `CanvasNode`, `Link`, `ServicePlacement`, `DevicePlacement`, `Subnet.scope`.
- `ProjectSchema.superRefine` checks referential integrity only:
  - unique IDs across each collection;
  - link endpoints exist;
  - every NIC/port/volume/storage/GPU ID referenced by a link attr, port forward, `gpuPassthrough` or `storageRef` exists;
  - every `subnetId` exists;
  - placement hosts exist and are devices;
  - containment invariants (§2.3);
  - `NetworkNode.subnetId` is unique;
  - cluster `nodeIds` exist.
  Each issue carries a `path` for the import error list.
- Defaults live in `src/domain/defaults.ts` (`defaultSettings()`, `defaultFirewall()`, `newDeviceFromCatalog(item, pos)`, `newServiceFromCatalog(item, pos)`). They are not done with Zod `.default()`. Import never fills in silent defaults: missing fields are errors, except where a migration adds them.

### 2.6 Versioned migrations (`src/domain/migrations/`)

- `index.ts` exports `migrate(raw: unknown): { project: unknown; from: number }`. It reads `raw.schemaVersion` with `z.object({ schemaVersion: z.number().int() }).passthrough()`, then applies `steps[v]` from `v` up to `CURRENT_SCHEMA_VERSION`. A version greater than current throws `ProjectTooNewError`. A missing version is treated as `0`.
- `steps: Record<number, (p: any) => any>`. Step `0 → 1` is the identity plus `schemaVersion: 1`; it accepts pre-release files that lack a version. Each future bump adds `v{n}_to_v{n+1}.ts`: a pure function with no imports from the current `types.ts`, which is frozen at that version.
- `loadProject(json: string): Result<Project, ImportError[]>` = `JSON.parse` → `migrate` → `ProjectSchema.safeParse` → map issues to `{ path: string; message: string }`.
- Fixtures: `tests/fixtures/migrations/project.v0.json` and `project.v1.json`. Every future version adds a frozen fixture, never edited afterwards. The test `migrations.test.ts > every historical fixture migrates to current and parses` iterates the folder.

### 2.7 Derived selectors (`src/domain/selectors.ts`)

These are pure functions memoised per `project` identity with `WeakMap`:
- `nodeById(p)`, `linksByNode(p)`, `childrenOf(p, id)`, `hostOf(p, id)`, `physicalHostOf(p, id)` (walks guest → host)
- `effectiveIp(p, serviceId)`, `getDependsOn(p, id)`, `getDependents(p, id)`
- `nicsBySubnet(p)`, `primaryNic(device)`, `servicesOnDevice(p, deviceId, { recursive })`
- `subnetForIp(p, ip)`

---

## 3. Editor architecture

### 3.1 Store (`src/store/`)

One Zustand store, `useAppStore`, made of slices. The domain document lives only in `doc.project`.

```ts
interface DocSlice {
  project: Project;
  loadProject(p: Project): void;            // resets history
}
interface HistoryEntry {
  label: string;                             // "Move 3 nodes", "Rename Jellyfin"
  patches: Patch[]; inverse: Patch[];
  coalesceKey: string | null;
  at: number;                                // ms timestamp (injected clock)
  selectionBefore: Selection; selectionAfter: Selection;
}
interface HistorySlice {
  past: HistoryEntry[]; future: HistoryEntry[];  // past capped at 200
  dispatch(cmd: Command): void;
  undo(): void; redo(): void;
  transact(label: string, fn: (d: Draft<Project>) => void): void; // multi-step as one entry
  applySilently(fn: (d: Draft<Project>) => void): void;           // live drag/resize, no history
  recordManual(label: string, patches: Patch[], inverse: Patch[]): void;
}
interface Selection { nodeIds: NodeId[]; linkIds: LinkId[] }
interface UiSlice {
  selection: Selection;
  tool: 'select' | 'pan';
  linkKind: LinkKind | 'auto';
  placing: CatalogSlug | null;               // click-to-place mode
  panels: { palette: boolean; inspector: boolean; drawer: boolean; minimap: boolean };
  drawerTab: 'findings' | 'budget' | 'exposure' | 'spof';
  theme: 'light' | 'dark' | 'system';
  simulate: { active: boolean; failed: NodeId[] };
  helperLines: { x: number | null; y: number | null };
  saveState: 'saved' | 'saving' | 'error';
  dialogs: { export: boolean; import: boolean; shortcuts: boolean; commandPalette: boolean; projects: boolean };
}
interface AnalysisSlice {
  report: AnalysisReport | null;
  runAnalysis(): void;                       // scheduled by subscription, debounced 250 ms
}
interface ClipboardSlice { internal: ClipboardPayload | null }
```

**Commands** (`src/store/commands/*.ts`) are factories returning `{ type, label, coalesceKey?, run(draft) }`:
- `nodes.ts`: `addNodeFromCatalog`, `addNote`, `addGroup`, `deleteNodes`, `renameNode`, `updateNodeField(id, path, value)`, `setStatus`, `toggleExpanded`, `bringToFront`, `sendToBack`, `lockNodes`, `alignNodes(mode)`, `distributeNodes(axis)`, `groupSelection`, `ungroup`
- `placement.ts`: `placeOnHost`, `unplace`, `placeOnCluster`
- `links.ts`: `connect`, `deleteLinks`, `changeLinkKind`, `reverseLink`, `updateLinkAttrs`
- `network.ts`: `addSubnet`, `updateSubnet`, `deleteSubnet` (detaches NICs), `addNic`, `updateNic`, `assignNextFreeIp`, `addPortForward`
- `service.ts`: `addPort`, `updatePort`, `addVolume`, `addEnv`, …
- `project.ts`: `renameProject`, `updateSettings`, `addCluster`, `addDnsZone`
- `clipboard.ts`: `pasteNodes(payload, at)`

`dispatch`:

```ts
const [next, patches, inverse] = produceWithPatches(state.project, cmd.run);
if (patches.length === 0) return;
next.updatedAt = clock.nowIso();   // done inside run via a wrapper so it is patched too
const top = past.at(-1);
if (cmd.coalesceKey && top?.coalesceKey === cmd.coalesceKey && clock.now() - top.at < 1000)
  top.patches.push(...patches), top.inverse.unshift(...inverse), top.at = clock.now();
else past.push({ label: cmd.label, patches, inverse, coalesceKey: cmd.coalesceKey ?? null, ... });
future = [];
```

### 3.2 Undo granularity

| Action | History entries |
|---|---|
| Drag N nodes | 1 on drag stop. During drag: `applySilently`. On stop: `recordManual('Move N nodes', toPatches, fromPatches)` built from positions captured at drag start. |
| Resize | 1 on resize end (same pattern) |
| Typing in an inspector field | coalesced by `coalesceKey = "edit:{nodeId}:{fieldPath}"` within 1000 ms |
| Paste / duplicate / delete selection / group | 1 each (`transact`) |
| Drop on host (re-parent) | 1 (move + placement in one transaction) |
| Import compose | 1 ("Import 14 services") |
| Selection, viewport, theme, panel toggles | never in history |

Undo restores `selectionBefore`; redo restores `selectionAfter`.

### 3.3 React Flow adapter (`src/editor/flowAdapter.ts`)

- The canvas is controlled. `toFlowNodes(project, ui)` and `toFlowEdges(project, ui)` are memoised per domain object. Immer's structural sharing keeps unchanged domain nodes reference-equal, and a `WeakMap<CanvasNode, FlowNode>` cache returns the same `FlowNode` object for an unchanged node and selection flag, so `memo` custom nodes skip re-render.
- `FlowNode.data = { nodeId }` only. Node components read their domain node with `useAppStore(s => nodeById(s.project).get(id))`, so updates are granular.
- Nodes are sorted depth-first (parents before children), as React Flow requires.
- `onNodesChange` handling:
  - `position` changes with `dragging: true` → `applySilently`;
  - `dragging: false` → `recordManual`;
  - `select` → UiSlice;
  - `remove` → `deleteNodes`;
  - `dimensions` → ignored (measured only).
- `onEdgesChange`: `select` → UiSlice; `remove` → `deleteLinks`.
- `onConnect(conn)` → `connect(resolveKind(ui.linkKind, src, tgt), conn)`. `isValidConnection(conn)` → `canConnect(...).ok`. While invalid, the connection line turns `--danger` and a tooltip shows the reason next to the cursor.
- Settings: `connectionMode={ConnectionMode.Loose}`, `snapToGrid`, `snapGrid={[8,8]}`, `minZoom={0.1}`, `maxZoom={2.5}`, `selectionOnDrag`, `panOnDrag={[1,2]}` (middle/right mouse), `panOnScroll` (trackpad), `zoomOnPinch`, `deleteKeyCode={null}` (our keymap handles deletion), `onlyRenderVisibleElements` when node count > 150.
- Each node has 4 handles (`top`, `right`, `bottom`, `left`), each acting as both source and target in Loose mode. Handles are 8 px and appear on hover or selection.
- **Parallel edges:** links between the same unordered pair get an index i ∈ [0..n). `LinkEdge` offsets its smoothstep path perpendicular by `(i - (n-1)/2) * 10` px.

### 3.4 Drag from palette (`src/editor/dnd.ts`)

- Palette items are `draggable`. `onDragStart` sets `dataTransfer.setData('application/x-rackdrafter', slug)` and `effectAllowed='copy'`. A custom drag image (the 40 px icon tile) comes from `setDragImage`.
- Canvas `onDragOver` calls `preventDefault()` and sets `dropEffect='copy'`. `onDrop` does:
  1. `pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })`, snapped to 8.
  2. Hit-test hosts with `getIntersectingNodes({ x: pos.x, y: pos.y, width: 1, height: 1 })`, filtered to expanded devices that accept the item (`acceptsChild(host, item)`). Take the smallest area.
  3. Dispatch `addNodeFromCatalog(slug, pos, hostId?)`. The new node is selected and the inspector focuses its label field.
- **Click-to-place:** clicking a palette item sets `ui.placing`, the cursor becomes a crosshair, and the next canvas click places the item. `Esc` cancels.
- **Keyboard:** Enter on a focused palette item inserts at the viewport centre (accessibility path, also used by e2e).
- `acceptsChild`:
  - LXC/VM catalog items → host role `hypervisor` only;
  - services → any device except roles `switch`, `ups`, `smart-plug`, `internet`, `modem`, `access-point`;
  - devices other than guests → never.
- **Re-parent on drag stop:** a service or guest dropped on a different accepting host is re-placed and its position converted to host-relative. A service dragged out of every host becomes `standalone`. A guest dragged out of its host snaps back, with the toast "LXC/VM must stay on a hypervisor".

### 3.5 Alignment, snapping, frames

- **Grid:** 8 px snap, toggled with `Ctrl+'` (persisted in `settings.snapToGrid`). The background is a dot grid with 16 px gap.
- **Helper lines** (`src/editor/helperLines.ts`): during drag, compare the dragged bounding box's left/centre/right and top/middle/bottom against the same lines of visible siblings with the same flow parent. Threshold 6 px screen-space (divide by zoom). Snap to the nearest match and set `ui.helperLines`. `HelperLinesOverlay.tsx` draws a 1 px `--accent` line across the viewport on a `<canvas>` layered over the flow.
- **Align/distribute** (≥2 selected; distribute needs ≥3): left, h-centre, right, top, v-middle, bottom; distribute horizontally/vertically by equal gaps. One history entry each.
- **Groups:** `Ctrl+G` wraps the selection in a `group` (`groupKind:'frame'`) sized to the selection bounds plus 32 px padding, plus a 28 px header. Children get `groupId` and relative positions. `Ctrl+Shift+G` ungroups. Groups are resizable with `NodeResizer` (min 160×120). Dragging a node fully inside a group's bounds on drag stop joins the group; dragging it out leaves. Sites (`groupKind:'site'`) are created from the palette's "Annotations" tab.
- **Expanded hosts** use `expandParent: true` on their children, so dragging a child to the edge grows the host. Hosts are resizable, with a minimum of 320×200.

### 3.6 Minimap and viewport

`<MiniMap pannable zoomable position="bottom-right" />`. It is 200×140, takes `nodeColor` from the kind token (device `--fg-muted`, service `--accent`, network `--link-ethernet`, group transparent with stroke), `maskColor` `hsl(var(--bg) / 0.7)`, and is toggled with `M`. `<Controls>` is not used; zoom controls live in the status bar. The viewport is saved to `project.viewport` (debounced 500 ms, outside history).

### 3.7 Multi-select, clipboard, context menus

- **Multi-select:** Shift+click toggles. Marquee is a left-drag on empty canvas (`selectionOnDrag`), selecting nodes that are partially inside (`SelectionMode.Partial`). `Ctrl+A` selects all top-level and visible nodes. Selecting a host does not select its children.
- **Clipboard payload:** `{ "type": "rackdrafter/clipboard", "version": 1, "nodes": [...], "links": [...], "subnets": [] }`.
  - Copy includes the selected nodes and their descendants, plus links whose both endpoints are included. It writes `navigator.clipboard.writeText(JSON)` and also `ClipboardSlice.internal` (the fallback when clipboard permission is denied).
  - Paste parses the system clipboard first, then the internal one. It remaps every ID (nodes, NICs, ports, volumes, links) and offsets top-level nodes by +24/+24 per consecutive paste. Each static NIC IP gets `assignNextFreeIp` in the same subnet (or `null` if exhausted). Hostnames get a `-2`/`-3` suffix when they collide. Pasting onto a selected expanded host places pasted services into it.
  - Pasted text that isn't a clipboard payload but parses as compose YAML (has `services:`) opens the Import Compose dialog prefilled.
- **Context menus** (Radix `ContextMenu`):
  - Node: Rename (F2), Duplicate, Copy, Cut, Delete, Expand/Collapse (hosts), Set status ▸, Simulate failure, Bring to front, Send to back, Lock/Unlock.
  - Edge: Change type ▸ (only kinds where `canConnect` passes), Reverse direction (directed kinds), Delete.
  - Canvas: Paste, Add note here, Add subnet bus here, Add frame here, Select all, Fit view.
  - Multi-selection: Group, Align ▸, Distribute ▸, Delete.

### 3.8 Keyboard map (`src/editor/keyboard.ts`)

A single `keydown` listener on `document`. It ignores events whose target is an input, textarea or contenteditable, except `Esc` and `Ctrl+S`. `Mod` = Ctrl on Linux/Windows, ⌘ on macOS.

| Keys | Action |
|---|---|
| `V` / `H` | Select tool / Hand (pan) tool |
| `Space` (hold) | Temporary pan |
| `0` | Link tool auto |
| `1`…`8` | Link tool: ethernet, wifi, vpn-tunnel, reverse-proxy, depends-on, replicates-to, backup-to, mounts |
| `Mod+Z` / `Mod+Shift+Z` / `Mod+Y` | Undo / Redo / Redo |
| `Mod+C` / `Mod+X` / `Mod+V` / `Mod+D` | Copy / Cut / Paste / Duplicate |
| `Delete` / `Backspace` | Delete selection |
| `Mod+A` | Select all |
| `Esc` | Cancel connect/placing, then clear selection, then close dialog |
| `Mod+G` / `Mod+Shift+G` | Group / Ungroup |
| `F2` | Rename selected node (inline) |
| `Enter` | Expand/collapse selected host |
| Arrow keys / `Shift+Arrow` | Nudge 8 px / 1 px (one history entry per 1000 ms burst via coalesceKey `nudge`) |
| `Mod+0` / `Mod+=` / `Mod+-` | Fit view / Zoom in / Zoom out |
| `Mod+1` | Zoom to selection |
| `M` | Toggle minimap |
| `Mod+'` | Toggle snap to grid |
| `Mod+K` | Command palette (insert catalog items, run commands) |
| `/` | Focus palette search |
| `Mod+E` / `Mod+I` | Export dialog / Import dialog |
| `Mod+S` | Flush save now, toast "Saved" |
| `Mod+.` | Toggle findings drawer |
| `F` | Toggle failure-simulation mode |
| `Shift+D` | Toggle dark/light |
| `?` | Shortcuts dialog |

### 3.9 Layout shell

| Region | Size | Contents |
|---|---|---|
| Top bar | 44 px | Left: app mark, project name (inline editable), save state ("Saved" / "Saving…"). Centre: Select/Hand toggle, link-kind segmented control (Auto + 8 icons with tooltips showing the shortcut). Right: findings counter (`2 errors · 5 warnings`, click opens drawer), Simulate, Import, Export, theme toggle, overflow menu (Projects, Templates, Shortcuts, Notices). |
| Left sidebar | 264 px, collapsible (`[`) | Tabs: Devices, Services, Networks (subnet manager), Annotations (site, rack, frame, note, subnet bus). Search field on top. Virtualised list (`@tanstack/react-virtual`), 36 px rows. |
| Right sidebar | 320 px, collapsible (`]`) | Inspector for the selection. Multi-selection shows only common fields (status, tags) and align tools. |
| Bottom drawer | 240 px, resizable 160–480 | Tabs: Findings, Budget, Exposure, SPOF |
| Status bar | 28 px, overlay bottom-left of canvas | Zoom % (click → menu of 50/100/200/Fit), node count, link count |

**Inspector sections:**
- Device: General (label, hostname, fqdn, status, vendor/model/os, role, form factor), Hardware (CPU, RAM, reserved RAM, storage list, GPUs), Interfaces (NIC table with "Assign next free IP"), Firewall, Port forwards, Advertised routes, Power & cost, Guest (VMID, type, GPU passthrough), Notes.
- Service: General (label, status, runtime, image, container name, placement), Ports, Environment, Volumes, Networks, Healthcheck, Resources, Capabilities, Notes.
- Link: kind-specific attrs.
- Subnet: all fields plus a usage bar.

---

## 4. Design system

### 4.1 How it avoids looking generated

These rules are enforced in review and by `tests/unit/design-lint.test.ts` (which greps `src/**/*.tsx|css`):

1. **No gradients, glassmorphism, glows, blur backdrops or emoji.** No Lucide "Sparkles"-style decorative icons. The lint test fails on `gradient(`, `backdrop-blur`, `blur-` in class names and on emoji code points in `src/`.
2. **Hairlines do the work.** 1 px borders separate everything. Shadows appear only on floating layers (menus, dialogs, toasts, dragged node).
3. **Machine values are monospace** with `font-variant-numeric: tabular-nums`: every IP, CIDR, port, MAC, VMID, image tag and hostname.
4. **Color carries meaning only:** one accent (signal orange, for selection and primary action), severity colors, and link-kind colors. Nodes are neutral. Brand color appears only inside icon tiles.
5. **Dense like a tool, not airy like a landing page.** Base text is 13 px, rows are 32–36 px, and panel padding is 12 px.
6. **The canvas is warm paper,** not pure white or blue-black. The dark theme is warm charcoal.
7. **Copy is terse and in an engineer's voice:** "3 errors", "Port 8080/tcp already bound by qbittorrent on 192.168.1.203". Never "Oops!", "Let's", or exclamation marks. Empty states state facts and give actions.
8. **Motion** is 120 ms `cubic-bezier(0.2, 0, 0, 1)` for state changes only. The only ambient animation is the VPN tunnel dash. All motion is disabled under `prefers-reduced-motion: reduce`.
9. **Real logos sit inside identical neutral tiles,** so a mixed set of brand marks reads as one system.
10. **No rounded-everything:** the radius maxes at 8 px on nodes and 12 px on dialogs.

### 4.2 Tokens (`src/styles/tokens.css`)

Tokens are HSL triplets in CSS variables and exposed to Tailwind v4 through `@theme inline`. Dark mode uses the `.dark` class on `<html>` via `@custom-variant dark (&:where(.dark, .dark *));`.

```css
:root {
  /* surfaces */
  --bg:            40 18% 97%;   /* canvas paper */
  --surface:        0  0% 100%;  /* panels, nodes */
  --surface-2:     40 14% 95%;   /* icon tiles, inputs, chips */
  --surface-3:     40 10% 91%;   /* hover, pressed */
  --border:        40  8% 86%;
  --border-strong: 40  6% 74%;
  --grid-dot:      40  6% 80%;
  /* text */
  --fg:            30  8% 12%;
  --fg-muted:      30  5% 40%;
  --fg-subtle:     30  4% 56%;
  /* accent: signal orange */
  --accent:        16 88% 52%;
  --accent-fg:      0  0% 100%;
  --accent-soft:   16 90% 95%;
  /* severity / status */
  --danger:         0 72% 48%;
  --warning:       42 92% 42%;
  --info:         212 80% 46%;
  --ok:           150 60% 32%;
  /* link kinds */
  --link-ethernet:      30  6% 42%;
  --link-wifi:         199 80% 42%;
  --link-vpn:          265 55% 55%;
  --link-proxy:        150 55% 34%;
  --link-depends:       30  4% 60%;
  --link-replicates:   185 70% 34%;
  --link-backup:       330 60% 48%;
  --link-mounts:       220 18% 44%;
}
.dark {
  --bg:            30  6%  8%;
  --surface:       30  5% 11%;
  --surface-2:     30  5% 14%;
  --surface-3:     30  5% 18%;
  --border:        30  5% 20%;
  --border-strong: 30  4% 30%;
  --grid-dot:      30  5% 22%;
  --fg:            40 15% 92%;
  --fg-muted:      35  6% 64%;
  --fg-subtle:     35  5% 46%;
  --accent:        18 92% 58%;
  --accent-fg:     20 30%  8%;
  --accent-soft:   18 60% 16%;
  --danger:         0 80% 62%;
  --warning:       42 95% 56%;
  --info:         212 90% 66%;
  --ok:           150 55% 52%;
  --link-ethernet:      35  6% 62%;
  --link-wifi:         199 85% 60%;
  --link-vpn:          265 75% 72%;
  --link-proxy:        150 55% 52%;
  --link-depends:       35  5% 46%;
  --link-replicates:   185 65% 52%;
  --link-backup:       330 70% 66%;
  --link-mounts:       220 20% 64%;
}
```

| Scale | Values |
|---|---|
| Spacing (`--spacing: 4px`, Tailwind multiples) | 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64 px |
| Radii | `--radius-xs` 3 px (chips), `--radius-sm` 4 px (inputs, badges), `--radius-md` 6 px (buttons, icon tile in lists), `--radius-lg` 8 px (nodes, 40 px icon tile), `--radius-xl` 12 px (dialogs, menus) |
| Shadows (light) | `--shadow-sm: 0 1px 0 hsl(30 10% 10% / .04)`; `--shadow-md: 0 2px 6px -1px hsl(30 10% 10% / .08), 0 1px 2px hsl(30 10% 10% / .06)`; `--shadow-lg: 0 12px 32px -8px hsl(30 10% 10% / .18), 0 2px 6px hsl(30 10% 10% / .08)` |
| Shadows (dark) | Same geometry with `hsl(0 0% 0% / .5)` and `/ .35` |
| Focus ring | `0 0 0 2px hsl(var(--surface)), 0 0 0 4px hsl(var(--accent))` |
| Selection ring (nodes) | border `1.5px hsl(var(--accent))` + `0 0 0 3px hsl(var(--accent-soft))` |

**Type scale** (size/line-height): `2xs` 11/14, `xs` 12/16, `sm` 13/18 (base), `md` 14/20, `lg` 16/22, `xl` 20/26, `2xl` 24/30. Only weights 400, 500 and 600 are used. Section headers are `2xs`, uppercase, `letter-spacing: .06em`, color `--fg-subtle`.

### 4.3 Typography

**IBM Plex Sans** is the UI face and **IBM Plex Mono** carries machine values. Plex reads technical and engineered, a nod to network gear documentation, and is visibly not Inter, the default face of generated UIs. Both are OFL-1.1 licensed. They are bundled through Fontsource npm packages and imported in `src/main.tsx` (`@fontsource/ibm-plex-sans/400.css`, `/500.css`, `/600.css`, `@fontsource/ibm-plex-mono/400.css`, `/500.css`). Vite emits the woff2 files with hashed names, so no CDN is involved. `font-display: swap` is used, the Latin subset only.
- Sans stack: `"IBM Plex Sans", system-ui, sans-serif`
- Mono stack: `"IBM Plex Mono", ui-monospace, monospace`

### 4.4 Node anatomy

```
┌──────────────────────────────────────────────┐  width 232 (device) / 208 (service)
│ ┌──────┐  Jellyfin                        ●  │  label: 13/500 --fg, truncate; status dot 8px
│ │ icon │  CT 101 · jellyfin/jellyfin:10.10   │  sublabel: 12/400 --fg-muted, truncate
│ └──────┘                                     │  icon tile 40×40, radius 8
│ [192.168.1.202] [:8096] [GPU]                │  badge row: mono 11, h18, radius 3
└──────────────────────────────────────────────┘  padding 10/12, gap 10, border 1px --border, radius 8
```

- **Icon tile:** 40×40, `--surface-2` background, 1 px `--border`, radius 8.
  - Brand logos render at 24×24 via `<img src="/icons/{file}.svg" alt="" draggable=false>`.
  - Tabler glyphs render at 22×22 inline, `stroke-width: 1.5`, `currentColor` = `--fg`.
  - Simple Icons glyphs render as inline SVG filled with the brand hex. If the hex has contrast below 3:1 against `--surface-2` in the current theme, they fill with `--fg` instead (checked once at build in `icons.lock.json` as `{ hexLight, hexDark }`).
- **Status dot:** 8 px, top-right, inset 10 px.
  - `planned`: hollow, 1.5 px `--border-strong`
  - `running`: `--ok`
  - `degraded`: `--warning`
  - `broken`: `--danger`
  - `retired`: `--fg-subtle`, and the label is struck through
- **Sublabel content:**
  - device → `{os} · {cores}c/{threads}t · {ram GB} GB`; guests are prefixed `CT {vmid}` or `VM {vmid}`
  - service → `{host label}` (or `{cluster}/{namespace}`) + ` · {image without registry}`
- **Badge row** (max 3 visible, then `+N`):
  - device: primary IP, extra IPs, `vlan {n}`
  - service: effective IP, published ports `:{hostPort}` (UDP shown as `:{port}/udp`), `GPU` if the service requests a GPU
  - Badges are `--surface-2` with a 1 px `--border`.
- **Finding marker:** a 16 px circle at the top-left corner, offset −6/−6, in the color of the highest severity on the node, showing the count. Hovering shows the first two finding titles.
- **Expanded host:** the header uses the anatomy above, followed by a 1 px divider and a body area (padding 12) with children. On a collapsed host the badge row is replaced by service chips: 20 px tall, 16 px icon plus truncated name, max 6, then `+N`.
- **Service node in simulation:** `data-state="down"` sets opacity 0.45, `--danger` border and a diagonal hatch overlay. `degraded` uses a `--warning` border. `unreachable` uses a dashed `--warning` border.
- **Network node (subnet bus):** height 32, default width 480, resizable horizontally only. A 4 px bar in `--link-ethernet` along the centre line. Label at left as `LAN  192.168.1.0/24  vlan —`, in mono for the values. Usage at right as `14/254`. Handles are distributed every 48 px along the bar (top and bottom).
- **Group:** transparent fill, 1 px dashed `--border-strong` (site: solid), radius 8. A 28 px header with an uppercase `2xs` label and a kind glyph (Tabler `building` for site, `server-2` for rack, `frame` for frame, `layout-grid` for zone).
- **Note:** `--surface` background, 1 px `--border`, left 3 px `--warning` rule, 13 px text. No sticky-yellow fill.

### 4.5 Edge styling (`src/editor/edges/edgeStyles.ts`)

All edges are smoothstep paths (`borderRadius: 6`). Every kind is distinguishable without color, by dash pattern and marker.

| Kind | Stroke | Width | Dash | Marker | Label (shown) |
|---|---|---|---|---|---|
| ethernet | `--link-ethernet` | 1.5 | solid | none | speed if set (`1G`, `2.5G`) on hover/selection |
| wifi | `--link-wifi` | 1.5 | `2 4` | none | band (`5 GHz`) on hover |
| vpn-tunnel | `--link-vpn` | 2 | `6 4`, animated `stroke-dashoffset` −20 over 1.2 s linear infinite (static when reduced motion) | lock glyph at midpoint (12 px Tabler `lock`) | `wireguard · wstunnel:443` always |
| reverse-proxy | `--link-proxy` | 1.5 | solid | arrow (closed, 8 px) | hostname always (mono 11) |
| depends-on | `--link-depends` | 1 | `1 3` | arrow (open) | reason on hover |
| replicates-to | `--link-replicates` | 1.5 | `8 3` | double arrow | method on hover |
| backup-to | `--link-backup` | 1.5 | `4 2` | arrow + clock glyph at midpoint | schedule on hover |
| mounts | `--link-mounts` | 1 | solid | diamond (6 px) at target | protocol + mountPath on hover |

- **Selected edge:** width +1, color `--accent`.
- **Invalid connection line:** `--danger` with dash `4 4`.
- **Labels:** `EdgeLabelRenderer` pill, `--surface` background, 1 px `--border`, radius 3, mono 11, padding 1/5.

### 4.6 Empty state

Shown when `project.nodes.length === 0`, centred on the canvas, max width 420, no illustration:

```
Empty canvas
Drag a device or service from the left, or start from a template.

[ Homelab reference ]  [ k3s + CI/CD ]  [ Blank ]
Press Ctrl K to search the catalog · ? for shortcuts
```

The title is 16/600 `--fg`, the body 13 `--fg-muted`, and the buttons are secondary style. Keyboard hints use `<Kbd>` chips.

### 4.7 Components (`src/ui/`)

| Component | Spec |
|---|---|
| `Button` | Variants `primary` (accent bg), `secondary` (surface + border), `ghost`, `danger`. Heights 28 and 32. Icon-only buttons are 28×28 with a required `aria-label` (enforced by TS prop types). |
| `IconTile` | Sizes 40/28/20, renders from `icons.lock.json` |
| `Badge` | Variants `mono`, `severity` |
| `StatusDot` | |
| `Kbd` | |
| `Field` | Label + input + error text |
| `Select` | Native `<select>` styled; Radix Select is not used |
| `Tooltip` | Radix, 400 ms delay |
| `Dialog` | Radix |
| `Toast` | Own tiny queue, bottom-centre, 4 s |

---

## 5. Catalog

### 5.1 Types (`src/catalog/types.ts`)

```ts
export interface IconRef {
  slug: string;                         // canonical: "jellyfin"
  prefer: 'brand' | 'glyph';            // devices default 'glyph', services 'brand'
  glyph: string;                        // Tabler outline name, always present: "server"
  aliases?: Partial<Record<IconSource, string>>; // per-source slug overrides: { 'simple-icons': 'postgresql' }
}
export type IconSource = 'dashboard-icons' | 'selfhst' | 'simple-icons' | 'tabler';

interface CatalogItemBase {
  slug: CatalogSlug;                    // unique kebab-case
  name: string;                         // "Jellyfin"
  category: string;                     // palette section
  tags: string[];                       // search keywords
  description: string;                  // <= 80 chars, shown in palette tooltip
  icon: IconRef;
  officialUrl: string;
}
export interface DeviceCatalogItem extends CatalogItemBase {
  kind: 'device';
  guest?: 'lxc' | 'vm';                 // when present, must be placed on a hypervisor
  defaults: Omit<DeviceSpec, 'nics' | 'storage' | 'gpus'> & {
    nics: Omit<NetworkInterface, 'id'>[];
    storage: Omit<StorageDevice, 'id'>[];
    gpus: Omit<Gpu, 'id'>[];
  };
}
export interface ServiceCatalogItem extends CatalogItemBase {
  kind: 'service';
  imageMatchers: RegExp[];              // for compose import: [/^(lscr\.io\/)?linuxserver\/jellyfin(:|$)/, /^jellyfin\/jellyfin(:|$)/]
  defaults: Omit<ServiceSpec, 'ports' | 'env' | 'volumes' | 'networks'> & {
    ports: Omit<PortMapping, 'id'>[];
    env: Omit<EnvVar, 'id'>[];
    volumes: Omit<VolumeMount, 'id' | 'storageRef'>[];
  };
  defaultWorkload: 'deployment' | 'statefulset' | 'daemonset';
}
export type CatalogItem = DeviceCatalogItem | ServiceCatalogItem;
```

Items are authored with `defineDevice({...})` and `defineService({...})` (identity functions typed for inference) in `src/catalog/devices/*.ts` and `src/catalog/services/*.ts`. `src/catalog/index.ts` concatenates them into `CATALOG: readonly CatalogItem[]` sorted by `kind`, `category`, `name`, and builds `catalogBySlug: Map`. `catalog.test.ts` asserts:
- slugs are unique;
- every item parses with `DeviceSpecSchema`/`ServiceSpecSchema` after ID assignment;
- descriptions are ≤ 80 chars;
- every `icon.slug` exists in `icons.lock.json`;
- docker services have an `image` with an explicit tag (no `:latest` except `custom-container`);
- every service has `resources.ramMb > 0` except `proxmox-ve-ui` and `custom-external`;
- the total count is 145.

### 5.2 Default resource requests

| Category default (cpu m / RAM MB) | Value |
|---|---|
| media | 500 / 512 |
| downloads | 250 / 256 |
| networking | 100 / 64 |
| monitoring | 100 / 128 |
| dashboards | 100 / 256 |
| data | 250 / 256 |
| files | 250 / 256 |
| apps | 100 / 256 |
| devops | 250 / 512 |
| k8s | 100 / 128 |
| home | 250 / 512 |
| gaming | 1000 / 2048 |
| backup | 250 / 256 |
| platform | 250 / 512 |
| security | 100 / 256 |
| ai | 2000 / 8192 |
| custom | 100 / 128 |

Explicit overrides (used by the seeds; the numbers are contractual because the seed budget tests depend on them):

| slug | cpu m | RAM MB | GPU | Ports (container→default host) |
|---|---|---|---|---|
| cloudflared | 50 | 64 | none | — (`tunnel` capability) |
| jellyfin | 1000 | 2048 | optional [qsv, vaapi, nvenc] | 8096/tcp |
| qbittorrent | 500 | 512 | none | 8080/tcp, 6881/tcp, 6881/udp (6881 unpublished by default) |
| kavita | 250 | 256 | none | 5000/tcp |
| stash | 500 | 512 | optional | 9999/tcp |
| filebrowser | 100 | 64 | none | 80/tcp |
| immich | 1500 | 3072 | optional | 2283/tcp |
| sonarr | 250 | 384 | none | 8989/tcp |
| prowlarr | 250 | 256 | none | 9696/tcp |
| flaresolverr | 250 | 512 | none | 8191/tcp |
| samba | 100 | 128 | none | 445/tcp |
| tailscale | 50 | 64 | none | 41641/udp unpublished |
| proxmox-ve-ui | 0 | 0 | none | 8006/tcp (adminUi; overhead counted in host `reservedRamMb`) |
| nginx-proxy-manager | 250 | 256 | none | 80, 443, 81 (adminUi) |
| navidrome | 100 | 128 | none | 4533/tcp |
| yamtrack | 250 | 256 | none | 8000/tcp |
| redis | 50 | 64 | none | 6379/tcp unpublished |
| miniflux | 100 | 128 | none | 8080/tcp |
| postgres | 250 | 256 | none | 5432/tcp unpublished |
| grafana | 100 | 256 | none | 3000/tcp |
| prometheus | 250 | 512 | none | 9090/tcp unpublished |
| node-exporter | 50 | 32 | none | 9100/tcp unpublished |
| cadvisor | 100 | 128 | none | 8080/tcp unpublished |
| homarr | 100 | 256 | none | 7575/tcp |
| couchdb | 250 | 256 | none | 5984/tcp |
| audiobookshelf | 250 | 256 | none | 80/tcp |
| docker-registry | 100 | 64 | none | 5000/tcp |
| nextcloud | 500 | 512 | none | 80/tcp unpublished |
| mariadb | 250 | 512 | none | 3306/tcp unpublished |
| glances | 100 | 64 | none | 61208/tcp unpublished |
| wstunnel | 50 | 32 | none | 8080/tcp unpublished |
| wireguard | 50 | 16 | none | 51820/udp |
| crafty-controller | 1000 | 2048 | none | 8443/tcp (adminUi), 25565/tcp unpublished |
| custom-container | 100 | 128 | none | — |
| custom-systemd | 100 | 128 | none | — |
| gitea | 250 | 512 | none | 3000/tcp, 22/tcp |
| gitea-act-runner | 1000 | 2048 | none | — (`ci-runner`) |
| argocd | 500 | 1024 | none | 8080/tcp (adminUi) |
| traefik | 100 | 128 | none | 80, 443 (`reverse-proxy`, `ingress-controller`) |
| cert-manager | 50 | 128 | none | — |

### 5.3 File layout and the 145 entries

```
src/catalog/
  types.ts                 CatalogItem, IconRef types
  define.ts                defineDevice/defineService helpers + category defaults (§5.2)
  index.ts                 CATALOG, catalogBySlug, searchCatalog(query)
  icons.lock.json          GENERATED: slug -> {source, file, sha256, license, hexLight?, hexDark?}
  iconUrl.ts               resolveIcon(slug): {kind:'img', src} | {kind:'glyph', svg} | {kind:'mono', svg, hex}
  glyphs.generated.ts      GENERATED: inline Tabler SVG strings for all glyph names used (tree-shaken subset)
  devices/
    compute.ts   (12) mini-pc, intel-nuc, dell-optiplex-micro, lenovo-thinkcentre-tiny, raspberry-pi-5,
                      raspberry-pi-4, zimaboard, tower-server, rack-server-1u, rack-server-2u,
                      workstation, gpu-transcoder-box
    virtual.ts   (6)  proxmox-node, docker-host, k8s-control-plane, k8s-worker, lxc-container, virtual-machine
    cloud.ts     (4)  vps, cloud-vm, internet, cloudflare-edge
    network.ts   (8)  isp-modem, isp-router, router, firewall-appliance, managed-switch,
                      unmanaged-switch, poe-switch, access-point
    storage.ts   (4)  nas-2bay, nas-4bay, usb-ssd, usb-hdd
    power.ts     (2)  ups, smart-plug
    clients.ts   (11) laptop, gaming-laptop, desktop-pc, phone, tablet, steam-deck, smart-tv,
                      game-console, iot-sensor, zigbee-coordinator, ip-camera
  services/
    media.ts       (10) jellyfin, plex, navidrome, audiobookshelf, kavita, komga, stash, immich, tdarr, jellyseerr
    downloads.ts   (8)  qbittorrent, sabnzbd, sonarr, radarr, lidarr, prowlarr, bazarr, flaresolverr
    networking.ts  (12) nginx-proxy-manager, caddy, traefik, nginx, cloudflared, tailscale, wireguard,
                        wg-easy, wstunnel, pihole, adguard-home, unbound
    monitoring.ts  (10) grafana, prometheus, node-exporter, cadvisor, loki, alertmanager, uptime-kuma,
                        glances, gotify, ntfy
    dashboards.ts  (2)  homarr, homepage
    data.ts        (6)  postgres, mariadb, redis, mongodb, couchdb, influxdb
    files.ts       (7)  nextcloud, filebrowser, samba, nfs-server, syncthing, paperless-ngx, stirling-pdf
    apps.ts        (5)  vaultwarden, bookstack, miniflux, freshrss, yamtrack
    devops.ts      (9)  gitea, gitlab-ce, gitea-act-runner, gitlab-runner, jenkins, docker-registry,
                        argocd, portainer, watchtower
    k8s.ts         (5)  k3s-server, metallb, cert-manager, longhorn, ingress-nginx
    home.ts        (6)  home-assistant, mosquitto, zigbee2mqtt, node-red, esphome, frigate
    gaming.ts      (2)  crafty-controller, minecraft-server
    backup.ts      (5)  restic-rest-server, borgmatic, kopia, proxmox-backup-server, rclone
    platform.ts    (3)  proxmox-ve-ui, truenas-scale, openmediavault
    security.ts    (3)  authelia, authentik, crowdsec
    ai.ts          (2)  ollama, open-webui
    custom.ts      (3)  custom-container, custom-systemd, custom-external
```

Totals: devices 47, services 98, **all 145**.

**Device glyphs** (Tabler outline names; `icons:verify` fails if a name is missing from the installed `@tabler/icons`, and the implementer then substitutes the closest existing name and updates this table in a commit):

| Glyph | Items |
|---|---|
| `device-desktop` | mini-pc, intel-nuc, dell-optiplex-micro, lenovo-thinkcentre-tiny |
| `cpu` | raspberry-pi-5, raspberry-pi-4, zimaboard |
| `server` | tower-server |
| `server-2` | rack-server-1u, rack-server-2u |
| `device-desktop-analytics` | workstation |
| `device-laptop` | laptop, gaming-laptop |
| `cpu-2` | gpu-transcoder-box |
| `stack-2` | proxmox-node (prefer brand `proxmox`) |
| `box` | docker-host (prefer brand `docker`), lxc-container |
| `hexagons` | k8s-control-plane, k8s-worker |
| `app-window` | virtual-machine |
| `cloud` | vps, cloud-vm |
| `world` | internet |
| `cloud-lock` | cloudflare-edge (prefer brand `cloudflare`) |
| `building-broadcast-tower` | isp-modem |
| `router` | isp-router, router |
| `wall` | firewall-appliance |
| `topology-star-3` | managed-switch, unmanaged-switch, poe-switch |
| `access-point` | access-point |
| `database` | nas-2bay, nas-4bay |
| `device-sd-card` | usb-ssd, usb-hdd |
| `battery-charging` | ups |
| `plug` | smart-plug |
| `device-mobile` | phone |
| `device-tablet` | tablet |
| `device-gamepad-2` | steam-deck, game-console |
| `device-tv` | smart-tv |
| `temperature` | iot-sensor |
| `antenna` | zigbee-coordinator |
| `device-cctv` | ip-camera |

Service glyph fallbacks by category:

| Category | Glyph |
|---|---|
| media | `movie` |
| downloads | `download` |
| networking | `arrows-exchange` |
| monitoring | `chart-line` |
| dashboards | `layout-dashboard` |
| data | `database` |
| files | `folders` |
| apps | `apps` |
| devops | `git-branch` |
| k8s | `hexagons` |
| home | `home` |
| gaming | `device-gamepad-2` |
| backup | `archive` |
| platform | `server-cog` |
| security | `shield-lock` |
| ai | `brain` |
| custom | `box` (container), `terminal-2` (systemd), `cloud` (external) |

### 5.4 Icon resolution chain

At **build time**, not runtime, `fetch-icons` resolves each catalog `icon` as follows:

1. If `prefer === 'glyph'` → Tabler `glyph`. Stop.
2. dashboard-icons `svg/{aliases['dashboard-icons'] ?? slug}.svg`
3. selfh.st icons `svg/{aliases.selfhst ?? slug}.svg`
4. simple-icons `icons/{aliases['simple-icons'] ?? slug}.svg` (from the npm package, no network)
5. Tabler `glyph` (from the npm package, no network)

The first hit wins and is recorded in `src/catalog/icons.lock.json`. At runtime `resolveIcon(slug)` only reads the lock: `brand` → `<img src="/icons/{slug}.svg">`, `simple-icons` → inline mono SVG with `hexLight`/`hexDark`, `tabler` → the inline string from `glyphs.generated.ts`. If a slug is missing from the lock at runtime (it shouldn't be; a test guards this), the tile shows the Tabler `box` glyph and logs `console.warn` once.

### 5.5 Download and bundling script (`scripts/icons/`)

| File | Purpose |
|---|---|
| `sources.ts` | Pinned source definitions (below) |
| `fetch-icons.ts` | CLI entry: resolve, download, normalise, write lock, write notices |
| `normalize.ts` | SVGO pass + sanitiser |
| `notices.ts` | Builds `THIRD_PARTY_NOTICES.md` + `public/THIRD_PARTY_NOTICES.md` |
| `verify-icons.ts` | Offline verification used in `verify` |

```ts
// sources.ts — refs are commit SHAs pinned at implementation time; changing a ref is a reviewed commit
export const SOURCES = {
  'dashboard-icons': { repo: 'homarr-labs/dashboard-icons', ref: '<sha>', path: (s: string) => `svg/${s}.svg`, licenseFile: 'LICENSE' },
  'selfhst':         { repo: 'selfhst/icons',               ref: '<sha>', path: (s: string) => `svg/${s}.svg`, licenseFile: 'LICENSE' },
  'simple-icons':    { npm: 'simple-icons',  path: (s: string) => `icons/${s}.svg`,         licenseFile: 'LICENSE.md' },
  'tabler':          { npm: '@tabler/icons', path: (s: string) => `icons/outline/${s}.svg`, licenseFile: 'LICENSE' },
} as const;
```

- **Network:** `https://raw.githubusercontent.com/{repo}/{ref}/{path}`, fetched with Node 22 `fetch`, concurrency 8, 10 s timeout, 2 retries. A 404 means "try next source". Any other status fails the run. User-Agent `rackdrafter-icon-fetch`.
- **Cache:** `.cache/icons/{source}/{ref}/{file}` (gitignored). `--offline` uses only the cache and npm packages and fails on a cache miss. `--refresh` ignores the cache. `--only jellyfin,immich` limits the run.
- **Normalise** with SVGO preset-default minus `removeViewBox`, plus `removeDimensions`, `removeScripts`, `removeXMLNS: false`. Then a sanitiser rejects (exit 1) any SVG that still contains `<script`, `<foreignObject`, `on*=` attributes, `href="http`, or `xlink:href="http`. Output must have a `viewBox` and be ≤ 64 KB. Brand SVGs keep their colors.
- **Write:** brand and selfh.st icons go to `public/icons/{slug}.svg`. Tabler glyphs used are collected into `src/catalog/glyphs.generated.ts` (`export const GLYPHS: Record<string, string>`), which is tree-shaken to only the used names, about 60. Simple Icons go to `src/catalog/simple.generated.ts` with path data + hex, and contrast against `--surface-2` light/dark is computed to fill `hexLight`/`hexDark`, using `--fg` when below 3:1.
- **Lock:** `icons.lock.json` maps `slug → { source, ref, file, sha256, license }`, sorted keys and 2-space JSON, for a deterministic diff.
- **Licenses:** for each source used, read its license file at the pinned ref (or from `node_modules`). Record the SPDX ID taken from the license file's content via a small matcher table (MIT, Apache-2.0, CC0-1.0, CC-BY-4.0). An unrecognised license makes the script fail, so a human must classify it.
- **Notices:** `THIRD_PARTY_NOTICES.md` has a section per source: name, repo URL, pinned ref, SPDX ID, the full license text, and the list of slugs taken from it. A **trademark notice** states that brand logos are trademarks of their owners and are used to identify the software, with no endorsement. Fonts (IBM Plex, OFL-1.1) and React Flow (MIT) are listed too. The same file is copied to `public/` and linked from the overflow menu as "Notices".
- **Generated icons are committed** (`public/icons`, `icons.lock.json`, `*.generated.ts`), so `npm ci && npm run verify` never needs the network.
- **`icons:verify`** (offline, part of `verify`):
  - every catalog icon has a lock entry;
  - every lock file exists and its sha256 matches;
  - no orphan files in `public/icons`;
  - every glyph name exists in `GLYPHS`;
  - sanitiser rules pass;
  - `THIRD_PARTY_NOTICES.md` mentions every source present in the lock.

---

## 6. Analysis engine

### 6.1 Shape (`src/analysis/types.ts`)

```ts
export type Severity = 'error' | 'warning' | 'info';
export interface Finding {
  id: string;                      // `${ruleId}:${sortedSubjectIds.join(',')}` (+ `:${discriminator}` when needed) — deterministic
  ruleId: RuleId;
  severity: Severity;
  title: string;                   // one line, no trailing period
  detail: string;                  // one or two sentences, includes the concrete values
  subjects: { nodeIds: NodeId[]; linkIds: LinkId[]; subnetIds: SubnetId[] }; // each sorted
  data?: Record<string, unknown>;  // rule-specific numbers for panels
  fix?: { label: string; command: 'assignNextFreeIp' | 'unpublishPort' | 'changeHostPort' | 'setTls' ; args: unknown };
}
export interface AnalysisReport {
  findings: Finding[];             // sorted: severity (error, warning, info), ruleId, id
  counts: Record<Severity, number>;
  resources: HostResourceUsage[];  // per host, for Budget tab
  cost: CostReport;
  exposure: ExposureEntry[];
  spof: SpofEntry[];
}
export interface Rule {
  id: RuleId; category: 'network' | 'ports' | 'resources' | 'failure' | 'cost' | 'backup' | 'exposure' | 'links' | 'k8s';
  run(ctx: AnalysisContext): Finding[];
}
```

- `analyze(project, catalog): AnalysisReport` is pure and synchronous. It builds `AnalysisContext` once (indexes from §2.7, the IP index `Map<subnetId, Map<uint32, NicRef[]>>`, the effective host of each service, and the exposure graph), runs every rule not in `settings.disabledRules`, then sorts.
- It runs on the main thread inside `requestIdleCallback` (falling back to `setTimeout(0)`), debounced 250 ms after the last dispatch.
- Budget: `analyze` on a 300-node fixture must take < 30 ms in Node (`perf.test.ts`). If that is breached, analysis moves to a worker in v1.1.
- IPv4 maths lives in `src/lib/net/ipv4.ts`:
  - `toUint32`, `fromUint32`, `parseCidr → {network, prefix, size, first, last, broadcast}`
  - `contains`, `overlaps`, `rangeSize`, `nextFree(subnet, used, exclude)`
  - IPv6 strings are rejected by the schema in v1.

### 6.2 Network rules

| ID | Severity | Inputs | Rule | Title example |
|---|---|---|---|---|
| NET001 | error | subnets | `cidr` host bits not zero, or prefix > 32 (schema catches syntax; this catches values edited via raw JSON) | `Subnet LAN has host bits set (192.168.1.5/24)` |
| NET002 | error / warning | subnets | Two subnets overlap. **error** if both have scope `global`, or both are scoped to the same host/cluster. **warning** if one is host/cluster scoped and overlaps a global subnet (a docker bridge shadowing LAN routes). Pairs with different scopes on different hosts are ignored. | `docker net proxy-nw (172.18.0.0/16) overlaps LAN` |
| NET003 | error | subnets | Same non-null `vlan`, same `siteGroupId`, different CIDR | `VLAN 20 used by both servers and iot` |
| NET004 | error | NICs | `ip` not inside its subnet's CIDR | `192.168.2.5 on pve/vmbr0 is outside LAN 192.168.1.0/24` |
| NET005 | error | NICs | Same IP on two NICs in the same subnet. Both carry `ip` and are not both `dhcp && !reserved`. | `192.168.1.202 assigned to jellyfin and kavita` |
| NET006 | error | NICs | IP equals the network or broadcast address (skipped for prefix ≥ 31) | |
| NET007 | error | NICs, subnet.gateway | IP equals the gateway, and the device role is not `router`/`firewall`/`modem` and the NIC doesn't belong to the device chosen as gateway | |
| NET008 | warning | NICs, dhcpRange | Static (`dhcp=false`) IP inside the DHCP range | `Static 192.168.1.120 on X falls inside DHCP pool .100–.199` |
| NET009 | error | subnets | Gateway outside the CIDR, or equal to network/broadcast | |
| NET010 | error | subnets | DHCP range outside the CIDR, `start > end`, or containing the gateway | |
| NET011 | error | NICs | `nic.vlan` set and ≠ `subnet.vlan` | |
| NET012 | warning | subnets | Allocated addresses (static + reserved + range size) / usable hosts ≥ `thresholds.subnetWarn` | |
| NET013 | warning | NICs | NIC has an `ip` but `subnetId === null` | |
| NET014 | warning | devices | A guest NIC's subnet differs from every bridge NIC subnet on its host (except `vpn-overlay`/`docker`) | `CT 101 on LAN but pve has no bridge on LAN` |
| NET015 | info | devices | Physical device role ∈ {server, hypervisor, nas, docker-host, k8s-*} with no NIC on a non-overlay subnet | |
| NET016 | error | NICs | Device has more than one `primary` NIC, or none while it has NICs (auto-fix sets the first one) | |

### 6.3 Port rules

The binding key for a published port is `(bindDeviceId, proto, hostPort)`. `bindDeviceId` = effective host (§2.3). Bind IPs conflict when either is `null` (0.0.0.0) or they are equal.

| ID | Severity | Rule |
|---|---|---|
| PORT001 | error | Two published ports on the same `bindDeviceId` with the same proto/hostPort and conflicting bind IPs. Title: `Port 8080/tcp bound twice on vps: miniflux, qbittorrent`. Fix: `changeHostPort` to the next free port ≥ hostPort+1. |
| PORT002 | error | Two port forwards on the same router WAN NIC with the same `externalPort`/proto |
| PORT003 | error | Port forward targets a device/port where no service publishes that `targetPort` (it would forward into nothing) |
| PORT004 | error | `reverse-proxy` `targetPortId` doesn't exist on the target service |
| PORT005 | error | Duplicate `reverse-proxy` hostname + pathPrefix across the project |
| PORT006 | error | Same `containerPort`/proto listed twice in one service |
| PORT007 | warning | Reverse-proxy hostname not under any `dnsZones[].apex` |
| PORT008 | warning | **Per network:** two services sharing a docker network (`spec.networks` intersect) on the same host resolve to the same DNS name (`containerName` or slug(label)) |
| PORT009 | info | Host port < 1024 published by a docker service running with `user` set to a non-root UID |

### 6.4 Resource rules

Default `reservedRamMb` by role: hypervisor 1024, docker-host 512, vps 512, k8s-control-plane 1024, k8s-worker 768, nas 1024, other servers 512, clients 2048, network gear and other appliances 0.

**Usage algorithm, `hostUsage(deviceId)`:**

```
ramUsed(device) =
    device.reservedRamMb
  + Σ services placed directly on device:  s.resources.ramMb
  + Σ guests (placement.hostId === device):
        guest.guestType === 'vm'  ? guest.ramMb                      // VMs reserve their allocation
      : /* lxc */ min(guest.ramMb, 64 + Σ services on guest ramMb)   // LXC limits aren't reservations
cpuUsed(device) = Σ services cpuMillicores (recursive through guests)   // VM vCPUs not counted as reservations
capacity: ramMb, threads*1000
```

For a guest itself: `guestRamUsed = 64 + Σ its services ramMb` against `guest.ramMb`.

| ID | Severity | Rule |
|---|---|---|
| RES001 | warning ≥ ramWarn, error > ramError | `ramUsed / ramMb` per physical device and per guest. Title: `vps RAM at 96% (7664 / 7987 MB)` |
| RES002 | info > cpuInfo, warning > cpuWarn | `cpuUsed / (threads*1000)`. Never an error, because overcommit is legitimate. |
| RES003 | warning ≥ diskWarn, error > diskError | Per `StorageDevice`: Σ `volume.sizeGb` whose `storageRef` points to it, plus Σ capacity of child storages (`backing`) that are not `lvm-thin`/`zfs-pool`, plus Σ guest virtual disks backed by it. Thin pools: Σ virtual sizes > capacity → **info** (overprovisioned thin pool), not an error. |
| RES004 | error | Service `gpu === 'required'` and no reachable GPU with an API in `gpuApis`. Reachable GPU = on the effective host device, or on its host when listed in `gpuPassthrough`. |
| RES005 | info | Service `gpu === 'optional'` and no reachable GPU (`Jellyfin will transcode on CPU`) |
| RES006 | error | One `dgpu` listed in `gpuPassthrough` of ≥ 2 **VMs** (VM passthrough is exclusive; LXC sharing is fine) |
| RES007 | info | Σ LXC `ramMb` limits on a hypervisor > host `ramMb` (limit overcommit, informational) |
| RES008 | error / warning | **k8s:** per cluster, Σ (replicas × requests) vs Σ node allocatable (`ramMb - reservedRamMb`, threads*1000): error > 100%, warning ≥ 85%. Also error if any single pod's request exceeds the largest node's allocatable. |
| RES009 | warning | Docker service on a host whose role is not `docker-host`/`vps`/`server`/`workstation`/`transcoder`/`nas`/`laptop`, and whose OS string doesn't match `/ubuntu|debian|fedora|alpine|truenas|unraid|omv|arch|nixos|rocky|alma/i` |

`HostResourceUsage = { deviceId, ram: {used, capacity}, cpu: {used, capacity}, disks: {storageId, used, capacity}[] }` feeds the Budget tab bars, colored by threshold.

### 6.5 Failure impact

**Dependency graph** (`src/analysis/failure.ts`), with edges "A needs B":

| Source of edge | A | B | Hard? |
|---|---|---|---|
| placement | service | its host device | hard |
| guest placement | guest device | hypervisor | hard |
| depends-on | source | target | `attrs.hard` |
| mounts | source | target | hard |
| reverse-proxy (for the hostname) | hostname entry `H` | proxy service and target service | hard |
| k8s cluster | cluster service | cluster (down if all control-plane nodes are down, degraded if < replicas schedulable) | — |
| network reachability | device | gateway path | soft (degraded) |

Network reachability: a device is *unreachable* if every path over `ethernet`/`wifi` links (through network nodes, switches, APs and routers) from its primary NIC to the subnet's gateway device passes through a failed node. Guests inherit their host's reachability. This is computed by BFS over the physical-link graph with failed nodes removed.

**Algorithm, `simulate(project, failed: Set<NodeId>) → { down: Set; degraded: Set; unreachable: Set; hostnamesDown: string[] }`:**
1. `down = failed ∪ descendants via placement` (fixed point).
2. Repeat until no change:
   - for each node `n` not in `down`: if any hard edge target ∈ `down` → add `n` to `down`;
   - else if any soft edge target ∈ `down` → mark `degraded`.
3. A hostname is down if its proxy or target is down.
4. Run unreachability BFS.

Complexity is O((V+E)·iterations), with iterations bounded by the graph depth.

| ID | Severity | Rule |
|---|---|---|
| FAIL001 | error | Cycle in hard `depends-on`/`mounts` edges (Tarjan SCC, size > 1). Title lists the cycle. |
| FAIL002 | warning | Node depends (hard or soft) on a node with status `broken` or `retired`. Detail: `prowlarr depends on flaresolverr (status: broken)` |
| FAIL003 | info | SPOF: a physical device whose failure takes down ≥ 5 services. One finding per device, with `data.impacted`. |
| FAIL004 | warning | Service with `status: 'running'` placed on a host with status `broken` |

**SPOF tab:** for each physical device, simulate `{device}` and rank by `|down services| + 0.5·|degraded|`. Also for each `group` with `failureDomain`: simulate all its devices ("Lose site Home → 24 services down, 6 hostnames offline").

**Simulation mode UI:** `F` toggles it. Clicking a node toggles it in `ui.simulate.failed`. Overlays use `data-state` attributes (§4.4). The drawer shows the live `simulate` result. Nothing is written to history.

### 6.6 Cost and power

For each physical device with `power.maxW > 0`:

```
avgW            = idleW + (maxW - idleW) * settings.averageLoadFactor
kWhPerMonth     = avgW * 24 * 30.4375 / 1000
energyCost      = kWhPerMonth * settings.electricityPricePerKwh
amortized       = purchase != null ? purchase / (cost.amortizeMonths ?? settings.amortizeMonths) : 0
monthlyTotal    = energyCost + (cost.monthly ?? 0) + amortized
```

Results are rounded to 2 decimals for display, while full precision is kept in data. VPS devices have `power.maxW = 0` (not on the home bill) and use `cost.monthly`.

`CostReport = { rows: { deviceId, avgW, kWhPerMonth, energyCost, subscription, amortized, total }[]; totals: {...} }`, sorted by total descending, then label.

| ID | Severity | Rule |
|---|---|---|
| COST001 | info | Physical device (not virtual, not role `internet`/`cloud-edge`) with `idleW === 0 && maxW === 0` and no `cost.monthly`: "No power data for X" |
| PWR001 | warning ≥ upsWarn, error > 1.0 | For each `ups`: Σ `maxW` of devices with a `depends-on` (reason `power`) link to it vs `upsCapacityW` |
| PWR002 | info | UPS runtime estimate = `upsBatteryWh * 0.9 / Σ avgW` in minutes |

### 6.7 Backup coverage

A volume is covered when any `backup-to` link exists whose source is the service, its effective host, or (for a guest) its hypervisor, with `volumeIds` empty or containing the volume. Also when a `replicates-to` link exists from the service or host with `targetStorageId` on another device.

| ID | Severity | Rule |
|---|---|---|
| BAK001 | warning | Volume with `backup === 'required'` not covered. One finding per service, listing the volumes. |
| BAK002 | warning | Backup target is the same physical device as the source (`physicalHostOf` equal) |
| BAK003 | info | Source and target in the same `failureDomain` group with `offsite=false`: "no off-site copy (3-2-1)" |
| BAK004 | info | Storage device with `external: true` hosting volumes of class `data`/`database` with no backup |

### 6.8 WAN exposure audit

Exposure entries are `{ path: 'public-ip' | 'port-forward' | 'tunnel' | 'reverse-proxy'; entry: string /* "144.91.127.54:443/tcp" or "pve.lumosdhia.com" */; reaches: { nodeId; portId | null }; auth: ...; tls: boolean }`. They are computed as follows:
1. **Public IP:** for each NIC with `publicIp`, each published port bound on that device (bind IP null or equal to the NIC IP) is checked against the firewall. It is reachable if the firewall is disabled, or a matching rule allows source `any`, or default inbound is `allow` and no rule denies.
2. **Port forward:** each forward on a router WAN NIC → target device:port → the service publishing it.
3. **Tunnel:** each `reverse-proxy` link whose source has capability `tunnel` (cloudflared) → hostname.
4. **Reverse proxy:** each `reverse-proxy` link whose source proxy is itself reachable via 1 or 2 on 80/443 → hostname → target.

| ID | Severity | Rule |
|---|---|---|
| EXP001 | warning | An `adminUi` service reachable from the WAN (via any path) with `auth === 'none'` (`pve.lumosdhia.com exposes Proxmox VE UI without access policy`) |
| EXP002 | error | A service with capability `database` or `cache` directly reachable from the WAN (paths 1 or 2) |
| EXP003 | warning | WAN-reachable hostname with `tls === false` |
| EXP004 | info | Firewall allows a port where nothing listens |
| EXP005 | info | A docker-published port on a device with the firewall enabled: "Docker publishes bypass UFW unless DOCKER-USER rules exist; verify 5984/tcp is not reachable" (one finding per device, ports listed) |
| EXP006 | info | Summary: N entry points (always present when N > 0, so the Exposure tab has data) |

### 6.9 Link and k8s rules

| ID | Severity | Rule |
|---|---|---|
| LNK001 | error | A stored link fails `canConnect` (e.g. a NIC was deleted, or a capability removed) |
| LNK002 | warning | Ethernet link NIC IDs set but the NIC's subnet and the network node's subnet differ |
| LNK003 | warning | VPN tunnel with `transport: 'udp'` from a device in a group tagged `udp-blocked` (tags on groups) |
| K8S001 | error | Cluster-placed service namespace not in `cluster.namespaces` |
| K8S002 | error | Cluster `nodeIds` contains a device whose role is not `k8s-*` |
| K8S003 | warning | Cluster without any `k8s-control-plane` node |
| K8S004 | warning | `statefulset` workload with no volume of class `data`/`database` (or a `deployment` with one, plus `replicas > 1` and no RWX storage class `longhorn`/`nfs`) |
| K8S005 | error | Cluster-placed service has a `bind`-kind volume (must be `pvc`) |

Rule ID list is exported as `RULES` in `src/analysis/rules/index.ts`. `docs/rules` is generated from rule metadata by `npm run docs:rules` (v1.1). In v1 the drawer's "?" shows the rule title and detail.

---

## 7. Generators

Every generator is `(project: Project, catalog: CatalogIndex, opts) => GeneratedFile[]` where `GeneratedFile = { path: string; content: string; mime: string }`. Generators are pure. They never use `Date`, `Math.random`, node IDs or locale-dependent APIs. They are lazy-loaded (`import('./generators')`) by the Export dialog.

### 7.1 Determinism rules (`src/lib/determinism.ts`)

1. `slugify(s)`: NFKD → strip combining marks → lowercase → replace `[^a-z0-9]+` with `-` → trim `-` → cut to 63 chars → trim `-` again. An empty result becomes `"x"`. A leading digit gets the prefix `s-`. The function is idempotent; this is a property test.
2. **Unique names:** `uniqueSlugs(items, keyFn)` sorts candidates by `(slug, label, id)` and appends `-2`, `-3`, … for collisions in that order. IDs are only a final tiebreaker and are never emitted.
3. **Sorting:**
   - services: by slug
   - ports: by `(hostPort ?? containerPort, proto)`
   - env: by key (byte order)
   - volumes: by target path
   - networks: by name
   - IPs: numerically via `toUint32`
   - subnets: by network uint32, then prefix
   - YAML map keys: in the fixed order given per generator (below), never by insertion
4. **YAML:** `yaml` `Document` with `lineWidth: 0`, `indent: 2`, plain scalars unless quoting is needed. Ports are always quoted strings (`"8096:8096"`) so YAML 1.1 doesn't parse them as sexagesimal. Env values are always quoted.
5. **Text:** LF line endings, exactly one trailing newline, no trailing spaces, UTF-8.
6. **Header comment** in each YAML and markdown file: `# Generated by rackdrafter from project "<name>". Do not edit by hand.` It contains no timestamp and no version string.
7. Output file list sorted by `path`.

### 7.2 docker-compose (`src/generators/compose.ts`)

- **Hosts:** one file per device that has ≥ 1 `runtime: 'docker'` service placed on it, at `compose/{slug(host.spec.hostname || host.label)}/compose.yaml`, plus `compose/{host}/.env.example` when any secret env exists. Hosts with only systemd/lxc-native services are listed in the dialog's "Skipped" note, not emitted.
- **Top-level key order:** `name`, `services`, `networks`, `volumes`. There is no `version:` key, as the Compose Specification v2 made it obsolete. `name: slug(host)`.
- **Service key order:** `image`, `container_name`, `restart`, `user`, `command`, `network_mode`, `environment`, `ports`, `volumes`, `networks`, `depends_on`, `healthcheck`, `labels`, `deploy`. Keys are omitted when empty.
- **Fields:**
  - `container_name`: `spec.containerName ?? slug(label)`
  - `ports`: published only, formatted `"{bindIp}:{hostPort}:{containerPort}{/udp}"` with bindIp omitted when null and `/udp` only for UDP
  - `environment`: map form; `TZ: settings.timezone` is injected first if absent; secrets become `"${KEY}"` and go to `.env.example` as `KEY=`
  - `volumes`: named → `"{name}:{target}{:ro}"`; bind → `"{source}:{target}{:ro}"`; tmpfs → a separate `tmpfs:` key (allowed exception to the key order, placed after `volumes`)
  - `networks`: for each `spec.networks` subnet scoped to this host, as a map `{ name: { ipv4_address? } }` (ipv4_address only if a static container IP exists — not in v1, so the list form `[name]` is used). Services with no networks get no `networks` key (the compose default network).
  - `depends_on`: from depends-on links whose target is on the same host and is a docker service; map form `{ target: { condition: service_healthy | service_started } }`, using `service_healthy` iff the target has a healthcheck. Cross-host dependencies become a comment above the service: `# depends on navidrome@vps (cross-host)`.
  - `healthcheck`: `{ test, interval: "{n}s", timeout, retries, start_period }`
  - `deploy.resources.limits.memory`: `"{ramLimitMb}M"` if set
  - `deploy.resources.reservations.devices`: GPU `[{ driver: nvidia, count: 1, capabilities: [gpu] }]` when gpu required/optional and the host GPU has `nvenc`. For QSV/VAAPI it emits `devices: ["/dev/dri:/dev/dri"]` instead (a `devices` key, placed after `volumes`).
- **Top-level `networks`:** each host-scoped docker subnet: `{ name: subnet.name, external: true }` if `external`, else `{ name, ipam: { config: [{ subnet: cidr, gateway? }] } }`.
- **Top-level `volumes`:** each named volume referenced: `{ name: "{project-slug}_{volume}" }`.

Expected output for a 2-service host (part of the snapshot test `compose.test.ts > emits deterministic file for two services`):

```yaml
# Generated by rackdrafter from project "Demo". Do not edit by hand.
name: vps
services:
  navidrome:
    image: deluan/navidrome:0.53.3
    container_name: navidrome
    restart: unless-stopped
    environment:
      TZ: "UTC"
    ports:
      - "5003:4533"
    volumes:
      - "navidrome_data:/data"
    networks:
      - proxy-nw
  nginx-proxy-manager:
    image: jc21/nginx-proxy-manager:2.12.1
    container_name: nginx-proxy-manager
    restart: unless-stopped
    environment:
      TZ: "UTC"
    ports:
      - "80:80"
      - "127.0.0.1:81:81"
      - "443:443"
    volumes:
      - "npm_data:/data"
      - "npm_letsencrypt:/etc/letsencrypt"
    networks:
      - proxy-nw
networks:
  proxy-nw:
    name: proxy-nw
    external: true
volumes:
  navidrome_data:
    name: demo_navidrome_data
  npm_data:
    name: demo_npm_data
  npm_letsencrypt:
    name: demo_npm_letsencrypt
```

### 7.3 Kubernetes (`src/generators/k8s.ts`)

- One multi-document file per cluster: `k8s/{slug(cluster.name)}.yaml`, plus a `k8s/{cluster}/kustomization.yaml` listing it (one file, no Helm in v1).
- **Document order:** Namespace → ConfigMap → Secret → PersistentVolumeClaim → Deployment/StatefulSet/DaemonSet → Service → Ingress. Within a kind: by namespace, then name. Documents are separated by `---`.
- **Common labels:** `app.kubernetes.io/name: {slug}`, `app.kubernetes.io/part-of: {slug(project.name)}`, `app.kubernetes.io/managed-by: rackdrafter`. The selector is `app.kubernetes.io/name`.
- **Workload:**
  - `replicas` from placement
  - `containers[0]`: `name` slug, `image`, `ports` (`containerPort`, `name` = port.name truncated to 15 chars, `protocol` uppercase)
  - `env`: non-secret entries from a ConfigMap `{slug}-config` via `envFrom.configMapRef`, secrets from Secret `{slug}-secret` with `stringData` values `"CHANGE_ME"`
  - `resources.requests` `{ cpu: "{m}m", memory: "{Mb}Mi" }`, `limits.memory` if set
  - `readinessProbe` from the healthcheck: an HTTP check is detected when `test` contains a `curl`/`wget` URL, and becomes `httpGet` with path and port; otherwise `exec`
- **Volumes:**
  - `pvc` volumes → PVC `{slug}-{volume}` with `storageClassName: cluster.storageClass`, `accessModes: [ReadWriteOnce]`, `storage: "{sizeGb}Gi"`
  - StatefulSets use `volumeClaimTemplates` instead of standalone PVCs
  - tmpfs → `emptyDir: { medium: Memory }`
- **Service:** ClusterIP exposing all ports (`port` = containerPort).
- **Ingress:** for each `reverse-proxy` link whose source has capability `ingress-controller` and is placed on this cluster: one Ingress per target service, `ingressClassName: cluster.ingressClass`, rules sorted by host, `tls: [{ hosts: [...], secretName: "{slug}-tls" }]` when `tls`. When cert-manager exists in the cluster, adds the annotation `cert-manager.io/cluster-issuer: letsencrypt`.
- **Validation in tests:** each document parses as YAML and passes a minimal Zod `K8sObjectSchema` (`apiVersion`, `kind`, `metadata.name` DNS-1123, `metadata.namespace` present for namespaced kinds). Labels match selectors. Every Ingress backend references an existing Service+port.

### 7.4 IP table (`src/generators/ipTable.ts`) → `network/ip-plan.md`

- `## Subnets` table: `Name | CIDR | VLAN | Gateway | DHCP range | Purpose | Scope | Used/Usable`.
- Then per subnet (sorted §7.1): `### {name} — {cidr}` and a table `IP | Host | Interface | MAC | Assignment | Services`.
  - Assignment ∈ `static`, `dhcp-reserved`, `dhcp`, `gateway`.
  - Services: `jellyfin :8096` comma-joined, ports ascending.
  - Dynamic NICs without an IP are listed after the numbered rows with IP `—`.
- `## Port forwards` and `## Public hostnames` (from the exposure report: `Hostname | Path | Via | Target | TLS | Auth`).

Example row: `| 192.168.1.202 | jellyfin (CT 101) | eth0 | — | static | jellyfin :8096 |`

### 7.5 Mermaid (`src/generators/mermaid.ts`) → `diagram/topology.mmd`

- `flowchart LR`.
- `subgraph` per top-level group (`subgraph g_{slug}["{label}"]`) and per expanded host (nested).
- Node IDs are `n_{uniqueSlug}`. Labels are `"{label}<br/>{primary ip}"`, with `"` replaced by `#quot;`.
- Shapes: device `[ ]`, service `( )`, network `[/ /]`, note omitted.
- Edges:
  - ethernet `---`
  - wifi `-.-`
  - vpn-tunnel `<-. vpn .->`
  - reverse-proxy `-- "{hostname}" -->`
  - depends-on `-.->`
  - replicates-to `==>`
  - backup-to `-- backup -->`
  - mounts `-- mount -->`
- Edges are sorted by `(kind index, source slug, target slug)`. `linkStyle {index} stroke:{hex}` per edge uses fixed hexes per kind (light palette), emitted after all edges.
- `classDef` per status (`broken` red stroke, `planned` dashed).
- The test parses the output with `mermaid`'s parser in a Node test (`mermaid.parse`, devDependency only, never bundled).

### 7.6 SVG / PNG (`src/generators/image.ts`, browser-only)

- `html-to-image@1.11.11` `toSvg` / `toPng` applied to `.react-flow__viewport`.
- Bounds: `getNodesBounds(nodes)` with 48 px padding. `getViewportForBounds(bounds, w, h, 0.1, 2, 0.08)`, where `w = clamp(bounds.width + 96, 800, 4096)` and height likewise.
- Before capture: set `data-exporting="true"` on the root, which hides handles, the selection ring, finding markers (unless the "Include findings" option is on), the minimap and helper lines via CSS. Freeze the VPN animation.
- Background is `hsl(var(--bg))` of the chosen theme (Light/Dark option). The dot grid is optional (default off).
- PNG `pixelRatio: 2`. Files are named `diagram/topology.svg` / `.png`.
- Fonts: `fontEmbedCSS` is pre-built once from the Fontsource CSS so the SVG embeds Plex.
- Tested only in Playwright: the export downloads a non-empty file, the SVG contains `<svg` and the text `Jellyfin`, and the PNG starts with `\x89PNG`.

### 7.7 Project JSON and zip

- `project/{slug}.rackdrafter.json` = `JSON.stringify(project, null, 2)` with keys in schema order. Implemented by `canonicalize(project)`, which rebuilds objects in schema key order, so files diff cleanly.
- "Download all" zips every generator's output via `fflate.zipSync` with fixed `mtime: new Date(Date.UTC(2000,0,1))` so the zip bytes are deterministic. The file is named `{slug}-export.zip`.

### 7.8 Compose import (`src/importers/compose.ts`)

Input is YAML text plus a target (an existing selected device, or "create new Docker host"). Steps:
1. Parse with `yaml`. On failure, report errors with line numbers.
2. For each service (sorted by name), match the catalog by `image` against `imageMatchers`; otherwise use `custom-container`.
   - Create a `ServiceNode` (runtime docker, `label` = service key, `containerName`, `image`).
   - `ports`: short and long syntax, including `ip:host:container/proto` and ranges, which expand to one mapping per port up to 32 entries (more → error).
   - `environment` (list or map; keys matching `/PASS|SECRET|TOKEN|KEY/i` → `secret: true`).
   - `volumes` (short/long; named vs bind decided by a leading `/`, `./` or `~`; class guessed from target path: `/config`→config, `/data`→data, `/var/lib/postgresql|mysql`→database, `/media|/movies|/tv|/music`→media, `/cache|/tmp`→cache, default data).
   - `healthcheck`, `restart`, `user`, `command`.
3. Top-level `networks` become host-scoped docker subnets. `external: true` is preserved. A missing IPAM subnet gets the next free `172.{18+n}.0.0/16` that doesn't overlap existing subnets.
4. `depends_on` (list or map) becomes depends-on links (`hard` iff `condition: service_healthy`).
5. `network_mode: host` sets `bindIp: null` and publishes `hostPort = containerPort` for all ports. `network_mode: service:x` adds a depends-on link to `x` and leaves no ports.
6. Layout: grid inside the host, 4 columns, cell 224×112, sorted by slug.
7. The result is one history entry. The dialog shows a summary: `14 services (11 matched catalog), 2 networks, 6 dependencies, 3 warnings`. Warnings cover unsupported keys (`build`, `extends`, `profiles`, `secrets`, `configs`), which are listed but ignored.

**Round-trip property** (unit test): `importCompose(generateCompose(seedHost))` gives the same set of `(slug, image, sorted published ports, volume targets, network names, depends_on pairs)`.

---

## 8. Backend and database

### 8.1 Process model

- `src/server/index.ts` reads the environment (`src/server/env.ts`, validated with Zod), calls `buildApp()`, then `listen`.
- **Production** (`npm start`): Fastify serves `dist/client` through `@fastify/static` with `immutable` cache headers on `/assets/*` (1 year) and `no-cache` on `index.html`. A `setNotFoundHandler` returns `index.html` for GET requests that do not start with `/api/` and accept `text/html`, which gives the SPA fallback.
- **Dev** (`npm run dev`): the same process registers `@fastify/middie` and mounts `vite.createServer({ server: { middlewareMode: true }, appType: 'spa' }).middlewares`. That gives one port and one process with Vite HMR, and no proxy configuration. The server restarts on changes under `src/server` and `src/shared` (`node --watch-path`).
- `buildApp({ dbPath, token, dev, logger })` returns the Fastify instance without listening, so tests use `app.inject()` against `:memory:`.

**Environment** (all optional):

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4747` | listen port |
| `HOST` | `127.0.0.1` | bind address |
| `RACKDRAFTER_DB` | `./data/rackdrafter.db` | SQLite file (dir auto-created) |
| `RACKDRAFTER_TOKEN` | unset | enables bearer auth (≥ 24 chars, else boot fails) |
| `RACKDRAFTER_INSECURE` | unset | `1` allows non-loopback HOST without a token |
| `RACKDRAFTER_SEED` | `1` | `0` disables first-boot seeding |
| `LOG_LEVEL` | `info` | pino level |

Boot refuses `HOST` other than `127.0.0.1`/`::1`/`localhost` unless `RACKDRAFTER_TOKEN` is set or `RACKDRAFTER_INSECURE=1`. *Why: the API writes data; exposing it unauthenticated on a LAN must be a deliberate act.*

### 8.2 SQLite setup (`src/server/db/client.ts`)

```ts
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');     // readers never block the writer; crash-safe
sqlite.pragma('synchronous = NORMAL');   // safe with WAL, much faster than FULL
sqlite.pragma('foreign_keys = ON');      // cascades on project delete
sqlite.pragma('busy_timeout = 5000');    // tolerate an external sqlite3 CLI holding a lock
export const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
```

*Why better-sqlite3: synchronous, fastest Node SQLite driver, a single process means a single writer, and there are no async pool semantics to get wrong.*

### 8.3 Schema (Drizzle source `src/server/db/schema.ts`; generated SQL `drizzle/0000_init.sql`)

The generated DDL must be equivalent to:

```sql
CREATE TABLE projects (
  id              TEXT PRIMARY KEY,                      -- "p_" + nanoid(10)
  slug            TEXT NOT NULL UNIQUE,                  -- slugify(name), -2/-3 suffix on collision
  name            TEXT NOT NULL,
  schema_version  INTEGER NOT NULL,
  document        TEXT NOT NULL CHECK (json_valid(document)),
  doc_seq         INTEGER NOT NULL DEFAULT 0,            -- increments on every accepted save
  doc_hash        TEXT NOT NULL,                         -- sha256 of canonical JSON (8.5)
  node_count      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,                      -- unix ms
  updated_at      INTEGER NOT NULL
);
CREATE INDEX projects_updated_at ON projects(updated_at DESC);

CREATE TABLE project_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no      INTEGER NOT NULL,                      -- 1..n per project
  label           TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL CHECK (source IN ('auto','manual','restore','import','seed')),
  schema_version  INTEGER NOT NULL,
  document        TEXT NOT NULL CHECK (json_valid(document)),
  doc_hash        TEXT NOT NULL,
  doc_seq         INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (project_id, version_no)
);
CREATE INDEX project_versions_project ON project_versions(project_id, version_no DESC);

CREATE TABLE shares (
  token           TEXT PRIMARY KEY,                      -- 22-char base64url of 16 random bytes
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no      INTEGER,                               -- NULL = live (follows current document)
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER,                               -- NULL = never
  revoked_at      INTEGER
);
CREATE INDEX shares_project ON shares(project_id);

CREATE TABLE meta (
  key             TEXT PRIMARY KEY,                      -- 'instance_id', 'seeded_at'
  value           TEXT NOT NULL
);
```

The document is stored as a JSON TEXT column, not normalised into tables. *Why: the editor always loads and saves whole documents, analysis needs the whole graph, and normalising would multiply write paths for no query we need. `json_valid` guards corruption.*

**Migrations:** edit `schema.ts`, run `npm run db:generate` (`drizzle-kit generate`), commit `drizzle/*.sql` plus `drizzle/meta/*`. They apply automatically at boot in a transaction. *Why: zero manual steps for the user, and migrations stay reviewable SQL.*

### 8.4 API surface (all JSON; Zod-validated through `fastify-type-provider-zod`; body limit 5 MB)

Error shape for every non-2xx: `{ error: { code: string; message: string; details?: unknown } }`. Codes: `bad_request`, `unauthorized`, `not_found`, `conflict`, `payload_too_large`, `unsupported_document`, `internal`.

```ts
type ProjectMeta = { id: string; slug: string; name: string; docSeq: number; nodeCount: number; createdAt: number; updatedAt: number; latestVersionNo: number | null };
type VersionMeta = { versionNo: number; label: string; source: 'auto'|'manual'|'restore'|'import'|'seed'; docSeq: number; createdAt: number; nodeCount: number };
type ShareMeta   = { token: string; url: string; versionNo: number | null; createdAt: number; expiresAt: number | null; revokedAt: number | null };
```

| Method & path | Request | Response | Notes |
|---|---|---|---|
| `GET /api/health` | | `200 { ok: true, version: string, schemaVersion: number, db: 'ok' }` | No auth. Used by Playwright `webServer.url`. |
| `GET /api/projects` | | `200 { projects: ProjectMeta[] }` | Sorted by `updatedAt` desc. |
| `POST /api/projects` | `{ name: string; document?: unknown; fromSeed?: 'homelab'\|'k3s-cicd' }` | `201 { meta: ProjectMeta; document: Project }` | `document` is run through `migrateProject` and gets a new id. It creates version 1 (`source: 'import'` with a document, `'seed'` from a seed, else `'manual'` labelled "Created"). |
| `GET /api/projects/:id` | | `200 { meta, document }` | Migrated on read. |
| `PATCH /api/projects/:id` | `{ name: string }` | `200 { meta }` | Also rewrites `document.name` and bumps `docSeq`. |
| `PUT /api/projects/:id/document` | `{ baseSeq: number; document: Project }` | `200 { meta, autoVersion: VersionMeta \| null }` · `409 { error:{code:'conflict'}, current: { meta, document } }` | Autosave. Accepted only if `baseSeq == doc_seq`. If `doc_hash` is unchanged, it returns 200 without bumping. Auto-version rule in 8.5. |
| `DELETE /api/projects/:id` | | `204` | Cascades versions and shares. |
| `POST /api/projects/:id/duplicate` | `{ name?: string }` | `201 { meta, document }` | |
| `GET /api/projects/:id/versions` | | `200 { versions: VersionMeta[] }` | Desc by `versionNo`. |
| `POST /api/projects/:id/versions` | `{ label: string }` (1..80) | `201 { version: VersionMeta }` | Snapshot of the current document, `source: 'manual'`. |
| `GET /api/projects/:id/versions/:no` | | `200 { version: VersionMeta, document: Project }` | |
| `POST /api/projects/:id/versions/:no/restore` | `{ baseSeq: number }` | `200 { meta, document, version: VersionMeta }` · `409` | Makes the version current (`docSeq+1`) and records a `restore` version labelled "Restored v{no}". |
| `GET /api/projects/:id/analysis` | | `200 AnalysisResult` | Server-side `analyze()`. |
| `GET /api/projects/:id/export/:format` | `format ∈ compose\|k8s\|ip-table\|mermaid\|json` | `200 { files: GeneratedFile[] }` | Text formats only; zip is client-side in v1. |
| `GET /api/projects/:id/shares` | | `200 { shares: ShareMeta[] }` | |
| `POST /api/projects/:id/shares` | `{ versionNo: number \| null; expiresInDays: number \| null }` (1..365) | `201 { share: ShareMeta }` | `url = /s/<token>`. |
| `DELETE /api/shares/:token` | | `204` | Sets `revoked_at`. |
| `GET /api/s/:token` | | `200 { name: string; versionNo: number \| null; document: Project }` · `404` (unknown, revoked or expired, indistinguishable) | **Always public**, even in token mode. |

The SPA route `/s/:token` renders the read-only viewer: canvas, inspector read-only, Issues, Impact and Export (text formats) available; no editing UI.

**Rate limiting:** none in v1. *Why: local, single-user tool; token mode protects writes.*

### 8.5 Autosave, versioning and offline

**Canonical JSON for hashing** (`src/shared/domain/canonical.ts`): `JSON.stringify` with object keys sorted recursively, arrays kept in order, and the volatile `viewport` field excluded from the hash. `doc_hash = sha256(canonical)` (`node:crypto` on the server, `crypto.subtle` on the client). *Why: pan/zoom alone must not create versions or conflicts.*

**Client autosave** (`src/client/persistence/autosave.ts`):

- Any document change marks the state `dirty`. Saves are debounced 800 ms with a 5 s max wait, and at most one PUT is in flight; changes during a PUT queue one follow-up.
- Each save sends `PUT` with `baseSeq = persistence.docSeq`. On 200, `docSeq = meta.docSeq` and the state becomes `saved`.
- On 409, the state becomes `conflict` and a dialog opens: "This project changed in another tab or device." The choices are **Load theirs** (replace the local document and reset history) or **Keep mine** (re-PUT with `baseSeq = current.meta.docSeq`, which overwrites).
- `beforeunload` warns while `dirty` or `saving`.

**Server auto-versions.** On an accepted PUT, if the project's newest version is older than 10 minutes **and** its `doc_hash` differs from the new hash, the server inserts a `source: 'auto'` version. Auto versions beyond the newest 50 per project are pruned in the same transaction; manual, restore, import and seed versions are never pruned. *Why: gives a time-machine without a version per keystroke.*

**Offline fallback** (`src/client/persistence/local.ts`):

- Every successfully applied command writes `localStorage['ds:doc:<projectId>'] = { document, baseSeq, savedAt, dirty }`, throttled to 1 per second, plus `ds:last-project`. If quota is exceeded, it removes mirrors of other projects (oldest `savedAt` first) and retries once.
- A failed network PUT (TypeError or 5xx) sets the state to `offline` and shows the banner "Offline — changes are kept in this browser." It retries with backoff (2 s, 4 s, 8 s, capped at 30 s) and polls `GET /api/health`.
- On load, if a mirror exists with `dirty: true` and `mirror.baseSeq == server.docSeq`, the mirror is restored and pushed. If `mirror.baseSeq < server.docSeq`, the conflict dialog opens.
- Projects created while the server is unreachable get the id `local_<nanoid>`. On reconnect they are POSTed and the id is swapped.
- If the server is unreachable on startup, the project list shows the local mirrors with the badge "local only".

### 8.6 Auth modes

- **Local mode** (no token): no auth on any route. *Why: zero friction for the 95 % case, which is one person on localhost.*
- **Token mode** (`RACKDRAFTER_TOKEN` set): an `onRequest` hook requires `Authorization: Bearer <token>` on `/api/*`, except `GET /api/health` and `GET /api/s/:token`. It compares with `crypto.timingSafeEqual` on equal-length buffers (the hash of both sides is compared, to avoid a length leak). On a 401, the client shows a token dialog and stores the token in `localStorage['ds:token']`. *Why: one shared secret is enough for a self-hosted single-tenant tool; accounts are out of scope.*
- **Static assets and the SPA** are public in both modes. They contain no data.

### 8.7 Seeding

On boot, if `meta.seeded_at` is absent and `RACKDRAFTER_SEED != 0`, the server inserts `SEED_HOMELAB` and `SEED_K3S_CICD` from `src/shared/seeds/` as projects with version 1 `source: 'seed'`, then writes `seeded_at`. The client can also create fresh copies via `POST /api/projects { fromSeed }`. That powers the empty-state template buttons.

### 8.8 Reference design A: "Homelab (real)" (`src/shared/seeds/homelab.ts`)

It is built with the same builder used in tests (`buildProject`), so ids are deterministic (`seedIds('homelab')` gives `n_hl0001`…).

**Subnets:**

| Name | CIDR | Purpose | VLAN | Gateway | DHCP | Scope |
|---|---|---|---|---|---|---|
| LAN | 192.168.1.0/24 | lan | null | 192.168.1.1 | .100–.199 *(A1)* | global |
| Internet | 0.0.0.0/0 | public | null | null | null | global |
| Tailnet | 100.64.0.0/10 | vpn | null | null | null | global |
| wg-laptop | 10.8.0.0/24 *(A2)* | vpn | null | null | null | global |
| proxy-nw | 172.18.0.0/16 *(A3)* | docker | null | null | null | host: vps, external: true |

**Devices and placement:**

| Node | Catalog | Parent | Key facts |
|---|---|---|---|
| internet | net-internet (network, cloud) | — | |
| tailnet | net-tailnet (network, cloud) | — | |
| lan | net-lan (network, bus) | — | |
| isp-router | isp-router-combo | site "Home" | eth0 LAN 192.168.1.1 static; wan0 Internet dhcp; wifi AP |
| pve | proxmox-ve-host (over dell-optiplex-3000-micro) | site "Home" | Proxmox VE 9; i5-12600T 6c/12t; UHD 770 (encoders h264,hevc); ramGiB 15; storage: `st_nvme0` NVMe 931 GiB, `st_media` lvm-thin 500 GiB `/srv/media` parent st_nvme0 thin, `st_inventory` ssd usb 1863 GiB `/mnt/inventory` external "Inventory"; interfaces vmbr0 bridge 192.168.1.200 static defaultRoute, wlan0 wifi 192.168.1.113 dhcp-reserved, tailscale0 vpn 100.88.254.73; reservedPorts 22 sshd, 8006 pveproxy (admin, auth app, https), 3128 spiceproxy; container mode |
| lxc-100 cloudflared | proxmox-lxc | pve | vmid 100; eth0 → vmbr0, 192.168.1.201 |
| lxc-101 jellyfin | proxmox-lxc | pve | vmid 101; .202; gpuPassthrough true |
| lxc-102 qbittorrent | proxmox-lxc | pve | 103 → no: vmid 102; .203 |
| lxc-103 kavita | proxmox-lxc | pve | vmid 103; .204 |
| lxc-104 stash | proxmox-lxc | pve | vmid 104; .205 |
| lxc-105 files | proxmox-lxc | pve | vmid 105; .206 |
| lxc-106 immich | proxmox-lxc (role docker-host) | pve | vmid 106; .207 |
| lxc-108 sonarr | proxmox-lxc | pve | vmid 108; .209 |
| lxc-109 prowlarr | proxmox-lxc | pve | vmid 109; .210 |
| lxc-110 flaresolverr | proxmox-lxc | pve | vmid 110; .211; **status broken** |
| lxc-111 samba | proxmox-lxc | pve | vmid 111; .212 |
| vm-112 dev | proxmox-vm | pve | vmid 112; dhcp, ip null |
| transcoder | asus-tuf-f15 | site "Home" | Ubuntu 24.04; i5-11400H 6c/12t; 31 GiB; RTX 2050 dgpu (encoders h264,hevc; maxEncodeSessions 8; cuda); wlan/eth 192.168.1.104 dhcp-reserved; role gpu-transcoder |
| steam-deck | steam-deck | site "Home" | 192.168.1.114 dhcp-reserved, wifi to isp-router |
| vps | vps-generic | site "VPS" | hostname `s.mavubo.com` → hostname field `s-mavubo`, label "s.mavubo.com"; Ubuntu 24.04; 4 vCPU; ramGiB 7.8; storage 145 GiB; eth0 Internet 144.91.127.54 static defaultRoute; tailscale0 100.125.127.33; wg0 10.8.0.1; firewall `{kind:'provider', defaultInbound:'deny', allowInbound: 22,80,443,8443 tcp from any}` *(A4)*; reservedPorts 22 sshd; container mode; site "vps" |
| laptop | laptop-generic | — | site "roaming"; wifi interface subnet null; wg0 10.8.0.2 |
| galaxy-a16 | phone | — | tailscale0 on Tailnet, ip null (dhcp) |

**LXC allocations** *(A5)*: 100 1c/0.25G · 101 4c/4G · 102 2c/1G · 103 1c/1G · 104 2c/2G · 105 1c/0.5G · 106 4c/4G · 108 1c/1G · 109 1c/0.5G · 110 1c/1G · 111 1c/0.5G · VM 112 2c/4G. Their sum gives the expected **RES002 warning** "LXC memory limits overcommit host RAM" but no error: VM 4 GiB + overhead 1.5 GiB < 15 GiB.

**Services:**

| Service (instanceName) | Catalog | Parent | Runtime | Ports | Notes |
|---|---|---|---|---|---|
| cloudflared | cloudflared | lxc-100 | native | none | reverse-proxy `via: cloudflare-tunnel` → pve port 8006, hostnames [`pve.lumosdhia.com`], tls cloudflare, public, upstreamScheme https |
| jellyfin | jellyfin | lxc-101 | native | 8096 | gpu optional transcode-h264/hevc; mounts bind → pve `st_inventory` `/mnt/inventory`→`/media` |
| qbittorrent | qbittorrent | lxc-102 | native | 8080 | mounts bind st_inventory |
| kavita | kavita | lxc-103 | native | 5000 | mounts bind st_inventory |
| stash | stash | lxc-104 | native | 9999 | mounts bind st_inventory |
| files | filebrowser | lxc-105 | native | 8080 | mounts bind st_inventory |
| immich-server | immich-server | lxc-106 | docker | 2283 | depends-on postgres, redis, immich-ml (optional) |
| immich-machine-learning | immich-machine-learning | lxc-106 | docker | internal 3003 | |
| immich-postgres | postgres | lxc-106 | docker | internal 5432 | |
| immich-redis | redis | lxc-106 | docker | internal 6379 | |
| sonarr | sonarr | lxc-108 | native | 8989 | depends-on prowlarr, qbittorrent |
| prowlarr | prowlarr | lxc-109 | native | 9696 | depends-on flaresolverr (optional) |
| flaresolverr | flaresolverr | lxc-110 | native | 8191 | status broken |
| samba | samba | lxc-111 | native | 445, 139 | mounts bind st_inventory |
| tailscale | tailscale | pve | native | none | vpn-tunnel → tailnet, `protocol: tailscale`, subnetRoutes [`192.168.1.0/24`] |
| transcode-worker | generic-systemd | transcoder | systemd | none | gpu required transcode-hevc |
| library-transcode | generic-systemd | transcoder | systemd | none | replicates-to pve `{tool:'rsync', targetStorageId:'st_inventory'}` |
| npm | nginx-proxy-manager | vps | docker | 80, 443, `127.0.0.1:81` (admin) | dockerNetworks [proxy-nw]; reverse-proxy links (below) |
| filebrowser | filebrowser | vps | docker | 4999 | |
| anime-nani | generic-container | vps | docker | 5000 | depends-on anime-nani-flaresolverr |
| anime-nani-flaresolverr | flaresolverr | vps | docker | internal 8191 | |
| navidrome | navidrome | vps | docker | 5003 | |
| yamtrack | yamtrack | vps | docker | 5004 | depends-on yamtrack-redis |
| yamtrack-redis | redis | vps | docker | internal 6379 | |
| miniflux | miniflux | vps | docker | 5005 | |
| grafana | grafana | vps | docker | 5006 | depends-on prometheus |
| prometheus | prometheus | vps | docker | internal 9090 | depends-on node-exporter, cadvisor |
| node-exporter | node-exporter | vps | docker | internal 9100 | |
| cadvisor | cadvisor | vps | docker | internal 8080 | |
| homarr | homarr | vps | docker | 5007 | |
| couchdb | couchdb | vps | docker | 5984 | |
| audiobookshelf | audiobookshelf | vps | docker | 13378 | |
| registry | docker-registry | vps | docker | 5008→5000 | |
| nextcloud | nextcloud | vps | docker | internal 80 | depends-on nextcloud-db, nextcloud-redis; mounts → pve `{protocol:'sshfs'}` *(A6)* ("pvemount") |
| nextcloud-db | mariadb *(A7)* | vps | docker | internal 3306 | |
| nextcloud-redis | redis | vps | docker | internal 6379 | |
| nextcloud-cron | nextcloud-cron | vps | docker | none | depends-on nextcloud |
| glances | glances | vps | docker | internal 61208 | |
| pve-glances-relay | generic-container | vps | docker | internal 61209 *(A8)* | depends-on pve (device) |
| tailscale-vps | tailscale | vps | docker (networkMode host) | none | vpn-tunnel → tailnet |
| crafty | crafty-controller | vps | systemd | 8443 (admin, auth app, https) | |
| wireguard | wireguard | vps | systemd | `127.0.0.1:51820/udp` | |
| wstunnel | wstunnel | vps | systemd | `127.0.0.1:8081` *(A9)* | |

**Links (besides those above):**

- ethernet: `isp-router` ↔ `lan` (lan role), `pve` ↔ `lan`, `isp-router` ↔ `internet` (wan role), `vps` ↔ `internet`
- wifi: `pve` → `isp-router` (backup), `transcoder` → `isp-router`, `steam-deck` → `isp-router`
- vpn-tunnel: `laptop` → `vps.wireguard` `{protocol:'wireguard', transport:'ssh', port:22, overlaySubnetId: wg-laptop}`, `galaxy-a16` → `tailnet` `{protocol:'tailscale'}`
- reverse-proxy, from `npm` with `tls:'letsencrypt'`, `public:true`, `authLayer:'none'`: hostnames `<instanceName>.purplehallos.com` *(A10)* for filebrowser, anime-nani, navidrome, yamtrack, miniflux, grafana, homarr, audiobookshelf, nextcloud; `docker.lumosdhia.com` → registry. Proxied services are on proxy-nw, so `upstreamPort` = containerPort.
- backup-to: none in the real design. This produces expected BAK001 warnings: the design honestly shows that backups are missing.

**Assumptions** (marked in each node's `notes` as `assumed: …`; the user corrects them in the UI):

- A1: DHCP range .100–.199.
- A2: WireGuard overlay 10.8.0.0/24.
- A3: proxy-nw CIDR 172.18.0.0/16.
- A4: VPS filtering is provider/host-level, not ufw (otherwise EXP006 fires).
- A5: LXC CPU and RAM allocations.
- A6: pvemount uses sshfs over the tailnet.
- A7: the Nextcloud DB is MariaDB 11.
- A8: relay port.
- A9: wstunnel local port.
- A10: purplehallos subdomains equal the instance names.

**Expected analysis** (asserted by `tests/unit/seeds.test.ts`):

- `counts.error === 0`.
- Warnings include exactly these rule ids: `RES002` (pve LXC overcommit), `EXP001` (pve.lumosdhia.com → 8006 admin; crafty 8443 admin), `BAK001` (each stateful service), `NET008` absent (the laptop is a client).
- Info includes `SVC002` only if tags are `latest` (seed tags are pinned, so it is absent), `IMP001` (pve, vps), `EXP004` (vps blocked ports), `BAK003` absent (since no backups), and `CST001` absent (all devices have power data; LXCs are excluded as guests).
- The exact sorted list of `(ruleId, subjects)` is pinned in `tests/golden/homelab/findings.json`.

### 8.9 Reference design B: "k3s + CI/CD" (`src/shared/seeds/k3s-cicd.ts`)

**Subnets:**

- LAN `10.10.0.0/24` VLAN 10, gw `.1`, DHCP `.100–.199`
- Servers `10.20.0.0/24` VLAN 20, gw `.1`, no DHCP
- Internet `0.0.0.0/0`
- Pods `10.42.0.0/16` (k8s-pod)
- Svc `10.43.0.0/16` (k8s-service)

**Devices:**

- `router` (opnsense-box): 10.10.0.1 and 10.20.0.1 on VLAN interfaces; WAN dhcp; port forwards 80 → traefik LB 10.20.0.240:80 and 443 → 10.20.0.240:443.
- `switch` (switch-managed-8p): trunk to the router, tagged [10, 20].
- `ups` (ups-line-interactive): inside the "Rack" site group.
- `nas` (nas-4bay): 10.20.0.20, storage `st_pool` zfs-pool raidz1 10.9 TiB, with nfs-server and minio services.
- The `k8s-cluster` group "k3s-prod": `k8s: {distribution:'k3s', namespace:'apps', podCidr:'10.42.0.0/16', serviceCidr:'10.43.0.0/16', loadBalancerRange: {start:'10.20.0.240', end:'10.20.0.250'}}`, containing:
  - `cp-1` (lenovo-m720q, 6c/6t, 32 GiB, 10.20.0.11, k8s control-plane, hosts k3s-server)
  - `w-1`, `w-2` (lenovo-m720q, 10.20.0.12/.13, workers, host k3s-agent)
- `dev-laptop` (laptop-generic): 10.10.0.150 dhcp-reserved.

**Cluster services** (runtime k8s, parent = cluster group):

- `metallb`, `cert-manager`
- `traefik` (capability ingress-controller, load-balancer; ports 80, 443)
- `gitea` (3000 http, 22 ssh; depends-on gitea-postgres)
- `gitea-postgres` (postgres, stateful)
- `act-runner` (gitea-act-runner, replicas 2, depends-on gitea and registry)
- `registry` (docker-registry, behind traefik with `authLayer:'basic'`)
- `argocd` (depends-on gitea)
- `podinfo` (generic-container `ghcr.io/stefanprodan/podinfo:6.7.1`, replicas 2, depends-on podinfo-redis)
- `podinfo-redis` (redis)
- `prometheus`, `grafana` (depends-on prometheus)

**Links:**

- reverse-proxy `via: 'ingress'` from traefik, `tls: letsencrypt`, public: `git.example.lab`, `registry.example.lab`, `argocd.example.lab`, `podinfo.example.lab`, `grafana.example.lab`
- backup-to: gitea-postgres → nas (`restic`, daily, `st_pool`); nas → nothing (BAK003 info: no off-site)
- mounts: none

**Pipeline frame** (`group` role `pipeline`, positioned beside the cluster): it contains one note "push → act-runner builds image → pushes to registry → Argo CD syncs podinfo". The real links are the depends-on edges above.

**Expected analysis:** zero errors. Warnings include `EXP001` (argocd and gitea admin UIs public via ingress, with auth app) and `BAK001` for stateful services other than gitea-postgres. Pinned in `tests/golden/k3s-cicd/findings.json`. Generators produce `k8s/k3s-prod/*` goldens and **no** compose files.

---

## 9. File tree

```
rackdrafter/
├─ package.json                      # scripts (§10.4), deps, "imports": {"#shared/*": "./src/shared/*"}, engines node>=22.18
├─ package-lock.json                 # committed; ensure.ts uses its hash
├─ .nvmrc                            # "24"
├─ .gitignore                        # node_modules, dist, data/*.db*, .cache, test-results, playwright-report, .tmp
├─ tsconfig.json                     # strict, erasableSyntaxOnly, allowImportingTsExtensions, verbatimModuleSyntax, moduleResolution bundler, jsx react-jsx, noEmit
├─ biome.json                        # lint+format config (2-space, single quotes, line width 110)
├─ vite.config.ts                    # react plugin, tailwind plugin, build.outDir dist/client, manifest true, manualChunks {react, xyflow}
├─ vitest.config.ts                  # test.projects: shared(node), server(node), client(jsdom)
├─ playwright.config.ts              # chromium only, webServer = node src/server/index.ts on PORT 4748 with temp DB
├─ drizzle.config.ts                 # dialect sqlite, schema src/server/db/schema.ts, out drizzle
├─ index.html                        # root div, font preload, theme bootstrap inline script (sets data-theme pre-paint)
├─ README.md                         # what it is, `npm start`, env vars, scripts, screenshots section
├─ ATTRIBUTION.md                    # GENERATED by icons script: icon sources, licenses, trademark notice
├─ PLAN.md                           # this document
├─ drizzle/
│  ├─ 0000_init.sql                  # generated DDL (§8.3)
│  └─ meta/_journal.json             # drizzle-kit journal
├─ data/.gitkeep                     # default DB directory
├─ public/
│  ├─ favicon.svg                    # 16px mark: two linked squares, mono, accent stroke
│  ├─ ATTRIBUTION.md                 # copy written by icons script
│  └─ icons/                         # GENERATED svgs (+ NOTICE.txt); committed
├─ scripts/
│  ├─ ensure.ts                      # pre-start: npm ci if lock hash changed, vite build if client stale
│  ├─ check-bundle.ts                # gzip sizes from dist/client/.vite/manifest.json vs budgets (§12)
│  ├─ db-reset.ts                    # deletes RACKDRAFTER_DB file(s) after confirmation flag --yes
│  ├─ seed.ts                        # inserts seeds into the configured DB (idempotent by slug)
│  └─ icons/
│     ├─ fetch-icons.ts              # §5.4 fetch/verify/sanitize/manifest/attribution; --pin, --offline, --check
│     ├─ sources.json                # pinned commits, SPDX, license hashes
│     └─ category-glyphs.ts          # category -> tabler glyph + EXTRA_GLYPHS
├─ src/
│  ├─ shared/                        # pure TS, no DOM/Node APIs (except crypto via injected hasher)
│  │  ├─ domain/
│  │  │  ├─ types.ts                 # §2 types and const enums
│  │  │  ├─ schema.ts                # Zod 4 schemas mirroring types
│  │  │  ├─ schema.typecheck.ts      # compile-time Equal<z.infer, T> assertions
│  │  │  ├─ ids.ts                   # newId(prefix), setIdGenerator, sequentialIds, seedIds
│  │  │  ├─ factories.ts             # createProject/createDeviceNode/createServiceNode/createSubnet/...
│  │  │  ├─ placement.ts             # placementOf, effectiveHost, physicalHost, canContain
│  │  │  ├─ link-rules.ts            # canConnect + inferLinkKind (§2.6)
│  │  │  ├─ validate.ts              # validateIntegrity invariants I1–I5
│  │  │  ├─ normalize.ts             # normalizeOrder (parents first), sortTaggedVlans etc.
│  │  │  ├─ canonical.ts             # canonicalJson, hashable view without viewport
│  │  │  └─ migrations/index.ts      # DOC_MIGRATIONS, migrateProject
│  │  ├─ net/
│  │  │  ├─ ipv4.ts                  # uint32 IP/CIDR math, nextFreeIp
│  │  │  └─ listeners.ts             # netns listener sets per device (§6.3), reused by analysis + ip-table
│  │  ├─ catalog/
│  │  │  ├─ types.ts                 # CatalogItem union
│  │  │  ├─ categories.ts            # category labels + display order
│  │  │  ├─ devices/{compute,virtual,storage,network,power,clients}.ts
│  │  │  ├─ services/{media,photos,downloads,network,proxy,home-automation,productivity,monitoring,data,devops,kubernetes,backup,gaming,auth,ai,generic}.ts
│  │  │  ├─ networks.ts              # 6 network templates
│  │  │  ├─ icon-manifest.json       # GENERATED
│  │  │  ├─ icons.ts                 # resolveIcon(slug) -> {url, render, hex} with fallback
│  │  │  ├─ search.ts                # searchCatalog(query) scoring
│  │  │  └─ index.ts                 # CATALOG map, list helpers
│  │  ├─ analysis/
│  │  │  ├─ index.ts                 # analyze(), AnalysisContext builder
│  │  │  ├─ context.ts               # precomputed indexes
│  │  │  ├─ types.ts                 # Finding, QuickFix, RuleId, Severity
│  │  │  ├─ impact.ts                # impactOf (§6.6)
│  │  │  ├─ cost.ts                  # cost & power (§6.7)
│  │  │  ├─ exposure.ts              # PublicEndpoint computation (§6.9)
│  │  │  ├─ resources.ts             # ResourceRow computation
│  │  │  └─ rules/{index,net,ports,resources,k8s,links,services,backup,exposure,impact,cost}.ts
│  │  ├─ generators/
│  │  │  ├─ index.ts                 # generateAll(format) dispatcher
│  │  │  ├─ slug.ts                  # slugify, uniqueSlugs
│  │  │  ├─ yaml.ts                  # deterministic stringify helpers, quoting
│  │  │  ├─ compose.ts               # §7.2
│  │  │  ├─ k8s.ts                   # §7.3
│  │  │  ├─ ip-table.ts              # §7.4
│  │  │  ├─ mermaid.ts               # §7.5
│  │  │  ├─ analysis-report.ts       # docs/analysis.md
│  │  │  └─ zip.ts                   # deterministic fflate zip
│  │  ├─ importers/compose.ts        # §7.8
│  │  └─ seeds/
│  │     ├─ builder.ts               # buildProject DSL (shared by seeds and tests)
│  │     ├─ homelab.ts               # reference design A
│  │     ├─ k3s-cicd.ts              # reference design B
│  │     └─ index.ts                 # SEEDS registry
│  ├─ server/
│  │  ├─ index.ts                    # entry: env -> buildApp -> listen; graceful shutdown closes DB
│  │  ├─ app.ts                      # buildApp(): fastify, zod provider, plugins, routes
│  │  ├─ env.ts                      # Zod-validated env + bind-safety check
│  │  ├─ errors.ts                   # ApiError + error handler -> {error:{code,message}}
│  │  ├─ db/
│  │  │  ├─ client.ts                # open DB, pragmas, migrate
│  │  │  ├─ schema.ts                # drizzle tables (§8.3)
│  │  │  └─ repo/{projects,versions,shares,meta}.ts  # all SQL lives here, transactions explicit
│  │  ├─ routes/{health,projects,versions,shares,analysis,export}.ts
│  │  ├─ plugins/
│  │  │  ├─ auth.ts                  # bearer token hook (§8.6)
│  │  │  ├─ spa.ts                   # prod static + fallback
│  │  │  └─ vite-dev.ts              # middie + vite middleware in --dev
│  │  └─ seed.ts                     # first-boot seeding
│  └─ client/
│     ├─ main.tsx                    # React root, router, theme
│     ├─ router.tsx                  # 3 routes: "/", "/p/:id", "/s/:token" (tiny hand router on history API)
│     ├─ api/client.ts               # typed fetch wrapper, token header, error normalization
│     ├─ store/
│     │  ├─ index.ts                 # useEditor = create(...slices)
│     │  ├─ document.ts              # DocumentSlice, dispatch, transaction
│     │  ├─ commands.ts              # COMMANDS registry (§3.2)
│     │  ├─ history.ts               # HistorySlice, merge logic
│     │  ├─ selection.ts             # SelectionSlice
│     │  ├─ ui.ts                    # UiSlice (persisted subset to localStorage: theme, panels, linkMode)
│     │  ├─ persistence.ts           # PersistenceSlice
│     │  └─ analysis.ts              # AnalysisSlice + debounced runner
│     ├─ persistence/{autosave,local,conflict}.ts
│     ├─ canvas/
│     │  ├─ Canvas.tsx               # ReactFlow wiring, handlers, DnD, context menu host
│     │  ├─ useFlowNodes.ts          # document -> flow nodes/edges (memoized)
│     │  ├─ dnd.ts                   # palette drop + container detection
│     │  ├─ reparent.ts              # drag-stop container resolution
│     │  ├─ HelperLines.tsx          # alignment guides overlay
│     │  ├─ snapping.ts              # guide computation
│     │  ├─ floating.ts              # floating edge endpoint math
│     │  ├─ nodes/{DeviceNodeView,ServiceNodeView,NetworkNodeView,GroupNodeView,NoteNodeView,NodeCard,IconTile,BadgeRow,StatusDot}.tsx
│     │  └─ edges/LinkEdgeView.tsx   # per-kind styling (§4.5)
│     ├─ panels/
│     │  ├─ CatalogPanel.tsx  SubnetsPanel.tsx  OutlinePanel.tsx
│     │  ├─ Inspector.tsx            # dispatches to inspectors/*
│     │  ├─ inspectors/{DeviceInspector,ServiceInspector,NetworkInspector,GroupInspector,NoteInspector,LinkInspector,MultiInspector}.tsx
│     │  └─ IssuesPanel.tsx  ImpactPanel.tsx  CostPanel.tsx  ExposurePanel.tsx
│     ├─ chrome/{TopBar,LinkModeControl,SaveStatus,IssueCounter,ExportMenu,ShareDialog,VersionsDialog,ImportComposeDialog,ConflictDialog,TokenDialog,ShortcutSheet,OfflineBanner,Toasts}.tsx
│     ├─ pages/{ProjectListPage,EditorPage,ShareViewerPage}.tsx
│     ├─ keyboard/{keymap.ts,useKeymap.ts}
│     ├─ clipboard/clipboard.ts      # copy/paste serialization + remap
│     ├─ export/{image.ts,download.ts}
│     ├─ ui/                         # primitives: Button, IconButton, Input, Select, NumberInput, Field, Tabs, Menu, Dialog, Tooltip, Chip, Glyph (tabler mask)
│     └─ styles/{tokens.css,fonts.css,app.css,reactflow.css}  # reactflow.css overrides xyflow defaults to tokens
└─ tests/
   ├─ helpers/{build.ts,render.tsx,server.ts}   # project builder re-export, RTL render with store, buildApp on :memory:
   ├─ fixtures/
   │  ├─ documents/v1/{minimal.json,all-kinds.json}
   │  ├─ compose/{vps.yaml,arr-stack.yaml,long-syntax.yaml,anchors.yaml,invalid.yaml}
   │  └─ large-300.ts               # generator for the 300-node perf fixture
   ├─ golden/{homelab,k3s-cicd}/...  # compose/, k8s/, docs/, findings.json
   ├─ unit/                          # *.test.ts per module (mirrors src paths)
   └─ e2e/                           # Playwright specs (§10.2)
```

---

## 10. Test plan

### 10.1 Unit tests (Vitest)

`vitest.config.ts` defines two projects:
- `node`: `environment: 'node'`, `include: ['src/{lib,domain,analysis,generators,importers,catalog,store,seeds,persistence}/**/*.test.ts', 'tests/unit/**/*.test.ts']`, setup `src/test/setup-node.ts`.
- `dom`: `environment: 'jsdom'`, `include: ['src/**/*.test.tsx']`, setup `src/test/setup-dom.ts`.

`typecheck.enabled: true` with `include: ['src/**/*.typetest.ts']`.

Coverage (v8): `src/{lib,domain,analysis,generators,importers}/**` lines ≥ 90%, branches ≥ 85%; global lines ≥ 75%.

Example test names (each file must contain at least these):

| File | Tests |
|---|---|
| `lib/net/ipv4.test.ts` | `parses 192.168.1.0/24 to first .1 last .254 broadcast .255`; `rejects 192.168.1.5/24 as non-network address`; `overlaps detects 10.0.0.0/8 vs 10.20.0.0/24`; `nextFree skips gateway, dhcp range and used`; `nextFree returns null when exhausted`; property: `toUint32(fromUint32(n)) === n` |
| `lib/determinism.test.ts` | `slugify("Nginx Proxy Manager") === "nginx-proxy-manager"`; `slugify("Café Ünïcode") === "cafe-unicode"`; `slugify("123abc") === "s-123abc"`; property: `slugify is idempotent`; `uniqueSlugs assigns -2 in sorted order` |
| `domain/schema.test.ts` | `minimal fixture parses`; `rejects unknown key at nodes[0].spec.foo`; `rejects link to missing node with path links[0].target`; `rejects service placed on a note`; `rejects guest on non-hypervisor`; `rejects two network nodes for one subnet` |
| `domain/migrations.test.ts` | `every historical fixture migrates to current and parses`; `throws ProjectTooNewError for schemaVersion 999`; `v0 without schemaVersion gains schemaVersion 1` |
| `domain/linkRules.test.ts` | one `it` per row of §2.4, valid and invalid (e.g. `reverse-proxy from jellyfin is rejected: "jellyfin is not a reverse proxy"`, `depends-on cycle a→b→a rejected`) |
| `store/history.test.ts` | `dispatch then undo restores previous project by reference equality of untouched nodes`; `typing coalesces into one entry within 1000 ms`; `drag records one entry with from/to positions`; `redo cleared after new dispatch`; `past capped at 200` |
| `store/clipboard.test.ts` | `paste remaps all ids and keeps internal links`; `paste reassigns static IPs to next free`; `paste drops links with one endpoint outside selection` |
| `persistence/idbRepository.test.ts` | `save then load returns canonical-equal project`; `list returns metadata sorted by updatedAt desc` |
| `analysis/rules/network.test.ts` | one positive and one negative per NET rule, e.g. `NET005 flags duplicate 192.168.1.202`, `NET002 is warning for docker net overlapping LAN`, `NET006 skips /31` |
| `analysis/rules/ports.test.ts` | `PORT001 flags two services on 8080/tcp same host`; `PORT001 ignores 127.0.0.1:81 vs 0.0.0.0:80`; `PORT001 treats null bind and 127.0.0.1 on same port as conflict`; `PORT001 ignores same port on different LXCs` |
| `analysis/rules/resources.test.ts` | `LXC counts services+64 not its limit`; `VM counts its allocation`; `RES004 errors when nvenc required on igpu-only host`; `RES004 passes via gpuPassthrough`; `RES006 dgpu passthrough to two VMs` |
| `analysis/failure.test.ts` | `pve failure downs all LXC services`; `soft dependency yields degraded`; `cloudflared down makes pve.lumosdhia.com hostname down`; `switch failure makes downstream devices unreachable`; `FAIL001 reports cycle in order` |
| `analysis/cost.test.ts` | `8W idle 35W max at 0.25 load, 0.20/kWh -> 14.75W avg, 10.77 kWh, 2.15/mo` (asserted with `toBeCloseTo(…, 2)`) |
| `analysis/exposure.test.ts` | `firewall deny default exposes only allowed ports`; `EXP001 for Proxmox via tunnel with auth none`; `EXP002 couchdb exposed when firewall disabled` |
| `analysis/perf.test.ts` | `analyze perf-300 fixture under 30 ms (median of 5)` |
| `generators/compose.test.ts` | `emits deterministic file for two services` (inline snapshot from §7.2); `vps seed compose matches file snapshot`; `same output when nodes array is shuffled`; `secrets go to .env.example`; `qsv host emits /dev/dri device` |
| `generators/k8s.test.ts` | `k3s seed manifests match file snapshot`; `every document passes K8sObjectSchema`; `ingress backends reference existing services`; `statefulset uses volumeClaimTemplates` |
| `generators/ipTable.test.ts` | `homelab seed ip plan matches snapshot`; `IPs sorted numerically (.9 before .10)` |
| `generators/mermaid.test.ts` | `homelab mermaid parses with mermaid.parse`; `labels escape quotes` |
| `importers/compose.test.ts` | `imports vps fixture: 28 services, catalog matches for npm/navidrome/grafana`; `expands port range 6881-6882`; `network_mode host publishes container ports`; `round-trip generate→import preserves service set` |
| `catalog/catalog.test.ts` | §5.1 assertions; `count is 145` |
| `seeds/seeds.test.ts` | §9.2 |
| `editor/nodes/DeviceNode.test.tsx` | `renders label, sublabel, ip badge and status dot`; `collapsed host renders service chips with +N` |
| `panels/Palette.test.tsx` | `search "jelly" shows Jellyfin only`; `Enter inserts at viewport center` |
| `tests/unit/design-lint.test.ts` | `no gradients/backdrop-blur/emoji in src` |

### 10.2 Seed scenario tests (`src/seeds/seeds.test.ts`)

```ts
describe.each(TEMPLATES.filter(t => t.id !== 'blank'))('template $id', (t) => {
  it('parses with ProjectSchema', ...);
  it('has zero error findings', () => expect(analyze(t.build(), CATALOG).findings.filter(f => f.severity === 'error')).toEqual([]));
  it('finding ids match snapshot', () => expect(ids).toMatchSnapshot());
  it('build() is deterministic', () => expect(canonicalize(t.build())).toEqual(canonicalize(t.build())));
});
```

Specific assertions:
- **Homelab:**
  - `RES001` **warning** on `n_vps` with `data.used === 7664` and `data.capacity === 7987`;
  - no RES001 on `n_pve` (`used 11648 / 15360`);
  - `FAIL002` warning for prowlarr → flaresolverr;
  - `EXP001` warnings for `pve.lumosdhia.com` and crafty `:8443`;
  - `EXP005` info on vps;
  - simulate `{n_pve}` downs exactly the 11 LXC services + 2 host services + `n_vm112`, and `pve.lumosdhia.com`;
  - simulate `{n_vps}` leaves every home service up.
- **k3s:** zero errors and zero warnings except BAK-series; `RES008` usage < 15%; the k8s generator emits 4 namespaces.

### 10.3 Playwright specs (`e2e/`)

`playwright.config.ts`: `testDir: 'e2e'`, `fullyParallel: true`, `retries: process.env.CI ? 2 : 0`, `use: { baseURL: 'http://127.0.0.1:4748', viewport: { width: 1440, height: 900 }, trace: 'on-first-retry' }`, `webServer: { command: 'node --import tsx src/server/index.ts', port: 4748, env: { PORT: '4748', HOST: '127.0.0.1', RACKDRAFTER_DB: '.tmp/e2e.db', NODE_ENV: 'test' }, reuseExistingServer: !process.env.CI }`. Projects: `chromium` by default; `firefox`, `webkit` used only by `test:e2e:all`. The DB file is deleted in `globalSetup` so every run starts from the seeded reference designs.

Helpers (`e2e/helpers.ts`):
- `dropFromPalette(page, slug, {x, y})`: `getByTestId('palette-item-'+slug).dragTo(getByTestId('canvas'), { targetPosition: {x,y} })`.
- `nodeByLabel(page, label)`: `page.locator('.react-flow__node', { has: page.getByText(label, { exact: true }) })`.
- `connect(page, fromLabel, toLabel)`: hover the source node → `mouse.down` on its right handle (`[data-handlepos="right"]`) → `mouse.move` to the target node centre in 10 steps → `mouse.up`.
- `openTemplate(page, id)`: `getByRole('button', { name: id === 'homelab' ? 'Homelab reference' : 'k3s + CI/CD' }).click()`.

| Spec | Exact flow and assertions |
|---|---|
| `canvas-basics.spec.ts` | `goto('/')` → empty state visible ("Empty canvas") → drop `mini-pc` at (500,300) → node "Mini PC" visible → press `F2`, type `nuc-1`, Enter → label `nuc-1` → `Ctrl+Z` → label `Mini PC` → `Ctrl+Z` → node count 0 and empty state visible → `Ctrl+Shift+Z` → node back |
| `palette.spec.ts` | Press `/` → type `jelly` → exactly one `palette-item-*` visible → Enter → node "Jellyfin" exists; `Ctrl+K` → type `qbit` → Enter → node "qBittorrent" exists |
| `hosting.spec.ts` | Drop `proxmox-node` (400,300) → press Enter (expand) → drop `lxc-container` inside host bounds → drop `jellyfin` inside the LXC → inspector of Jellyfin shows `Host: LXC` → drag host by 200 px → Jellyfin's bounding box moved by the same delta (±2 px) → drag Jellyfin outside → placement shows `Standalone` |
| `links.spec.ts` | Drop `router`, `mini-pc`; add subnet `LAN 192.168.1.0/24` in Networks tab, click "Place on canvas" → `connect('Mini PC','LAN')` → edge `.edge-ethernet` count 1 → Mini PC NIC subnet shows `LAN` → press `4` (reverse-proxy) → connect Mini PC → Router → no new edge, toast contains `not a reverse proxy` |
| `ip-assign.spec.ts` | From links state: select Mini PC → Interfaces → "Assign next free IP" → value `192.168.1.2` (gateway .1) → badge on node shows `192.168.1.2` |
| `analysis.spec.ts` | Drop `docker-host`, expand, drop `qbittorrent` and `miniflux` inside → findings counter shows `1 error` → open drawer → row `PORT001` text contains `8080/tcp` → click row → both nodes have `.selected` → in inspector change miniflux host port to `8081` → counter shows `0 errors` |
| `keyboard.spec.ts` | Drop 2 nodes → `Ctrl+A` → `Ctrl+C` → `Ctrl+V` → 4 nodes, pasted ones offset by 24 px → `Ctrl+G` → one group node → `Ctrl+Shift+G` → zero groups → `Delete` → 0 nodes |
| `persistence.spec.ts` | Drop node → wait for "Saved" → `page.reload()` → node present → Export (`Ctrl+E`) → Project JSON tab → Download → file name ends `.rackdrafter.json` → overflow menu → Projects → New → Import JSON (set the downloaded file) → node present |
| `templates.spec.ts` | `openTemplate('homelab')` → counter text matches `/^0 errors/` → nodes `pve`, `vps`, `jellyfin`, `nginx-proxy-manager` visible after `Ctrl+0`; same for `k3s` with `gitea`, `argocd` |
| `export.spec.ts` | Homelab → `Ctrl+E` → Compose tab → file list contains `compose/vps/compose.yaml` → preview contains `nginx-proxy-manager:` and `"127.0.0.1:81:81"` → Mermaid tab preview starts `flowchart LR` → Image tab → Download SVG → file contains `<svg` and `Jellyfin` → Download PNG → first 4 bytes `89 50 4E 47` → Download all → zip non-empty |
| `compose-import.spec.ts` | `Ctrl+I` → Compose tab → paste `tests/fixtures/compose/edge-cases.yaml` content → target "New Docker host" → Import → summary text visible → node count increased by services + 1 → `Ctrl+Z` → back to previous count |
| `failure-sim.spec.ts` | Homelab → press `F` → click node `pve` → node `jellyfin` has `data-state="down"`, node `navidrome` has no `data-state` → SPOF tab first row `pve` |
| `theme.spec.ts` | Press `Shift+D` → `html` has class `dark` → reload → still dark |
| `a11y.spec.ts` | `new AxeBuilder({ page }).include('#root').analyze()` on: empty state, homelab loaded, export dialog open → zero violations with impact `serious` or `critical` |
| `visual.spec.ts` (tag `@visual`, excluded from verify) | Homelab, light + dark, `toHaveScreenshot({ maxDiffPixelRatio: 0.01 })` |
| `perf.spec.ts` (tag `@perf`, excluded from verify) | Load `perf-300.json` → pan 2 s → rAF-counted fps ≥ 30 logged |

### 10.4 npm scripts

```json
{
  "dev": "node --watch-path=src/server --watch-path=src/shared -r tsx/cjs src/server/index.ts",
  "build": "tsc -b && vite build",
  "start": "NODE_ENV=production tsx scripts/ensure.ts && node --import tsx src/server/index.ts",
  "db:generate": "drizzle-kit generate",
  "db:reset": "tsx scripts/db-reset.ts --yes",
  "db:seed": "tsx scripts/seed.ts",
  "typecheck": "tsc -b --pretty",
  "lint": "eslint . --max-warnings 0",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage",
  "test:e2e": "npm run build && playwright test --grep-invert \"@visual|@perf\"",
  "test:e2e:all": "npm run build && playwright test --project=chromium --project=firefox --project=webkit --grep-invert @perf",
  "test:visual": "npm run build && playwright test --grep @visual",
  "icons:fetch": "tsx scripts/icons/fetch-icons.ts",
  "icons:verify": "tsx scripts/icons/verify-icons.ts",
  "bundle:check": "tsx scripts/check-bundle.ts",
  "fixtures:perf": "tsx scripts/gen-perf-fixture.ts",
  "verify": "npm run format:check && npm run typecheck && npm run lint && npm run icons:verify && npm run test && npm run build && npm run bundle:check && playwright test --grep-invert \"@visual|@perf\""
}
```

**`npm run verify` is the one command.** First-time setup is `npm ci && npx playwright install --with-deps chromium`.

**Playwright `webServer`** runs `node --import tsx src/server/index.ts` with `PORT=4748`, `HOST=127.0.0.1`, `RACKDRAFTER_DB=.tmp/e2e.db` (deleted before the run), `RACKDRAFTER_TOKEN` unset, `url: http://127.0.0.1:4748/api/health`, `reuseExistingServer: !process.env.CI`. Every e2e spec starts from a fresh DB because the seed runs on boot and project creation is API-driven through `tests/helpers/server.ts`.

**Vitest projects** (`vitest.config.ts`): `shared` (node; `src/shared/**`), `server` (node; `src/server/**` with `:memory:` DB via `buildApp`), `client` (jsdom; `src/{store,editor,panels,ui}/**/*.test.tsx`).

### 10.5 Lint guards

`no-restricted-imports` enforces the layering:
- `src/{domain,lib,analysis,generators,importers}` must not import from `react`, `@xyflow/react`, `src/store`, `src/editor`, `src/panels` or `src/ui`;
- `src/generators/image.ts` is the only generator allowed to import DOM libraries;
- `Math.random` and `Date.now` are banned outside `src/domain/{ids,clock}.ts` (`no-restricted-properties`).

### 10.6 Reference design data (seeds)

**ASSUMPTIONS in the homelab seed.** These are marked in code with `// ASSUMPTION:` comments and listed in the template's description note so the user can correct them:
1. The ISP router at 192.168.1.1 is the gateway, DHCP server and Wi-Fi AP. LAN DHCP range is 192.168.1.100–.199.
2. Transcoder .104, Steam Deck .114 and pve Wi-Fi .113 are DHCP reservations.
3. LXC RAM limits:
   - 100 cloudflared: 512
   - 101 jellyfin: 3072
   - 102 qbittorrent: 1024
   - 103 kavita: 1024
   - 104 stash: 1024
   - 105 files: 512
   - 106 immich: 4096
   - 108 sonarr: 1024
   - 109 prowlarr: 512
   - 110 flaresolverr: 1024
   - 111 samba: 512

   VM 112 dev: 2048 MB, 2 vCPU, 32 GB disk.
4. LXC 101 has the UHD 770 passed through (`/dev/dri`).
5. Transcoder has a 512 GB NVMe and wired ethernet.
6. VPS public subnet is 144.91.127.0/24 with no gateway modelled. Firewall default deny with allow 22, 80, 443, 8443 tcp from any.
7. `proxy-nw` is 172.18.0.0/16 and external.
8. Container images/ports:
   - anime-nani: `anime-nani:local` on 5000
   - miniflux uses a `postgres:16` sidecar `miniflux-db`
   - nextcloud db is `mariadb:11`
   - pvemount is a custom sshfs container mounting pve `/mnt/inventory` over Tailscale (read-only)
   - pve-glances-relay is a custom container
9. NPM hostnames under purplehallos.com:
   - files → filebrowser
   - anime → anime-nani
   - music → navidrome
   - track → yamtrack
   - rss → miniflux
   - grafana → grafana
   - home → homarr
   - books → audiobookshelf
   - cloud → nextcloud
   - couch → couchdb

   Also `docker.lumosdhia.com` → registry (fact). All have tls true and auth none.
10. WireGuard runs as systemd on the VPS (51820/udp bound 127.0.0.1). wstunnel is a container behind NPM at `wg.mavubo.com`, websockets on. The laptop tunnel overlay is 10.8.0.0/24 (VPS .1, laptop .2).
11. No backups are modelled, so BAK001 warnings are expected.
12. Volume sizes on the VPS:
    - nextcloud data: 60 GB
    - registry: 20 GB
    - prometheus: 10 GB
    - mariadb: 5 GB
    - all others: 1 GB

    Σ ≈ 120 GB of 145 GB = 83%, below diskWarn 0.90.
13. Power:
    - OptiPlex: idle 8 W / max 45 W
    - ASUS TUF F15: idle 12 W / max 150 W
    - ISP router: 10/12 W
    - VPS: 0 W, monthly cost null (COST001 does not fire for VPS since `maxW=0` and role `vps` is excluded)

**Homelab seed (`src/seeds/homelab.ts`), facts as given:**

- **Groups:** `n_site_home` "Home" (site, failureDomain), `n_site_vps` "VPS" (site, failureDomain), `n_zone_clients` "Roaming clients" (zone, not a failure domain).
- **Zones:** lumosdhia.com (cloudflare), purplehallos.com, mavubo.com.

**Subnets:**

| ID | Name | CIDR | Purpose | Scope | Gateway | DHCP |
|---|---|---|---|---|---|---|
| `s_lan` | LAN | 192.168.1.0/24 | lan | global (site Home) | 192.168.1.1 | .100–.199 |
| `s_tailnet` | tailnet | 100.64.0.0/10 | vpn-overlay | global | — | — |
| `s_vps_pub` | VPS public | 144.91.127.0/24 | wan | global (site VPS) | — | — |
| `s_proxy` | proxy-nw | 172.18.0.0/16 | docker | host `n_vps`, external | — | — |
| `s_wg` | wg-laptop | 10.8.0.0/24 | vpn-overlay | global | — | — |

**Home devices:**

| ID | Label | Catalog | Key spec |
|---|---|---|---|
| `n_internet` | Internet | internet | — |
| `n_isp` | ISP router | isp-router | eth0 .1 (LAN), wifi AP; WAN link to Internet |
| `n_lanbus` | LAN | network node → `s_lan` | |
| `n_pve` | pve | dell-optiplex-micro | hypervisor, Proxmox VE 9; i5-12600T 6c/12t; 15360 MB; reserved 1024; storage: NVMe 1000 GB, lvm-thin "media" 500 GB `/srv/media` backing NVMe, usb-ssd "Inventory" 2000 GB `/mnt/inventory` external; GPU UHD 770 (igpu, intel, [qsv, vaapi], [h264, hevc]); NICs: vmbr0 bridge 192.168.1.200 static primary, wlan0 wifi 192.168.1.113 dhcp reserved, tailscale0 tunnel 100.88.254.73 on tailnet; advertisedRoutes [192.168.1.0/24]; expanded |
| `n_ct100` … `n_ct111` | cloudflared, jellyfin, qbittorrent, kavita, stash, files, immich, sonarr, prowlarr, flaresolverr, samba | lxc-container, guestIds 100,101,102,103,104,105,106,108,109,110,111 | eth0 static .201,.202,.203,.204,.205,.206,.207,.209,.210,.211,.212 on LAN; flaresolverr (CT 110) `status: 'broken'` |
| `n_vm112` | dev | virtual-machine, guestId 112 | eth0 dhcp on LAN, ip null |
| `n_transcoder` | transcoder | gaming-laptop | ASUS TUF F15, Ubuntu 24.04, i5-11400H 6c/12t, 31744 MB, RTX 2050 (dgpu, nvidia, [nvenc, cuda], [h264, hevc], 4096 MB), eth0 192.168.1.104 dhcp reserved, role transcoder |
| `n_deck` | Steam Deck | steam-deck | wlan0 192.168.1.114 dhcp reserved |

**Home services:**
- One per LXC, runtime `lxc-native`, with ports: jellyfin 8096, qbittorrent 8080, kavita 5000, stash 9999, files (filebrowser) 8080, immich 2283, sonarr 8989, prowlarr 9696, flaresolverr 8191 (status broken), samba 445, cloudflared none.
- On `n_pve` directly: `proxmox-ve-ui` (systemd, 8006, adminUi) and `tailscale` (systemd).
- On `n_transcoder`: `transcode-worker` (custom-systemd, gpu required [nvenc], 2000 m / 2048 MB) and `library-transcode` (custom-systemd, 500 m / 512 MB).

**Clients:**
- `n_laptop` "laptop": laptop, wg0 10.8.0.2 on `s_wg`.
- `n_phone` "galaxy-a16": phone, tailscale0 dhcp on tailnet.
- Both are in the "Roaming clients" zone.

**VPS** `n_vps` "vps":
- Catalog `vps`, role vps, hostname `s`, fqdn `s.mavubo.com`, Ubuntu 24.04, 4c/4t, 7987 MB, reserved 512, virtual-disk 145 GB.
- NICs: eth0 144.91.127.54 static publicIp primary on `s_vps_pub`; tailscale0 100.125.127.33 on tailnet; wg0 10.8.0.1 on `s_wg`.
- Firewall as assumed in item 6. Expanded.

**VPS services** (all docker on `n_vps`, networks `[s_proxy]` unless noted):

| Label | Catalog | Published | Notes |
|---|---|---|---|
| nginx-proxy-manager | nginx-proxy-manager | 80, 443, 127.0.0.1:81 | adminUi |
| filebrowser | filebrowser | 4999→80 | |
| anime-nani | custom-container | 5000→5000 | depends-on flaresolverr-vps |
| flaresolverr-vps | flaresolverr | — | label "flaresolverr" (container name `flaresolverr`) |
| navidrome | navidrome | 5003→4533 | |
| yamtrack | yamtrack | 5004→8000 | depends-on yamtrack-redis |
| yamtrack-redis | redis | — | |
| miniflux | miniflux | 5005→8080 | depends-on miniflux-db |
| miniflux-db | postgres | — | |
| grafana | grafana | 5006→3000 | depends-on prometheus |
| prometheus | prometheus | — | depends-on (soft) node-exporter, cadvisor |
| node-exporter | node-exporter | — | |
| cadvisor | cadvisor | — | |
| homarr | homarr | 5007→7575 | |
| couchdb | couchdb | 5984→5984 | database capability; firewall blocks it → only EXP005 info |
| audiobookshelf | audiobookshelf | 13378→80 | |
| registry | docker-registry | 5008→5000 | `docker.lumosdhia.com` via NPM |
| nextcloud | nextcloud | — | depends-on nextcloud-db, nextcloud-redis, pvemount |
| nextcloud-db | mariadb | — | |
| nextcloud-redis | redis | — | |
| nextcloud-cron | nextcloud | — | command `["/cron.sh"]`, depends-on nextcloud |
| pvemount | custom-container | — | mounts → `n_pve` (sshfs, `/mnt/inventory`, read-only) |
| glances | glances | — | |
| pve-glances-relay | custom-container | — | depends-on (soft) glances |
| tailscale-vps | tailscale | — | label "tailscale", network_mode host (no networks) |
| wstunnel | wstunnel | — | |
| wireguard | wireguard (runtime systemd) | 127.0.0.1:51820/udp | |
| crafty | crafty-controller (runtime systemd) | 8443 | adminUi |

**Links:**
- ethernet: `n_isp`↔`n_internet` (WAN), `n_isp`↔`n_lanbus`, `n_pve`↔`n_lanbus` (vmbr0), `n_transcoder`↔`n_lanbus`; `n_vps`↔`n_internet`.
- wifi: `n_isp`↔`n_deck`, `n_isp`↔`n_pve` (wlan0).
- vpn-tunnel:
  - `n_pve`↔`n_vps` (tailscale, transport udp, overlay tailnet, routedCidrs [192.168.1.0/24])
  - `n_phone`↔`n_pve` (tailscale)
  - `n_laptop`→`n_vps` (wireguard, transport wstunnel, endpointHost `wg.mavubo.com`, endpointPort 443, overlay `s_wg`, fullTunnel true)
- reverse-proxy:
  - cloudflared → proxmox-ve-ui `pve.lumosdhia.com`, tls true, auth none
  - NPM → each hostname in assumption 9, plus `docker.lumosdhia.com` → registry and `wg.mavubo.com` → wstunnel (websockets)
- depends-on: as in the table, plus prowlarr → flaresolverr (soft), sonarr → prowlarr (soft), sonarr → qbittorrent (soft). No other home depends-on links.
- replicates-to: library-transcode → `n_pve` (rsync, targetStorageId Inventory, targetPath `/mnt/inventory`).
- mounts: jellyfin LXC volumes are bind mounts `/srv/media` and `/mnt/inventory` with `storageRef` to pve storages (volumes, not links).

**Layout coordinates** are fixed in the seed: Home site at (0,0) 1600×1100, VPS site at (1720,0) 1500×1100, clients zone at (0,1180) 900×260. This keeps PNG snapshots stable.

**k3s + CI/CD seed (`src/seeds/k3sCicd.ts`):**
- Site "Lab rack" (rack). Zone `lab.home.arpa`.
- Subnets:
  - `s_k8s_lan` 10.20.0.0/24 VLAN 20, gw .1, DHCP .100–.199
  - pod 10.42.0.0/16 (k8s-pod, cluster scope)
  - service 10.43.0.0/16 (k8s-service, cluster scope)
- Devices:
  - `firewall-appliance` "edge" 10.20.0.1
  - `managed-switch` "sw-lab"
  - 3× `lenovo-thinkcentre-tiny`:
    - `k3s-cp-1`: control-plane, i5-8500T 6c/6t, 16384 MB, 256 GB NVMe, 10.20.0.11
    - `k3s-w-1`: worker, 32768 MB, 512 GB NVMe, 10.20.0.12
    - `k3s-w-2`: worker, 32768 MB, 512 GB NVMe, 10.20.0.13
  - `nas-4bay` "nas" 10.20.0.20, 4×4000 GB HDD + zfs-pool 12000 GB
  - `ups` "ups" 900 W / 540 Wh, with depends-on (power) from all three nodes and the NAS
- Cluster `k_lab`: k3s v1.31, ingress traefik, storageClass local-path, namespaces [apps, ci, monitoring, platform].
- Services (cluster placement):

| Service | Namespace | Workload | Replicas |
|---|---|---|---|
| traefik | platform | deployment | 1 |
| cert-manager | platform | deployment | 1 |
| argocd | platform | deployment | 1 |
| gitea | ci | statefulset | 1 |
| postgres | ci | statefulset | 1 |
| gitea-act-runner | ci | deployment | 2 |
| docker-registry | ci | deployment | 1 |
| web-app | apps | deployment | 3 |
| redis | apps | deployment | 1 |
| prometheus | monitoring | statefulset | 1 |
| grafana | monitoring | deployment | 1 |

  web-app is a `custom-container`, image `registry.lab.home.arpa/apps/web:1.0.0`, port 8080. All volumes are `pvc`.
- Links:
  - ethernet: all devices ↔ sw-lab; sw-lab ↔ edge
  - reverse-proxy traefik → gitea `git.lab.home.arpa`, → docker-registry `registry.lab.home.arpa`, → argocd `argocd.lab.home.arpa`, → web-app `app.lab.home.arpa`, → grafana `grafana.lab.home.arpa` (tls true; auth `sso` for argocd/grafana, none for the others)
  - depends-on: gitea → postgres (database, hard); gitea-act-runner → gitea (ci, hard, label "pull jobs"); gitea-act-runner → docker-registry (ci, soft, label "push image"); argocd → gitea (ci, soft, label "watch repo"); web-app → docker-registry (ci, soft, label "pull image"); web-app → redis (cache, hard); grafana → prometheus (soft)
  - backup-to: postgres → nas (restic, `0 3 * * *`, `7d4w6m`)
- Note node: "Pipeline: push → Gitea → act runner builds + pushes to registry → Argo CD syncs apps/web-app".
- Expected: zero errors, zero warnings except `BAK001` for gitea, docker-registry and prometheus data volumes, and `EXP001`-free (nothing is WAN-exposed: no public IP and no port forwards).

### 10.7 Persistence keys

idb-keyval in the default store:
- `ds:v1:index` → `{ id, name, updatedAt, nodeCount }[]`
- `ds:v1:project:{id}` → Project (canonical JSON object)
- `ds:v1:last` → last opened ID

Theme lives in `localStorage['ds:theme']`, read by an inline script in `index.html` before first paint to avoid a flash. If IDB is unavailable (private mode), an in-memory repository is used and the banner "Storage unavailable, export to keep your work" is shown.

---

## 11. Phased implementation

Each phase ends green on its acceptance command. No phase starts until the previous one passes. Each phase is one commit (or a short series), with message `phase N: <title>`.

### Phase 1 — Scaffold, domain core, runnable canvas

**Build:**
- Vite + React 19 + TS + Tailwind v4 + tokens.css + Plex fonts.
- ESLint/Prettier, Vitest projects, Playwright config.
- `domain/{types,primitives,schema,ids,clock,defaults,linkRules (ethernet + depends-on only for now),selectors,load,migrations}`, `lib/net/ipv4.ts`, `lib/determinism.ts`.
- Store slices with history (dispatch/undo/redo/applySilently/recordManual), autosave + idbRepository.
- `Canvas.tsx` with `DeviceNode`/`ServiceNode` (`NodeShell` with a Tabler `box` glyph placeholder), drag/move/delete/multi-select, snap 8, minimap, `LinkEdge` (ethernet + depends-on).
- A temporary palette of 6 hard-coded catalog items (mini-pc, router, docker-host, jellyfin, postgres, nginx-proxy-manager) in `src/catalog/index.ts`.
- Inspector with label/status only. Keyboard: undo/redo/delete/select all/Esc. Empty state.

**Acceptance:**

```bash
npm ci && npx playwright install --with-deps chromium
npm run verify      # unit: ipv4, determinism, schema, migrations, history, idbRepository; e2e: canvas-basics, theme
npm run dev         # manual: http://localhost:4747 — drag Mini PC, move, undo, reload (IndexedDB draft)
```

### Phase 2 — Backend, SQLite, server persistence

**Build:**
- `src/server/{index,app,env}.ts`, `buildApp()` returning a Fastify instance without `listen`, SPA fallback, `@fastify/static` for `dist/client`, Vite middleware mode in dev on one port.
- `src/server/db/{client,schema}.ts` + `drizzle.config.ts` + `drizzle/0000_init.sql` (DDL from §8.3), `migrate()` on boot, WAL/synchronous/foreign_keys/busy_timeout pragmas.
- Routes from §8.4 exactly: projects CRUD, `PUT /document` with `baseSeq` + `doc_hash` optimistic concurrency and 409 on mismatch, versions list/create/get/restore, duplicate, delete, autosave auto-version rule (§8.5), shares (`/api/s/:token` always public), `GET /api/health`, server-side `/analysis` and `/export/:format`.
- Auth (§8.6): loopback-only by default, bearer token mode with `timingSafeEqual`, boot refusal on unsafe bind.
- `HttpRepository` implementing `ProjectRepository`; autosave wiring with offline detection, backoff retry, `ds:token` handling; `TokenDialog` + `OfflineBanner`.
- `scripts/ensure.ts` pre-start (npm ci on lock change, client build if stale), `scripts/db-reset.ts`.
- Projects list page (`/`) and editor at `/p/:id`; share viewer at `/s/:token`.

**Acceptance:**

```bash
npm run verify        # now includes server project tests (app.inject on :memory:)
node --test --version >/dev/null 2>&1 || true
npm start             # serves SPA + API on 127.0.0.1:4747 from a fresh DB
curl -s localhost:4747/api/health | jq        # {"ok":true,...}
# API contract proofs (also covered by tests/unit/server/*.test.ts):
#  create -> get -> PUT document with wrong baseSeq => 409 -> correct seq => 200 -> versions => restore
```

### Phase 3 — Catalog, icons, design system nodes

**Build:**
- `scripts/icons/*` and running `npm run icons:fetch` (network, once). Commit `public/icons`, `icons.lock.json`, `*.generated.ts`, `THIRD_PARTY_NOTICES.md`.
- All 145 catalog items with §5.2 defaults.
- Full palette (tabs, search, virtual list, Enter-to-insert, click-to-place), `IconTile`, full node anatomy (§4.4) incl. badges and status dot, dark theme polish, Notices link, `design-lint` test.

**Acceptance:** `npm run verify`, which now includes `icons:verify`, `catalog.test.ts` (count 145), `palette.spec.ts`, `a11y.spec.ts` (empty state + palette). Manual: every palette item shows a non-placeholder icon in light and dark.

### Phase 4 — Containment, networking, all links, inspector

**Build:**
- Placement (host drop, expand/collapse, chips, re-parent, guest rules) and groups/frames/notes.
- Network nodes, subnet manager, NIC table, allocator, port/volume/env/storage/GPU/firewall/port-forward editors.
- All 8 link kinds with `canConnect`, inference, link tool 0–8, `edgeStyles`, parallel edge offset, connection-line feedback.
- Helper lines, align/distribute, clipboard, context menus, full keyboard map, command palette, shortcuts dialog.

**Acceptance:** `npm run verify` incl. `linkRules.test.ts` (every row), `clipboard.test.ts`, e2e `hosting`, `links`, `ip-assign`, `keyboard`, `palette` (Ctrl+K).

### Phase 5 — Analysis engine

**Build:**
- `analysis/*` with every rule in §6, `simulate`, SPOF, cost, exposure, usage.
- `analysisSlice` with debounce, finding markers on nodes, drawer with 4 tabs, click-to-select, fix actions (`assignNextFreeIp`, `changeHostPort`, `setTls`), simulation mode.
- `scripts/gen-perf-fixture.ts` + `perf.test.ts`.

**Acceptance:** `npm run verify` incl. all `analysis/**/*.test.ts` and `perf.test.ts` < 30 ms; e2e `analysis`, `failure-sim` (with a hand-built scenario until Phase 6 seeds exist; the spec uses `openTemplate` from Phase 6, so in Phase 4 it builds the scenario by importing `tests/fixtures/projects/failure-mini.json` via the Import dialog).

### Phase 6 — Generators and importers

**Build:**
- `generators/{compose,k8s,ipTable,mermaid,image,zip}`, `importers/compose`.
- Export dialog (tabs, preview, copy, download, download all), Import dialog (Project JSON, Compose).
- Lazy chunks and `bundle:check`.

**Acceptance:** `npm run verify` incl. generator snapshots (against `tests/fixtures/projects/minimal.json` and a `generators-fixture.json`), shuffle-invariance tests, round-trip property, `mermaid.parse`, K8s schema checks; e2e `export` (on the fixture project), `compose-import`. `bundle:check` passes ≤ 350 KB gzip for the entry chunk.

### Phase 7 — Reference designs

**Build:**
- `seeds/builder.ts`, `homelab.ts`, `k3sCicd.ts` exactly per §9.6, template buttons in the empty state and Projects dialog.
- File snapshots: `__snapshots__/vps.compose.yaml`, `lab.k8s.yaml`, `homelab.ip-plan.md`, `homelab.mmd`.
- Switch e2e `export`/`failure-sim` to `openTemplate`.

**Acceptance:**

```bash
npx vitest run src/seeds     # zero errors for both, expected warnings as listed in §9.2
npm run verify               # incl. templates.spec.ts ("0 errors" badge for both)
```

### Phase 8 — Polish and hardening

**Build:**
- `onlyRenderVisibleElements` above 150 nodes, verified with `perf.spec.ts` (manual run `npx playwright test --grep @perf`, ≥ 30 fps logged).
- Reduced-motion audit, focus order, ARIA labels on all icon buttons, `axe` on homelab + export dialog.
- A mobile `<1024px` read-only viewer with banner "Editing needs a wider screen", plus pinch/pan.
- Storage-unavailable banner, error boundary with "Export project JSON" recovery button.
- README with screenshots generated by `npm run test:visual -- --update-snapshots`.
- Firefox/WebKit pass via `npm run test:e2e:all`.

**Acceptance:** `npm run verify` and `npm run test:e2e:all` both green; `a11y.spec.ts` covers 3 screens with zero serious or critical issues.
