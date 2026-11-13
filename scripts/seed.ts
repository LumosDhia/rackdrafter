import { loadEnv } from '../src/server/env.ts';
import { closeDatabase, openDatabase } from '../src/server/db/client.ts';
import { seedIfNeeded } from '../src/server/seed.ts';
import { getMeta, setMeta } from '../src/server/db/repo/meta.ts';

const env = loadEnv();
const db = openDatabase(env.RACKDRAFTER_DB);
if (getMeta(db, 'seeded_at')) {
  setMeta(db, 'seeded_at', '');
}
seedIfNeeded(db);
closeDatabase(db);
console.log('seed complete');
