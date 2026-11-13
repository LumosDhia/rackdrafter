import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const lock = readFileSync(join(root, 'package-lock.json'));
const hash = createHash('sha256').update(lock).digest('hex');
const cacheDir = join(root, '.cache');
mkdirSync(cacheDir, { recursive: true });
const hashFile = join(cacheDir, 'lockhash');
const prev = existsSync(hashFile) ? readFileSync(hashFile, 'utf8') : '';
if (prev !== hash) {
  run('npm', ['ci']);
  writeFileSync(hashFile, hash);
}

function newestSync(dir: string): number {
  let max = 0;
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else max = Math.max(max, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return max;
}

const dist = join(root, 'dist/client/index.html');
const srcMtime = newestSync(join(root, 'src/client'));
const distMtime = existsSync(dist) ? statSync(dist).mtimeMs : 0;
if (srcMtime > distMtime) {
  run('npx', ['vite', 'build']);
}
