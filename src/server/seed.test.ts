import { afterEach, describe, expect, it } from 'vitest';
import { emptyProject } from '#shared/domain/defaults.ts';
import { openDatabase, closeDatabase } from './db/client.ts';
import { listProjects } from './db/repo/projects.ts';
import { getMeta } from './db/repo/meta.ts';
import { seedIfNeeded } from './seed.ts';

describe('seedIfNeeded', () => {
  const dbs: ReturnType<typeof openDatabase>[] = [];
  afterEach(() => {
    for (const db of dbs) closeDatabase(db);
    dbs.length = 0;
  });

  it('inserts provided seeds once and writes seeded_at', () => {
    const db = openDatabase(':memory:');
    dbs.push(db);
    seedIfNeeded(db, [
      {
        id: 'homelab',
        build: () => {
          const p = emptyProject('Homelab (real)');
          p.description = 'test seed';
          return p;
        },
      },
    ]);
    expect(listProjects(db)).toHaveLength(1);
    expect(getMeta(db, 'seeded_at')).toBeTruthy();
    seedIfNeeded(db, [{ id: 'homelab', build: () => emptyProject('again') }]);
    expect(listProjects(db)).toHaveLength(1);
  });

  it('marks seeded_at even when the seed registry is empty', () => {
    const db = openDatabase(':memory:');
    dbs.push(db);
    seedIfNeeded(db, []);
    expect(listProjects(db)).toHaveLength(0);
    expect(getMeta(db, 'seeded_at')).toBeTruthy();
  });
});
