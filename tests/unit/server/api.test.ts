import { afterEach, describe, expect, it } from 'vitest';
import type { Project } from '../../../src/shared/domain/types.ts';
import { makeApp } from '../../helpers/server.ts';

const apps: Awaited<ReturnType<typeof makeApp>>[] = [];

afterEach(async () => {
  for (const app of apps) await app.close();
  apps.length = 0;
});

async function app(opts?: { token?: string }) {
  const a = await makeApp(opts);
  apps.push(a);
  return a;
}

describe('API', () => {
  it('health', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; schemaVersion: number; db: string };
    expect(body.ok).toBe(true);
    expect(body.db).toBe('ok');
    expect(body.schemaVersion).toBe(1);
  });

  it('create/get/patch/delete', async () => {
    const a = await app();
    const created = await a.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Lab' },
    });
    expect(created.statusCode).toBe(201);
    const cbody = created.json() as {
      meta: { id: string; name: string; docSeq: number };
      document: { name: string };
    };
    expect(cbody.meta.name).toBe('Lab');
    expect(cbody.document.name).toBe('Lab');
    const id = cbody.meta.id;

    const got = await a.inject({ method: 'GET', url: `/api/projects/${id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().meta.id).toBe(id);

    const patched = await a.inject({
      method: 'PATCH',
      url: `/api/projects/${id}`,
      payload: { name: 'Lab 2' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().meta.name).toBe('Lab 2');
    expect(patched.json().meta.docSeq).toBeGreaterThan(cbody.meta.docSeq);

    const listed = await a.inject({ method: 'GET', url: '/api/projects' });
    expect(listed.json().projects[0].name).toBe('Lab 2');

    const del = await a.inject({ method: 'DELETE', url: `/api/projects/${id}` });
    expect(del.statusCode).toBe(204);
    const missing = await a.inject({ method: 'GET', url: `/api/projects/${id}` });
    expect(missing.statusCode).toBe(404);
  });

  it('PUT /document with a stale baseSeq → 409, correct seq → 200', async () => {
    const a = await app();
    const created = await a.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Doc' } });
    const { meta, document } = created.json() as {
      meta: { id: string; docSeq: number };
      document: Project;
    };
    document.description = 'changed';
    const stale = await a.inject({
      method: 'PUT',
      url: `/api/projects/${meta.id}/document`,
      payload: { baseSeq: meta.docSeq + 5, document },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('conflict');
    expect(stale.json().current.meta.id).toBe(meta.id);

    const ok = await a.inject({
      method: 'PUT',
      url: `/api/projects/${meta.id}/document`,
      payload: { baseSeq: meta.docSeq, document },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().meta.docSeq).toBe(meta.docSeq + 1);
  });

  it('version create/list/restore', async () => {
    const a = await app();
    const created = await a.inject({ method: 'POST', url: '/api/projects', payload: { name: 'V' } });
    const { meta, document } = created.json() as {
      meta: { id: string; docSeq: number };
      document: Project;
    };
    const snap = await a.inject({
      method: 'POST',
      url: `/api/projects/${meta.id}/versions`,
      payload: { label: 'checkpoint' },
    });
    expect(snap.statusCode).toBe(201);
    expect(snap.json().version.label).toBe('checkpoint');

    document.description = 'after';
    await a.inject({
      method: 'PUT',
      url: `/api/projects/${meta.id}/document`,
      payload: { baseSeq: meta.docSeq, document },
    });

    const listed = await a.inject({ method: 'GET', url: `/api/projects/${meta.id}/versions` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().versions.length).toBeGreaterThanOrEqual(2);

    const current = await a.inject({ method: 'GET', url: `/api/projects/${meta.id}` });
    const restore = await a.inject({
      method: 'POST',
      url: `/api/projects/${meta.id}/versions/1/restore`,
      payload: { baseSeq: current.json().meta.docSeq },
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().document.description).toBe('');
    expect(restore.json().version.source).toBe('restore');
  });

  it('duplicate', async () => {
    const a = await app();
    const created = await a.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Orig' } });
    const id = created.json().meta.id as string;
    const dup = await a.inject({
      method: 'POST',
      url: `/api/projects/${id}/duplicate`,
      payload: { name: 'Copy' },
    });
    expect(dup.statusCode).toBe(201);
    expect(dup.json().meta.name).toBe('Copy');
    expect(dup.json().meta.id).not.toBe(id);
  });

  it('share create/read/revoke', async () => {
    const a = await app();
    const created = await a.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Shared' } });
    const id = created.json().meta.id as string;
    const share = await a.inject({
      method: 'POST',
      url: `/api/projects/${id}/shares`,
      payload: { versionNo: null, expiresInDays: null },
    });
    expect(share.statusCode).toBe(201);
    const token = share.json().share.token as string;
    expect(share.json().share.url).toBe(`/s/${token}`);

    const read = await a.inject({ method: 'GET', url: `/api/s/${token}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().name).toBe('Shared');

    const rev = await a.inject({ method: 'DELETE', url: `/api/shares/${token}` });
    expect(rev.statusCode).toBe(204);
    const gone = await a.inject({ method: 'GET', url: `/api/s/${token}` });
    expect(gone.statusCode).toBe(404);
  });

  it('auth 401 in token mode', async () => {
    const token = 't'.repeat(24);
    const a = await app({ token });
    const health = await a.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    const denied = await a.inject({ method: 'GET', url: '/api/projects' });
    expect(denied.statusCode).toBe(401);
    const ok = await a.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.statusCode).toBe(200);

    const created = await a.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Tok' },
    });
    const share = await a.inject({
      method: 'POST',
      url: `/api/projects/${created.json().meta.id}/shares`,
      headers: { authorization: `Bearer ${token}` },
      payload: { versionNo: null, expiresInDays: null },
    });
    const publicRead = await a.inject({
      method: 'GET',
      url: `/api/s/${share.json().share.token}`,
    });
    expect(publicRead.statusCode).toBe(200);
  });
});
