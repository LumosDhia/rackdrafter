import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.argv.includes('--yes')) {
  console.error('Pass --yes to delete the database file.');
  process.exit(1);
}

const db = resolve(process.env.RACKDRAFTER_DB ?? './data/rackdrafter.db');
for (const p of [db, `${db}-wal`, `${db}-shm`]) {
  if (existsSync(p)) unlinkSync(p);
}
console.log(`deleted ${db}`);
