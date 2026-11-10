import { eq } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { meta } from '../schema.ts';

export function getMeta(db: Db, key: string): string | undefined {
  const row = db.select().from(meta).where(eq(meta.key, key)).get();
  return row?.value;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run();
}
