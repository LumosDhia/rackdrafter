/**
 * Offline verification for the bundled icon set. Fails when:
 *  - `icons.lock.json` or the generated manifest are missing or disagree,
 *  - a recorded brand icon file is missing or its SHA-256 changed,
 *  - a catalog item has neither a brand file nor a Tabler glyph,
 *  - a glyph the catalog references is absent from the generated glyph module.
 *
 * Runs with `npm run icons:verify` and inside `npm run verify`. No network.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogGlyphs, catalogIconRefs } from '../../src/shared/catalog/index.ts';
import { TABLER_GLYPHS } from '../../src/client/ui/glyphs.generated.ts';

const ROOT = process.cwd();
const LOCK = join(ROOT, 'icons.lock.json');
const MANIFEST = join(ROOT, 'public/icons/manifest.json');

interface LockEntry {
  pack: string;
  file: string;
  lightFile?: string;
  license: string;
  source: string;
  sha256: string;
  multicolour: boolean;
}
interface Lock {
  version: number;
  entries: Record<string, LockEntry>;
  missing: string[];
}

const errors: string[] = [];
const warnings: string[] = [];

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (!existsSync(LOCK)) errors.push('icons.lock.json is missing — run `npm run icons:fetch`');
if (!existsSync(MANIFEST)) errors.push('public/icons/manifest.json is missing — run `npm run icons:fetch`');

let lock: Lock = { version: 0, entries: {}, missing: [] };
if (existsSync(LOCK)) {
  lock = JSON.parse(readFileSync(LOCK, 'utf8')) as Lock;
  if (lock.version !== 1) errors.push(`icons.lock.json has unsupported version ${lock.version}`);
}

for (const [slug, entry] of Object.entries(lock.entries)) {
  const file = join(ROOT, 'public', entry.file);
  if (!existsSync(file)) {
    errors.push(`${slug}: missing file public/${entry.file}`);
    continue;
  }
  const actual = sha256(file);
  if (actual !== entry.sha256) errors.push(`${slug}: sha256 mismatch for public/${entry.file}`);
  if (entry.lightFile) {
    const light = join(ROOT, 'public', entry.lightFile);
    if (!existsSync(light)) errors.push(`${slug}: missing light variant public/${entry.lightFile}`);
  }
  if (!entry.license || entry.license === 'unknown') warnings.push(`${slug}: no licence recorded`);
  if (!entry.source.startsWith('https://')) warnings.push(`${slug}: source is not an absolute https url`);
}

if (existsSync(MANIFEST)) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { entries: Record<string, LockEntry> };
  for (const [slug, entry] of Object.entries(manifest.entries)) {
    const locked = lock.entries[slug];
    if (!locked) errors.push(`${slug}: in manifest but not in lock`);
    else if (locked.sha256 !== entry.sha256) errors.push(`${slug}: manifest hash differs from lock`);
  }
}

const refs = catalogIconRefs();
let brandCount = 0;
for (const item of refs) {
  const brand = lock.entries[item.slug];
  const glyph = TABLER_GLYPHS[item.glyph];
  if (brand) brandCount += 1;
  if (!brand && !glyph) errors.push(`${item.slug}: no brand icon and glyph "${item.glyph}" is unavailable`);
}

for (const glyph of catalogGlyphs()) {
  if (!TABLER_GLYPHS[glyph]) errors.push(`catalog glyph "${glyph}" missing from glyphs.generated.ts`);
}

if (brandCount === 0) errors.push('no brand icons recorded — the icon fetch did not run');

console.log(
  `icons:verify — ${refs.length} catalog entries, ${brandCount} brand logos, ${
    refs.length - brandCount
  } glyphs, ${catalogGlyphs().length} distinct glyphs`,
);

for (const w of warnings) console.warn(`warn: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
console.log('icons:verify ok');
