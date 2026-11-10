import { and, desc, eq } from 'drizzle-orm';
import type { Project } from '#shared/domain/types.ts';
import { clock } from '#shared/domain/clock.ts';
import type { Db } from '../client.ts';
import { projectVersions } from '../schema.ts';
import type { VersionMeta, VersionSource } from './types.ts';

function nodeCountOf(document: string): number {
  try {
    const parsed = JSON.parse(document) as { nodes?: unknown[] };
    return Array.isArray(parsed.nodes) ? parsed.nodes.length : 0;
  } catch {
    return 0;
  }
}

export function toVersionMeta(row: {
  versionNo: number;
  label: string;
  source: string;
  docSeq: number;
  createdAt: number;
  document: string;
}): VersionMeta {
  return {
    versionNo: row.versionNo,
    label: row.label,
    source: row.source as VersionSource,
    docSeq: row.docSeq,
    createdAt: row.createdAt,
    nodeCount: nodeCountOf(row.document),
  };
}

export function listVersions(db: Db, projectId: string): VersionMeta[] {
  const rows = db
    .select()
    .from(projectVersions)
    .where(eq(projectVersions.projectId, projectId))
    .orderBy(desc(projectVersions.versionNo))
    .all();
  return rows.map(toVersionMeta);
}

export function latestVersionNo(db: Db, projectId: string): number | null {
  const row = db
    .select({ versionNo: projectVersions.versionNo, createdAt: projectVersions.createdAt })
    .from(projectVersions)
    .where(eq(projectVersions.projectId, projectId))
    .orderBy(desc(projectVersions.versionNo))
    .get();
  return row?.versionNo ?? null;
}

export function getVersion(db: Db, projectId: string, versionNo: number) {
  return db
    .select()
    .from(projectVersions)
    .where(and(eq(projectVersions.projectId, projectId), eq(projectVersions.versionNo, versionNo)))
    .get();
}

export function insertVersion(
  db: Db,
  input: {
    projectId: string;
    label: string;
    source: VersionSource;
    schemaVersion: number;
    document: string;
    docHash: string;
    docSeq: number;
  },
): VersionMeta {
  const last = latestVersionNo(db, input.projectId) ?? 0;
  const versionNo = last + 1;
  const createdAt = clock.now();
  db.insert(projectVersions)
    .values({
      projectId: input.projectId,
      versionNo,
      label: input.label,
      source: input.source,
      schemaVersion: input.schemaVersion,
      document: input.document,
      docHash: input.docHash,
      docSeq: input.docSeq,
      createdAt,
    })
    .run();
  return toVersionMeta({
    versionNo,
    label: input.label,
    source: input.source,
    docSeq: input.docSeq,
    createdAt,
    document: input.document,
  });
}

export function maybeAutoVersion(
  db: Db,
  projectId: string,
  next: { schemaVersion: number; document: string; docHash: string; docSeq: number },
): VersionMeta | null {
  const newest = db
    .select()
    .from(projectVersions)
    .where(eq(projectVersions.projectId, projectId))
    .orderBy(desc(projectVersions.versionNo))
    .get();
  const now = clock.now();
  const tenMin = 10 * 60 * 1000;
  if (!newest) return null;
  if (now - newest.createdAt < tenMin) return null;
  if (newest.docHash === next.docHash) return null;
  const version = insertVersion(db, {
    projectId,
    label: '',
    source: 'auto',
    schemaVersion: next.schemaVersion,
    document: next.document,
    docHash: next.docHash,
    docSeq: next.docSeq,
  });
  pruneAutoVersions(db, projectId);
  return version;
}

function pruneAutoVersions(db: Db, projectId: string): void {
  const autos = db
    .select()
    .from(projectVersions)
    .where(and(eq(projectVersions.projectId, projectId), eq(projectVersions.source, 'auto')))
    .orderBy(desc(projectVersions.versionNo))
    .all();
  if (autos.length <= 50) return;
  const drop = autos.slice(50);
  for (const row of drop) {
    db.delete(projectVersions).where(eq(projectVersions.id, row.id)).run();
  }
}

export function snapshotCurrent(
  db: Db,
  projectId: string,
  current: { schemaVersion: number; document: Project; docHash: string; docSeq: number },
  label: string,
  source: VersionSource,
): VersionMeta {
  return insertVersion(db, {
    projectId,
    label,
    source,
    schemaVersion: current.schemaVersion,
    document: JSON.stringify(current.document),
    docHash: current.docHash,
    docSeq: current.docSeq,
  });
}
