import { beforeEach, describe, expect, it } from 'vitest';
import { clear } from 'idb-keyval';
import { canonicalJson } from '#shared/domain/canonical.ts';
import { emptyProject } from '#shared/domain/defaults.ts';
import { clock } from '#shared/domain/clock.ts';
import { IdbRepository } from './idbRepository.ts';

describe('IdbRepository', () => {
  beforeEach(async () => {
    await clear();
    clock.setNow(() => 1_700_000_000_000);
  });

  it('save then load returns canonical-equal project', async () => {
    const repo = new IdbRepository();
    const created = await repo.create({ name: 'A', document: emptyProject('A') });
    created.document.description = 'hello';
    await repo.save(created.meta.id, created.meta.docSeq, created.document);
    const loaded = await repo.get(created.meta.id);
    expect(loaded).toBeTruthy();
    expect(canonicalJson(loaded!.document)).toBe(canonicalJson(created.document));
  });

  it('list returns metadata sorted by updatedAt desc', async () => {
    const repo = new IdbRepository();
    let t = 1_700_000_000_000;
    clock.setNow(() => t);
    const a = await repo.create({ name: 'old' });
    t += 1000;
    clock.setNow(() => t);
    const b = await repo.create({ name: 'new' });
    const list = await repo.list();
    expect(list.map((x) => x.id)).toEqual([b.meta.id, a.meta.id]);
  });
});
