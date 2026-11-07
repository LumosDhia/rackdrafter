import { defaultFirewall } from '../domain/defaults.ts';
import type {
  DeviceRole,
  FormFactor,
  GpuApi,
  NetworkInterface,
  PortMapping,
  ServiceCapability,
  ServiceCategory,
  StorageDevice,
  Gpu,
} from '../domain/types.ts';
import type {
  CatalogRequirement,
  DeviceCatalogItem,
  IconRef,
  IconSource,
  ServiceCatalogItem,
} from './types.ts';
import { defineDevice, defineService } from './types.ts';

/** Category defaults, PLAN.md §5.2: [cpu millicores, RAM MB]. */
export const CATEGORY_DEFAULTS: Record<ServiceCategory, readonly [number, number]> = {
  media: [500, 512],
  downloads: [250, 256],
  networking: [100, 64],
  monitoring: [100, 128],
  dashboards: [100, 256],
  data: [250, 256],
  files: [250, 256],
  apps: [100, 256],
  devops: [250, 512],
  k8s: [100, 128],
  home: [250, 512],
  gaming: [1000, 2048],
  backup: [250, 256],
  platform: [250, 512],
  security: [100, 256],
  ai: [2000, 8192],
  custom: [100, 128],
};

/** Fallback Tabler glyph per service category, PLAN.md §5.3. */
export const CATEGORY_GLYPH: Record<ServiceCategory, string> = {
  media: 'movie',
  downloads: 'download',
  networking: 'arrows-exchange',
  monitoring: 'chart-line',
  dashboards: 'layout-dashboard',
  data: 'database',
  files: 'folders',
  apps: 'apps',
  devops: 'git-branch',
  k8s: 'hexagons',
  home: 'home',
  gaming: 'device-gamepad-2',
  backup: 'archive',
  platform: 'server-cog',
  security: 'shield-lock',
  ai: 'brain',
  custom: 'box',
};

export const DEVICE_CATEGORIES = [
  'compute',
  'virtual',
  'cloud',
  'network',
  'storage',
  'power',
  'clients',
] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

// ---------------------------------------------------------------- devices

type NicSpec = number | { name?: string; kind?: NetworkInterface['kind']; speed?: number; wan?: boolean };

export interface DeviceInput {
  slug: string;
  name: string;
  cat: DeviceCategory;
  desc: string;
  url: string;
  glyph: string;
  /** Brand icon slug when the plan prefers a logo for this device. */
  brand?: string;
  iconAliases?: Partial<Record<IconSource, string>>;
  tags?: string[];
  role: DeviceRole;
  ff: FormFactor;
  guest?: 'lxc' | 'vm';
  os?: string | null;
  vendor?: string | null;
  cpu?: { model?: string; cores: number; threads?: number; arch?: 'x86_64' | 'arm64' | 'armv7' | 'other' };
  ramGb?: number;
  reservedRamMb?: number;
  disks?: [StorageDevice['kind'], number][];
  gpus?: Omit<Gpu, 'id'>[];
  /** NIC speeds in Mbit/s, or detailed specs. */
  nics?: NicSpec[];
  power?: [idleW: number, maxW: number];
  ups?: [capacityW: number, batteryWh: number];
  price?: number | null;
  monthly?: number | null;
  ru?: number;
  firewall?: boolean;
  requires?: CatalogRequirement[];
}

function nic(spec: NicSpec, i: number): Omit<NetworkInterface, 'id'> {
  const o = typeof spec === 'number' ? { speed: spec } : spec;
  const kind = o.kind ?? 'ethernet';
  return {
    name: o.name ?? (kind === 'wifi' ? `wlan${i}` : `eth${i}`),
    kind,
    subnetId: null,
    ip: null,
    dhcp: true,
    reserved: false,
    mac: null,
    vlan: null,
    speedMbps: o.speed ?? 1000,
    primary: i === 0,
    publicIp: o.wan ?? false,
  };
}

export function device(i: DeviceInput): DeviceCatalogItem {
  const cores = i.cpu?.cores ?? 0;
  const icon: IconRef = {
    slug: i.brand ?? i.slug,
    prefer: i.brand ? 'brand' : 'glyph',
    glyph: i.glyph,
    ...(i.iconAliases ? { aliases: i.iconAliases } : {}),
  };
  return defineDevice({
    kind: 'device',
    slug: i.slug,
    name: i.name,
    category: i.cat,
    tags: i.tags ?? [],
    description: i.desc,
    icon,
    officialUrl: i.url,
    ...(i.guest ? { guest: i.guest } : {}),
    ...(i.requires ? { requires: i.requires } : {}),
    defaults: {
      role: i.role,
      formFactor: i.ff,
      hostname: '',
      fqdn: null,
      vendor: i.vendor ?? null,
      model: null,
      os: i.os ?? null,
      cpu: {
        model: i.cpu?.model ?? null,
        cores,
        threads: i.cpu?.threads ?? cores,
        arch: i.cpu?.arch ?? 'x86_64',
      },
      ramMb: Math.round((i.ramGb ?? 0) * 1024),
      reservedRamMb: i.reservedRamMb ?? (i.ramGb && i.ramGb >= 2 ? 512 : 0),
      storage: (i.disks ?? []).map(([kind, capacityGb], n) => ({
        label: kind === 'hdd' || kind === 'usb-hdd' ? `disk${n}` : n === 0 ? 'boot' : `disk${n}`,
        kind,
        capacityGb,
        mountPath: null,
        external: kind === 'usb-ssd' || kind === 'usb-hdd',
        backing: null,
      })),
      gpus: i.gpus ?? [],
      gpuPassthrough: [],
      nics: (i.nics ?? [1000]).map(nic),
      power: {
        idleW: i.power?.[0] ?? 0,
        maxW: i.power?.[1] ?? 0,
        upsCapacityW: i.ups?.[0] ?? null,
        upsBatteryWh: i.ups?.[1] ?? null,
      },
      cost: { purchase: i.price ?? null, monthly: i.monthly ?? null, amortizeMonths: null },
      rackUnits: i.ru ?? 0,
      firewall: i.firewall
        ? { ...defaultFirewall(), enabled: true, defaultInbound: 'deny' }
        : defaultFirewall(),
      advertisedRoutes: [],
      portForwards: [],
    },
  });
}

