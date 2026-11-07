import type { CatalogItem } from './types.ts';

/**
 * Category colour is used at low opacity behind the node icon tile and as the
 * edge/legend tint. One hue per category keeps a 145-item palette readable
 * without introducing per-item artwork.
 */
const CATEGORY_HUE: Record<string, number> = {
  // devices
  compute: 212,
  virtual: 265,
  cloud: 199,
  network: 158,
  storage: 32,
  power: 42,
  clients: 330,
  // services
  media: 330,
  downloads: 199,
  files: 32,
  data: 265,
  monitoring: 212,
  dashboards: 275,
  devops: 30,
  k8s: 212,
  platform: 199,
  home: 158,
  apps: 265,
  backup: 42,
  gaming: 330,
  ai: 280,
  security: 0,
  custom: 30,
  networking: 158,
};

const CATEGORY_LABEL: Record<string, string> = {
  compute: 'Compute',
  virtual: 'Virtualisation',
  cloud: 'Cloud',
  network: 'Network hardware',
  storage: 'Storage',
  power: 'Power',
  clients: 'Clients',
  media: 'Media',
  downloads: 'Downloads',
  files: 'Files',
  data: 'Data',
  networking: 'Networking',
  monitoring: 'Monitoring',
  dashboards: 'Dashboards',
  devops: 'DevOps',
  k8s: 'Kubernetes',
  platform: 'Platform',
  home: 'Home automation',
  apps: 'Apps',
  backup: 'Backup',
  gaming: 'Gaming',
  security: 'Security',
  ai: 'AI',
  custom: 'Custom',
};

export function categoryHue(item: Pick<CatalogItem, 'category'>): number {
  return CATEGORY_HUE[item.category] ?? 30;
}

export function categoryLabel(item: Pick<CatalogItem, 'category'>): string {
  return CATEGORY_LABEL[item.category] ?? item.category;
}

/** 12% tint for tiles and chips. */
export function categoryTint(item: Pick<CatalogItem, 'category'>, alpha = 0.12): string {
  return `hsl(${categoryHue(item)} 62% 46% / ${alpha})`;
}

/** Stronger tint for selected/active states. */
export function categoryTintStrong(item: Pick<CatalogItem, 'category'>): string {
  return `hsl(${categoryHue(item)} 62% 46% / 0.2)`;
}

/** Human label for a kind, used in the palette tabs and the inspector. */
export function kindLabel(kind: CatalogItem['kind']): string {
  return kind === 'device' ? 'Device' : 'Service';
}

/** Short, fixed badge text for the node card. */
export function itemBadge(item: CatalogItem): string {
  if (item.kind === 'device') return item.defaults.role.replace(/-/g, ' ');
  return item.defaults.runtime;
}
