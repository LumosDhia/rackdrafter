import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { schema } from './schema.ts';

type SqliteDb = InstanceType<typeof Database>;
export type Db = BetterSQLite3Database<typeof schema> & { sqlite: SqliteDb };

export function openDatabase(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
  migrate(db, { migrationsFolder });
  return Object.assign(db, { sqlite }) as Db;
}

export function closeDatabase(db: Db): void {
  db.sqlite.close();
}
