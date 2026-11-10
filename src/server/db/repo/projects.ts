import { desc, eq } from 'drizzle-orm';
import { slugify } from '#shared/lib/determinism.ts';
import { clock } from '#shared/domain/clock.ts';
import { ID_PREFIX, newId } from '#shared/domain/ids.ts';
import { migrateProject } from '#shared/domain/migrations.ts';
import { ProjectSchema } from '#shared/domain/schema.ts';
import type { Project } from '#shared/domain/types.ts';
import { hashDocument } from '../../hash.ts';
import { notFound, unsupportedDocument } from '../../errors.ts';
import type { Db } from '../client.ts';
import { projects } from '../schema.ts';
import { insertVersion, latestVersionNo } from './versions.ts';
import type { ProjectMeta, VersionSource } from './types.ts';

export function parseDocument(raw: string): Project {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw unsupportedDocument('document is not valid JSON');
  }
  const migrated = migrateProject(json);
  const parsed = ProjectSchema.safeParse(migrated);
  if (!parsed.success) {
    throw unsupportedDocument('document failed schema validation', parsed.error.issues);
  }
  return parsed.data;
}

export function toMeta(
  row: {
    id: string;
    slug: string;
    name: string;
    docSeq: number;
    nodeCount: number;
    createdAt: number;
    updatedAt: number;
  },
  latest: number | null,
): ProjectMeta {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    docSeq: row.docSeq,
    nodeCount: row.nodeCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    latestVersionNo: latest,
  };
}

export function uniqueSlug(db: Db, name: string, exceptId?: string): string {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  for (;;) {
    const existing = db.select({ id: projects.id }).from(projects).where(eq(projects.slug, candidate)).get();
    if (!existing || existing.id === exceptId) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

export function listProjects(db: Db): ProjectMeta[] {
  const rows = db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
  return rows.map((row) => toMeta(row, latestVersionNo(db, row.id)));
}

export function getProjectRow(db: Db, id: string) {
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

export function getProject(db: Db, id: string): { meta: ProjectMeta; document: Project } {
  const row = getProjectRow(db, id);
  if (!row) throw notFound('Project not found');
  return {
    meta: toMeta(row, latestVersionNo(db, row.id)),
    document: parseDocument(row.document),
  };
}

export function insertProject(
  db: Db,
  document: Project,
  source: VersionSource,
  label: string,
): { meta: ProjectMeta; document: Project } {
  const now = clock.now();
  const hash = hashDocument(document);
  const slug = uniqueSlug(db, document.name);
  db.insert(projects)
    .values({
      id: document.id,
      slug,
      name: document.name,
      schemaVersion: document.schemaVersion,
      document: JSON.stringify(document),
      docSeq: 0,
      docHash: hash,
      nodeCount: document.nodes.length,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  insertVersion(db, {
    projectId: document.id,
    label,
    source,
    schemaVersion: document.schemaVersion,
    document: JSON.stringify(document),
    docHash: hash,
    docSeq: 0,
  });
  return {
    meta: {
      id: document.id,
      slug,
      name: document.name,
      docSeq: 0,
      nodeCount: document.nodes.length,
      createdAt: now,
      updatedAt: now,
      latestVersionNo: 1,
    },
    document,
  };
}

export function assignNewIdentity(document: Project, name?: string): Project {
  const nowIso = clock.nowIso();
  return {
    ...document,
    id: newId(ID_PREFIX.project),
    name: name ?? document.name,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function deleteProject(db: Db, id: string): void {
  const row = getProjectRow(db, id);
  if (!row) throw notFound('Project not found');
  db.delete(projects).where(eq(projects.id, id)).run();
}

export function renameProject(db: Db, id: string, name: string): ProjectMeta {
  const row = getProjectRow(db, id);
  if (!row) throw notFound('Project not found');
  const document = parseDocument(row.document);
  document.name = name;
  document.updatedAt = clock.nowIso();
  const slug = uniqueSlug(db, name, id);
  const now = clock.now();
  const nextSeq = row.docSeq + 1;
  const hash = hashDocument(document);
  db.update(projects)
    .set({
      name,
      slug,
      document: JSON.stringify(document),
      docSeq: nextSeq,
      docHash: hash,
      updatedAt: now,
    })
    .where(eq(projects.id, id))
    .run();
  return toMeta({ ...row, name, slug, docSeq: nextSeq, updatedAt: now }, latestVersionNo(db, id));
}
