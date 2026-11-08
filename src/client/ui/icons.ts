import { ICON_MANIFEST } from './icon-manifest.generated.ts';
import type { IconManifestEntry } from '#shared/catalog/iconManifest.ts';

/** Brand artwork for a catalog slug, or undefined when the item uses a Tabler glyph. */
export function brandIcon(slug: string): IconManifestEntry | undefined {
  return ICON_MANIFEST.entries[slug];
}

export function brandIconUrl(entry: IconManifestEntry): string {
  return `/${entry.file}`;
}

export function brandIconLightUrl(entry: IconManifestEntry): string | null {
  return entry.lightFile ? `/${entry.lightFile}` : null;
}

export function manifestSummary(): { brands: number; glyphOnly: number; packs: string[] } {
  return {
    brands: Object.keys(ICON_MANIFEST.entries).length,
    glyphOnly: ICON_MANIFEST.missing.length,
    packs: ICON_MANIFEST.order.filter((p) => ICON_MANIFEST.packs[p] !== undefined),
  };
}

export { ICON_MANIFEST };
