/**
 * Shape of `public/icons/manifest.json` and the generated client copy.
 * Written by `scripts/icons/fetch-icons.ts`; consumed by the client icon tile.
 */
export interface IconManifestEntry {
  pack: string;
  /** Path relative to `public/`, e.g. `icons/dashboard-icons/jellyfin.svg`. */
  file: string;
  /** Variant designed for dark backgrounds, when upstream ships one. */
  lightFile?: string;
  license: string;
  source: string;
  sha256: string;
  multicolour: boolean;
}

export interface IconManifest {
  generatedAt: string;
  order: string[];
  packs: Record<string, { license: string; homepage: string; resolvedCommit: string | null }>;
  glyphPack: { name: string; license: string; version: string; homepage: string; attribution: string };
  entries: Record<string, IconManifestEntry>;
  /** Catalog slugs with no upstream logo; the UI renders the Tabler glyph instead. */
  missing: string[];
}