// --------------------------------------------------------------- services

/** [name, containerPort, hostPort (default = container, null = unpublished), proto, appProtocol] */
export type PortTuple = [
  name: string,
  container: number,
  host?: number | null,
  proto?: 'tcp' | 'udp',
  app?: PortMapping['appProtocol'],
];
/** [name, target, class, sizeGb, backup] */
export type VolTuple = [
  name: string,
  target: string,
  cls: 'config' | 'data' | 'database' | 'media' | 'cache' | 'tmp',
  sizeGb: number,
  backup?: 'required' | 'optional' | 'none',
];
/** [key, value, secret] */
export type EnvTuple = [key: string, value: string, secret?: boolean];

export interface ServiceInput {
  slug: string;
  name: string;
  cat: ServiceCategory;
  desc: string;
  url: string;
  image?: string | null;
  runtime?: 'docker' | 'systemd' | 'lxc-native' | 'k8s' | 'external';
  tags?: string[];
  icon?: {
    prefer?: 'brand' | 'glyph';
    glyph?: string;
    slug?: string;
    aliases?: Partial<Record<IconSource, string>>;
  };
  /** Extra image repositories (without registry or tag) that import should map to this item. */
  match?: string[];
  ports?: PortTuple[];
  vols?: VolTuple[];
  env?: EnvTuple[];
  cpu?: number;
  ram?: number;
  gpu?: 'none' | 'optional' | 'required';
  gpuApis?: GpuApi[];
  caps?: ServiceCapability[];
  admin?: boolean;
  workload?: 'deployment' | 'statefulset' | 'daemonset';
  requires?: CatalogRequirement[];
  command?: string[];
  user?: string;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Strip registry host and tag from an image reference. */
export function imageRepo(image: string): string {
  const noTag = image.replace(/@sha256:.*$/, '').replace(/:[^/:]+$/, '');
  const parts = noTag.split('/');
  const first = parts[0] ?? '';
  if (parts.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost')) {
    return parts.slice(1).join('/');
  }
  return noTag;
}

export function matcherFor(repo: string): RegExp {
  return new RegExp(`^(?:[a-z0-9.-]+(?::\\d+)?/)?${escapeRe(repo)}(?::|@|$)`);
}

export function service(i: ServiceInput): ServiceCatalogItem {
  const runtime = i.runtime ?? 'docker';
  const [dCpu, dRam] = CATEGORY_DEFAULTS[i.cat];
  const repos = [...(i.image ? [imageRepo(i.image)] : []), ...(i.match ?? [])];
  const glyph = i.icon?.glyph ?? CATEGORY_GLYPH[i.cat];
  const aliases = i.icon?.aliases;
  return defineService({
    kind: 'service',
    slug: i.slug,
    name: i.name,
    category: i.cat,
    tags: i.tags ?? [],
    description: i.desc,
    icon: {
      slug: i.icon?.slug ?? i.slug,
      prefer: i.icon?.prefer ?? 'brand',
      glyph,
      ...(aliases ? { aliases } : {}),
    },
    officialUrl: i.url,
    ...(i.requires ? { requires: i.requires } : {}),
    imageMatchers: repos.map(matcherFor),
    defaultWorkload: i.workload ?? (i.cat === 'data' ? 'statefulset' : 'deployment'),
    defaults: {
      runtime,
      image: i.image ?? null,
      containerName: runtime === 'docker' ? i.slug : null,
      command: i.command ?? null,
      category: i.cat,
      officialUrl: i.url,
      iconSlug: i.icon?.slug ?? i.slug,
      ports: (i.ports ?? []).map(([name, containerPort, host, proto, app]) => ({
        name,
        containerPort,
        hostPort: host === undefined ? containerPort : host,
        proto: proto ?? 'tcp',
        bindIp: null,
        appProtocol: app ?? (proto === 'udp' ? 'udp' : 'http'),
      })),
      env: (i.env ?? []).map(([key, value, secret]) => ({ key, value, secret: secret ?? false })),
      volumes: (i.vols ?? []).map(([name, target, cls, sizeGb, backup]) => ({
        name,
        kind: 'bind' as const,
        source: `./${i.slug}/${name}`,
        target,
        readOnly: false,
        sizeGb,
        class: cls,
        backup: backup ?? (cls === 'cache' || cls === 'tmp' || cls === 'media' ? 'none' : 'required'),
      })),
      networks: [],
      healthcheck: null,
      resources: {
        cpuMillicores: i.cpu ?? dCpu,
        ramMb: i.ram ?? dRam,
        ramLimitMb: null,
        gpu: i.gpu ?? 'none',
        gpuApis: i.gpuApis ?? [],
      },
      restart: 'unless-stopped',
      user: i.user ?? null,
      labels: {},
      capabilities: i.caps ?? [],
      adminUi: i.admin ?? false,
    },
  });
}
