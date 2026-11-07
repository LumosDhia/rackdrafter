import type { CatalogItem, DeviceCatalogItem, ServiceCatalogItem } from './types.ts';
import * as devices from './data/devices/index.ts';
import * as services from './data/services/index.ts';

const DEVICE_CATEGORY_ORDER = [
  'compute',
  'virtual',
  'cloud',
  'network',
  'storage',
  'power',
  'clients',
] as const;

const SERVICE_CATEGORY_ORDER = [
  'media',
  'downloads',
  'files',
  'data',
  'networking',
  'security',
  'monitoring',
  'dashboards',
  'devops',
  'k8s',
  'platform',
  'home',
  'apps',
  'backup',
  'gaming',
  'ai',
  'custom',
] as const;

function rank(order: readonly string[], value: string): number {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

const deviceList: DeviceCatalogItem[] = [
  ...devices.compute,
  ...devices.virtual,
  ...devices.cloud,
  ...devices.network,
  ...devices.storage,
  ...devices.power,
  ...devices.clients,
];

const serviceList: ServiceCatalogItem[] = [
  ...services.media,
  ...services.downloads,
  ...services.files,
  ...services.data,
  ...services.networking,
  ...services.security,
  ...services.monitoring,
  ...services.dashboards,
  ...services.devops,
  ...services.k8s,
  ...services.platform,
  ...services.home,
  ...services.apps,
  ...services.backup,
  ...services.gaming,
  ...services.ai,
  ...services.custom,
];

function byName(a: CatalogItem, b: CatalogItem): number {
  return a.name.localeCompare(b.name, 'en');
}

deviceList.sort((a, b) => {
  const r = rank(DEVICE_CATEGORY_ORDER, a.category) - rank(DEVICE_CATEGORY_ORDER, b.category);
  return r !== 0 ? r : byName(a, b);
});

serviceList.sort((a, b) => {
  const r = rank(SERVICE_CATEGORY_ORDER, a.category) - rank(SERVICE_CATEGORY_ORDER, b.category);
  return r !== 0 ? r : byName(a, b);
});

export const DEVICES: readonly DeviceCatalogItem[] = deviceList;
export const SERVICES: readonly ServiceCatalogItem[] = serviceList;

export const CATALOG: readonly CatalogItem[] = [...DEVICES, ...SERVICES];

export const catalogBySlug: ReadonlyMap<string, CatalogItem> = new Map(CATALOG.map((i) => [i.slug, i]));

export function getCatalogItem(slug: string): CatalogItem | undefined {
  return catalogBySlug.get(slug);
}

/** Catalog slugs used by the icon pipeline and `icons:verify`. */
export function catalogIconRefs(): readonly {
  slug: string;
  iconSlug: string;
  prefer: 'brand' | 'glyph';
  glyph: string;
  aliases?: Partial<Record<string, string>>;
  kind: 'device' | 'service';
  category: string;
}[] {
  return CATALOG.map((item) => ({
    slug: item.slug,
    iconSlug: item.icon.slug,
    prefer: item.icon.prefer,
    glyph: item.icon.glyph,
    ...(item.icon.aliases ? { aliases: item.icon.aliases } : {}),
    kind: item.kind,
    category: item.category,
  }));
}

/** Distinct Tabler glyph names referenced by the catalog. */
export function catalogGlyphs(): string[] {
  return [...new Set(CATALOG.map((i) => i.icon.glyph))].sort();
}

/** Category groupings in display order, empty groups removed. */
export function groupedCatalog(): { kind: 'device' | 'service'; category: string; items: CatalogItem[] }[] {
  const out: { kind: 'device' | 'service'; category: string; items: CatalogItem[] }[] = [];
  for (const item of CATALOG) {
    const last = out.at(-1);
    if (last && last.kind === item.kind && last.category === item.category) last.items.push(item);
    else out.push({ kind: item.kind, category: item.category, items: [item] });
  }
  return out;
}

function haystack(item: CatalogItem): string {
  return [item.name, item.slug, item.category, item.description, ...item.tags].join(' ').toLowerCase();
}

const HAYSTACK = new Map(CATALOG.map((i) => [i.slug, haystack(i)]));

export function searchCatalog(query: string): CatalogItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...CATALOG];
  return CATALOG.filter((item) => {
    const hay = HAYSTACK.get(item.slug) ?? '';
    return terms.every((t) => hay.includes(t));
  });
}

/** Every image repository that an importer can map back to a catalog item. */
export function matchByImage(image: string): ServiceCatalogItem | undefined {
  return serviceList.find((item) => item.imageMatchers.some((re) => re.test(image)));
}

export type { CatalogItem, DeviceCatalogItem, ServiceCatalogItem };
