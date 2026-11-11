import type { SeedBuilder, SeedId } from '#shared/seeds/index.ts';
import { getSeed, listSeeds } from '#shared/seeds/index.ts';
import { clock } from '#shared/domain/clock.ts';
import { newId } from '#shared/domain/ids.ts';
import type { Db } from './db/client.ts';
import { getMeta, setMeta } from './db/repo/meta.ts';
import { assignNewIdentity, insertProject } from './db/repo/projects.ts';

export function seedIfNeeded(db: Db, builders: { id: SeedId; build: SeedBuilder }[] = listSeeds()): void {
  if (getMeta(db, 'seeded_at')) return;
  for (const s of builders) {
    const doc = assignNewIdentity(s.build());
    insertProject(db, doc, 'seed', `Seed ${s.id}`);
  }
  if (!getMeta(db, 'instance_id')) {
    setMeta(db, 'instance_id', newId('inst_'));
  }
  setMeta(db, 'seeded_at', String(clock.now()));
}

export { getSeed };
