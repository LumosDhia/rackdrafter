import type {
  CatalogSlug,
  DeviceSpec,
  Gpu,
  NetworkInterface,
  PortMapping,
  ServiceSpec,
  StorageDevice,
  EnvVar,
  VolumeMount,
} from '../domain/types.ts';

export interface IconRef {
  slug: string;
  prefer: 'brand' | 'glyph';
  glyph: string;
  aliases?: Partial<Record<IconSource, string>>;
}

export type IconSource = 'dashboard-icons' | 'selfhst' | 'simple-icons' | 'tabler';

/** Host capability an item needs before it can run well. */
export type CatalogRequirement = 'gpu' | 'nvenc' | 'qsv' | 'hypervisor' | 'linux';

export interface CatalogItemBase {
  slug: CatalogSlug;
  name: string;
  category: string;
  tags: string[];
  description: string;
  icon: IconRef;
  officialUrl: string;
  requires?: CatalogRequirement[];
}

export interface DeviceCatalogItem extends CatalogItemBase {
  kind: 'device';
  guest?: 'lxc' | 'vm';
  defaults: Omit<DeviceSpec, 'nics' | 'storage' | 'gpus'> & {
    nics: Omit<NetworkInterface, 'id'>[];
    storage: Omit<StorageDevice, 'id'>[];
    gpus: Omit<Gpu, 'id'>[];
  };
}

export interface ServiceCatalogItem extends CatalogItemBase {
  kind: 'service';
  imageMatchers: RegExp[];
  defaults: Omit<ServiceSpec, 'ports' | 'env' | 'volumes' | 'networks'> & {
    ports: Omit<PortMapping, 'id'>[];
    env: Omit<EnvVar, 'id'>[];
    volumes: Omit<VolumeMount, 'id' | 'storageRef'>[];
    networks: ServiceSpec['networks'];
  };
  defaultWorkload: 'deployment' | 'statefulset' | 'daemonset';
}

export type CatalogItem = DeviceCatalogItem | ServiceCatalogItem;

export function defineDevice(item: DeviceCatalogItem): DeviceCatalogItem {
  return item;
}

export function defineService(item: ServiceCatalogItem): ServiceCatalogItem {
  return item;
}
