export type VersionSource = 'auto' | 'manual' | 'restore' | 'import' | 'seed';

export interface ProjectMeta {
  id: string;
  slug: string;
  name: string;
  docSeq: number;
  nodeCount: number;
  createdAt: number;
  updatedAt: number;
  latestVersionNo: number | null;
}

export interface VersionMeta {
  versionNo: number;
  label: string;
  source: VersionSource;
  docSeq: number;
  createdAt: number;
  nodeCount: number;
}

export interface ShareMeta {
  token: string;
  url: string;
  versionNo: number | null;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
}
