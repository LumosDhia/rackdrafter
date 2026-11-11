import { get, set, del } from 'idb-keyval';
import { canonicalJson } from '#shared/domain/canonical.ts';
import { emptyProject } from '#shared/domain/defaults.ts';
import { clock } from '#shared/domain/clock.ts';
import { ID_PREFIX, newId } from '#shared/domain/ids.ts';
import { loadProject } from '#shared/domain/load.ts';
import type { Project } from '#shared/domain/types.ts';
import type { ProjectMeta, ProjectRepository } from './types.ts';

const INDEX = 'ds:v1:index';
const LAST = 'ds:v1:last';
const projectKey = (id: string) => `ds:v1:project:${id}`;

type IndexRow = { id: string; name: string; updatedAt: number; nodeCount: number; docSeq: number };

async function readIndex(): Promise<IndexRow[]> {
  return (await get<IndexRow[]>(INDEX)) ?? [];
}

async function writeIndex(rows: IndexRow[]): Promise<void> {
  const sorted = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  await set(INDEX, sorted);
}

export class IdbRepository implements ProjectRepository {
  async list(): Promise<ProjectMeta[]> {
    const rows = await readIndex();
    return rows
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => ({
        id: r.id,
        name: r.name,
        docSeq: r.docSeq,
        nodeCount: r.nodeCount,
        createdAt: r.updatedAt,
        updatedAt: r.updatedAt,
        latestVersionNo: null,
      }));
  }

  async get(id: string): Promise<{ meta: ProjectMeta; document: Project } | null> {
    const raw = await get<Project>(projectKey(id));
    if (!raw) return null;
    const loaded = loadProject(JSON.stringify(raw));
    if (!loaded.ok) return null;
    const document = loaded.value;
    const idx = (await readIndex()).find((r) => r.id === id);
    return {
      document,
      meta: {
        id: document.id,
        name: document.name,
        docSeq: idx?.docSeq ?? 0,
        nodeCount: document.nodes.length,
        createdAt: Date.parse(document.createdAt) || 0,
        updatedAt: idx?.updatedAt ?? (Date.parse(document.updatedAt) || 0),
        latestVersionNo: null,
      },
    };
  }

  async create(input: {
    name: string;
    fromSeed?: 'homelab' | 'k3s-cicd';
    document?: Project;
  }): Promise<{ meta: ProjectMeta; document: Project }> {
    const document = input.document ? { ...input.document, name: input.name } : emptyProject(input.name);
    if (!input.document) document.id = newId(ID_PREFIX.project);
    else document.id = newId(ID_PREFIX.project);
    document.name = input.name;
    document.updatedAt = clock.nowIso();
    return this.writeNew(document, 0);
  }

  private async writeNew(document: Project, docSeq: number) {
    await set(projectKey(document.id), JSON.parse(canonicalJson(document)) as Project);
    const rows = await readIndex();
    const updatedAt = clock.now();
    rows.push({
      id: document.id,
      name: document.name,
      updatedAt,
      nodeCount: document.nodes.length,
      docSeq,
    });
    await writeIndex(rows);
    await set(LAST, document.id);
    return {
      document,
      meta: {
        id: document.id,
        name: document.name,
        docSeq,
        nodeCount: document.nodes.length,
        createdAt: updatedAt,
        updatedAt,
        latestVersionNo: null,
      },
    };
  }

  async save(id: string, baseSeq: number, document: Project) {
    const existing = await this.get(id);
    const nextSeq = (existing?.meta.docSeq ?? baseSeq) + 1;
    document.id = id;
    document.updatedAt = clock.nowIso();
    await set(projectKey(id), JSON.parse(canonicalJson(document)) as Project);
    const rows = await readIndex();
    const updatedAt = clock.now();
    const next = rows.filter((r) => r.id !== id);
    next.push({
      id,
      name: document.name,
      updatedAt,
      nodeCount: document.nodes.length,
      docSeq: nextSeq,
    });
    await writeIndex(next);
    await set(LAST, id);
    return {
      meta: {
        id,
        name: document.name,
        docSeq: nextSeq,
        nodeCount: document.nodes.length,
        createdAt: existing?.meta.createdAt ?? updatedAt,
        updatedAt,
        latestVersionNo: null,
      },
      autoVersion: null,
    };
  }

  async delete(id: string): Promise<void> {
    await del(projectKey(id));
    const rows = (await readIndex()).filter((r) => r.id !== id);
    await writeIndex(rows);
  }

  async duplicate(id: string, name?: string) {
    const got = await this.get(id);
    if (!got) throw new Error('not found');
    const copy = { ...got.document, id: newId(ID_PREFIX.project), name: name ?? `${got.document.name} copy` };
    copy.createdAt = clock.nowIso();
    copy.updatedAt = copy.createdAt;
    return this.writeNew(copy, 0);
  }
}

export async function lastProjectId(): Promise<string | undefined> {
  return get<string>(LAST);
}
