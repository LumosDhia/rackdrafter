import type {
  CatalogSlug,
  DeviceNode,
  DeviceSpec,
  FirewallPolicy,
  Project,
  ProjectSettings,
  ServiceNode,
  ServiceSpec,
} from './types.ts';
import { CURRENT_SCHEMA_VERSION } from './types.ts';
import { clock } from './clock.ts';
import { ID_PREFIX, newId } from './ids.ts';
import type { CatalogItem, DeviceCatalogItem, ServiceCatalogItem } from '../catalog/types.ts';

export function defaultSettings(): ProjectSettings {
  return {
    currency: 'EUR',
    electricityPricePerKwh: 0.2,
    averageLoadFactor: 0.25,
    amortizeMonths: 36,
    thresholds: {
      ramWarn: 0.85,
      ramError: 1.0,
      cpuInfo: 1.0,
      cpuWarn: 4.0,
      diskWarn: 0.9,
      diskError: 1.0,
      subnetWarn: 0.9,
      upsWarn: 0.8,
    },
    timezone: 'UTC',
    disabledRules: [],
    snapToGrid: true,
  };
}

export function defaultFirewall(): FirewallPolicy {
  return {
    enabled: false,
    defaultInbound: 'allow',
    rules: [],
  };
}

export function emptyProject(name = 'Untitled'): Project {
  const now = clock.nowIso();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(ID_PREFIX.project),
    name,
    description: '',
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

function hostnameFromLabel(label: string): string {
  const raw = label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 63);
  const s = raw === '' ? 'host' : raw;
  return /^[0-9]/.test(s) ? `h-${s}` : s;
}

export function newDeviceFromCatalog(item: DeviceCatalogItem, pos: { x: number; y: number }): DeviceNode {
  const d = item.defaults;
  const spec: DeviceSpec = {
    role: d.role,
    formFactor: d.formFactor,
    hostname: d.hostname || hostnameFromLabel(item.name),
    fqdn: d.fqdn,
    vendor: d.vendor,
    model: d.model,
    os: d.os,
    cpu: { ...d.cpu },
    ramMb: d.ramMb,
    reservedRamMb: d.reservedRamMb,
    storage: d.storage.map((s) => ({ ...s, id: newId(ID_PREFIX.storage) })),
    gpus: d.gpus.map((g) => ({ ...g, id: newId(ID_PREFIX.gpu) })),
    gpuPassthrough: [...d.gpuPassthrough],
    nics: d.nics.map((n) => ({ ...n, id: newId(ID_PREFIX.nic) })),
    power: { ...d.power },
    cost: { ...d.cost },
    rackUnits: d.rackUnits,
    firewall: { ...d.firewall, rules: d.firewall.rules.map((r) => ({ ...r, ports: { ...r.ports } })) },
    advertisedRoutes: [...d.advertisedRoutes],
    portForwards: d.portForwards.map((f) => ({ ...f, id: newId(ID_PREFIX.forward) })),
  };
  return {
    id: newId(ID_PREFIX.node),
    kind: 'device',
    label: item.name,
    position: { ...pos },
    size: null,
    groupId: null,
    status: 'planned',
    notes: '',
    tags: [],
    locked: false,
    catalogSlug: item.slug,
    spec,
    placement: item.guest
      ? { kind: 'guest', hostId: '', guestType: item.guest, guestId: null }
      : { kind: 'physical' },
    expanded: false,
  };
}

export function newServiceFromCatalog(item: ServiceCatalogItem, pos: { x: number; y: number }): ServiceNode {
  const d = item.defaults;
  const spec: ServiceSpec = {
    runtime: d.runtime,
    image: d.image,
    containerName: d.containerName,
    command: d.command ? [...d.command] : null,
    category: d.category,
    officialUrl: d.officialUrl,
    iconSlug: d.iconSlug,
    ports: d.ports.map((p) => ({ ...p, id: newId(ID_PREFIX.port) })),
    env: d.env.map((e) => ({ ...e, id: newId(ID_PREFIX.env) })),
    volumes: d.volumes.map((v) => ({ ...v, id: newId(ID_PREFIX.volume), storageRef: null })),
    networks: [...d.networks],
    healthcheck: d.healthcheck ? { ...d.healthcheck, test: [...d.healthcheck.test] } : null,
    resources: { ...d.resources, gpuApis: [...d.resources.gpuApis] },
    restart: d.restart,
    user: d.user,
    labels: { ...d.labels },
    capabilities: [...d.capabilities],
    adminUi: d.adminUi,
  };
  return {
    id: newId(ID_PREFIX.node),
    kind: 'service',
    label: item.name,
    position: { ...pos },
    size: null,
    groupId: null,
    status: 'planned',
    notes: '',
    tags: [],
    locked: false,
    catalogSlug: item.slug as CatalogSlug,
    spec,
    placement: { kind: 'standalone' },
  };
}

export function newNodeFromCatalog(
  item: CatalogItem,
  pos: { x: number; y: number },
): DeviceNode | ServiceNode {
  return item.kind === 'device' ? newDeviceFromCatalog(item, pos) : newServiceFromCatalog(item, pos);
}
