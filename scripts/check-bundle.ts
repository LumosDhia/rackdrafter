import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const manifestPath = join('dist/client/.vite/manifest.json');
if (!existsSync(manifestPath)) {
  console.log('bundle:check skipped (no dist/client/.vite/manifest.json)');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
  string,
  { file: string; isEntry?: boolean }
>;
const entry = Object.values(manifest).find((m) => m.isEntry);
if (!entry) {
  console.error('no entry in manifest');
  process.exit(1);
}
const buf = readFileSync(join('dist/client', entry.file));
const gzip = gzipSync(buf).length;
const budget = 500 * 1024;
console.log(`entry ${entry.file} gzip ${gzip} bytes (budget ${budget})`);
if (gzip > budget) process.exit(1);
