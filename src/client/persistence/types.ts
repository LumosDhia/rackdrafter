import type { Project } from '#shared/domain/types.ts';

export interface ProjectMeta {
  id: string;
  slug?: string;
  name: string;
  docSeq: number;
  nodeCount: number;
  createdAt: number;
  updatedAt: number;
  latestVersionNo: number | null;
}

export interface ProjectRepository {
  list(): Promise<ProjectMeta[]>;
  get(id: string): Promise<{ meta: ProjectMeta; document: Project } | null>;
  create(input: {
    name: string;
    document?: Project;
    fromSeed?: 'homelab' | 'k3s-cicd';
  }): Promise<{ meta: ProjectMeta; document: Project }>;
  save(
    id: string,
    baseSeq: number,
    document: Project,
  ): Promise<{
    meta: ProjectMeta;
    autoVersion: unknown;
    conflict?: { meta: ProjectMeta; document: Project };
  }>;
  delete(id: string): Promise<void>;
  duplicate(id: string, name?: string): Promise<{ meta: ProjectMeta; document: Project }>;
}

export class ConflictError extends Error {
  readonly current: { meta: ProjectMeta; document: Project };
  constructor(current: { meta: ProjectMeta; document: Project }) {
    super('conflict');
    this.name = 'ConflictError';
    this.current = current;
  }
}

export class AuthError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'AuthError';
  }
}
