import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { clock } from '#shared/domain/clock.ts';
import type { Db } from '../client.ts';
import { shares } from '../schema.ts';
import type { ShareMeta } from './types.ts';

export function newShareToken(): string {
  return randomBytes(16).toString('base64url');
}

export function toShareMeta(row: {
  token: string;
  versionNo: number | null;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
}): ShareMeta {
  return {
    token: row.token,
    url: `/s/${row.token}`,
    versionNo: row.versionNo,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

export function listShares(db: Db, projectId: string): ShareMeta[] {
  return db.select().from(shares).where(eq(shares.projectId, projectId)).all().map(toShareMeta);
}

export function createShare(
  db: Db,
  input: { projectId: string; versionNo: number | null; expiresInDays: number | null },
): ShareMeta {
  const token = newShareToken();
  const createdAt = clock.now();
  const expiresAt =
    input.expiresInDays === null ? null : createdAt + input.expiresInDays * 24 * 60 * 60 * 1000;
  db.insert(shares)
    .values({
      token,
      projectId: input.projectId,
      versionNo: input.versionNo,
      createdAt,
      expiresAt,
      revokedAt: null,
    })
    .run();
  return toShareMeta({
    token,
    versionNo: input.versionNo,
    createdAt,
    expiresAt,
    revokedAt: null,
  });
}

export function getShare(db: Db, token: string) {
  return db.select().from(shares).where(eq(shares.token, token)).get();
}

export function revokeShare(db: Db, token: string): boolean {
  const row = getShare(db, token);
  if (!row) return false;
  if (row.revokedAt) return true;
  db.update(shares).set({ revokedAt: clock.now() }).where(eq(shares.token, token)).run();
  return true;
}

export function isShareLive(row: { revokedAt: number | null; expiresAt: number | null }): boolean {
  if (row.revokedAt) return false;
  if (row.expiresAt !== null && row.expiresAt <= clock.now()) return false;
  return true;
}
