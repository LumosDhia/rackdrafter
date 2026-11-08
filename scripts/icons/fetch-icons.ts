import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { catalogIconRefs } from '../../src/shared/catalog/index.ts';
import { isMulticolour, normalizeSvg, UnsafeSvgError } from './normalize.ts';
import { buildNotices } from './notices.ts';
import type {
  IconManifest,
  IconManifestEntry as ManifestEntry,
} from '../../src/shared/catalog/iconManifest.ts';

export interface PackSource {
  repo: string;
  ref: string;
  dir: string;
  license: string;
  url: string;
  homepage: string;
  attribution: string;
}

export interface Sources {
  packs: Record<string, PackSource>;
  order: string[];
  glyphPack: { name: string; license: string; version: string; homepage: string; attribution: string };
}

export interface ManifestEntry {
  pack: string;
  /** Path relative to `public/`, e.g. `icons/dashboard-icons/jellyfin.svg`. */
  file: string;
  /** Variant designed for dark backgrounds, if upstream ships one. */
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
  glyphPack: Sources['glyphPack'];
  entries: Record<string, ManifestEntry>;
  /** Catalog slugs with no upstream logo; the UI renders the Tabler glyph instead. */
  missing: string[];
}

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, '.cache/icons');
const OUT_DIR = join(ROOT, 'public/icons');
const LOCK_PATH = join(ROOT, 'icons.lock.json');

export const SOURCES: Sources = JSON.parse(
  readFileSync(join(ROOT, 'scripts/icons/sources.json'), 'utf8'),
) as Sources;

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const CHECK = args.has('--check');

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function cachePath(pack: string, name: string): string {
  return join(CACHE_DIR, pack, `${name}.svg`);
}

async function fetchSvg(url: string, timeoutMs = 15000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'rackdrafter icon fetcher (+https://github.com/homarr-labs/dashboard-icons)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim().startsWith('<svg') ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCommit(repo: string, ref: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${ref}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'rackdrafter-icon-fetcher' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: string };
    return typeof body.sha === 'string' ? body.sha : null;
  } catch {
    return null;
  }
}

/** Sequential-with-concurrency helper. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}

interface Job {
  slug: string;
  pack: string;
  name: string;
  url: string;
}

function candidates(): Job[] {
  const jobs: Job[] = [];
  for (const item of catalogIconRefs()) {
    const aliases = (item.aliases ?? {}) as Record<string, string>;
    if (item.prefer === 'glyph' && Object.keys(aliases).length === 0) continue;
    for (const pack of SOURCES.order) {
      const name = aliases[pack] ?? item.iconSlug ?? item.slug;
      const src = SOURCES.packs[pack];
      if (!src) continue;
      const url = src.url.replace('{ref}', src.ref).replace('{dir}', src.dir).replace('{name}', name);
      jobs.push({ slug: item.slug, pack, name, url });
    }
  }
  return jobs;
}

async function readCached(job: Job): Promise<string | null> {
  const p = cachePath(job.pack, job.name);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

async function ensureCached(job: Job): Promise<string | null> {
  const cached = await readCached(job);
  if (cached) return cached;
  if (OFFLINE) return null;
  const raw = await fetchSvg(job.url);
  if (!raw) return null;
  const p = cachePath(job.pack, job.name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, raw);
  return raw;
}

async function main(): Promise<void> {
  if (!CHECK) rmSync(OUT_DIR, { recursive: true, force: true });
  const entries: Record<string, ManifestEntry> = {};
  const missing: string[] = [];
  const jobs = candidates();
  const used = new Set<string>();

  const raws = await mapLimit(jobs, 8, ensureCached);

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i] as Job;
    if (entries[job.slug]) continue;
    const raw = raws[i];
    if (!raw) continue;
    let svg: string;
    try {
      svg = normalizeSvg(raw);
    } catch (err) {
      if (err instanceof UnsafeSvgError) console.warn(`skip ${job.pack}/${job.name}: ${err.message}`);
      else console.warn(`skip ${job.pack}/${job.name}: ${(err as Error).message}`);
      continue;
    }
    const rel = `icons/${job.pack}/${job.slug}.svg`;
    const file = join(ROOT, 'public', rel);
    if (!CHECK) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, svg);
    }
    used.add(job.pack);
    const entry: ManifestEntry = {
      pack: job.pack,
      file: rel,
      license: SOURCES.packs[job.pack]?.license ?? 'unknown',
      source: job.url,
      sha256: sha256(svg),
      multicolour: isMulticolour(svg),
    };

    if (entry.multicolour && job.pack !== 'simple-icons') {
      const lightJob: Job = { ...job, name: `${job.name}-light` };
      const lightRaw = await ensureCached(lightJob);
      if (lightRaw) {
        try {
          const lightSvg = normalizeSvg(lightRaw);
          const lightRel = `icons/${job.pack}/${job.slug}-light.svg`;
          if (!CHECK) writeFileSync(join(ROOT, 'public', lightRel), lightSvg);
          entry.lightFile = lightRel;
        } catch {
          rmSync(cachePath(lightJob.pack, lightJob.name), { force: true });
        }
      }
    }
    entries[job.slug] = entry;
  }

  for (const item of catalogIconRefs()) {
    if (!entries[item.slug]) missing.push(item.slug);
  }

  const packs: IconManifest['packs'] = {};
  for (const pack of used) {
    const src = SOURCES.packs[pack];
    if (!src) continue;
    const resolved = OFFLINE || CHECK ? null : await resolveCommit(src.repo, src.ref);
    packs[pack] = { license: src.license, homepage: src.homepage, resolvedCommit: resolved };
  }

  const manifest: IconManifest = {
    generatedAt: CHECK ? readGeneratedAt() : new Date().toISOString(),
    order: SOURCES.order,
    packs,
    glyphPack: SOURCES.glyphPack,
    entries,
    missing,
  };

  if (!CHECK) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(LOCK_PATH, `${JSON.stringify({ version: 1, entries, missing }, null, 2)}\n`);
    const ts = renderManifestModule(manifest);
    writeFileSync(join(ROOT, 'src/client/ui/icon-manifest.generated.ts'), ts);
    const notices = buildNotices(manifest);
    writeFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), notices);
    mkdirSync(join(ROOT, 'public'), { recursive: true });
    writeFileSync(join(ROOT, 'public/THIRD_PARTY_NOTICES.md'), notices);
  }

  const brands = Object.keys(entries).length;
  console.log(
    `icons:fetch ${CHECK ? 'check' : 'done'} — ${brands} brand files, ${missing.length} glyph-only, ${jobs.length} candidates`,
  );
  if (missing.length <= 25 && missing.length > 0) console.log(`glyph-only: ${missing.join(', ')}`);
  else if (missing.length > 0)
    console.log(`glyph-only: ${missing.slice(0, 25).join(', ')} … (+${missing.length - 25})`);
}

function readGeneratedAt(): string {
  try {
    const prev = JSON.parse(readFileSync(join(OUT_DIR, 'manifest.json'), 'utf8')) as IconManifest;
    return prev.generatedAt;
  } catch {
    return '';
  }
}

function renderManifestModule(manifest: IconManifest): string {
  const body = JSON.stringify(manifest, null, 2);
  return `// GENERATED by scripts/icons/fetch-icons.ts — do not edit by hand.\nimport type { IconManifest } from '#shared/catalog/iconManifest.ts';\n\nexport const ICON_MANIFEST = ${body} as unknown as IconManifest;\n`;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
