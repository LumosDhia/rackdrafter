import { api } from '../api/client.ts';
import type { Project } from '#shared/domain/types.ts';
import { AuthError, ConflictError, type ProjectMeta, type ProjectRepository } from './types.ts';

export class HttpRepository implements ProjectRepository {
  async list(): Promise<ProjectMeta[]> {
    const { projects } = await api.listProjects();
    return projects;
  }

  async get(id: string): Promise<{ meta: ProjectMeta; document: Project } | null> {
    try {
      return await api.getProject(id);
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) return null;
      throw err;
    }
  }

  async create(input: { name: string; document?: Project; fromSeed?: 'homelab' | 'k3s-cicd' }) {
    return api.createProject(input);
  }

  async save(id: string, baseSeq: number, document: Project) {
    try {
      return await api.putDocument(id, baseSeq, document);
    } catch (err) {
      if (err instanceof ConflictError) {
        return { meta: err.current.meta, autoVersion: null, conflict: err.current };
      }
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    await api.deleteProject(id);
  }

  async duplicate(id: string, name?: string) {
    return api.duplicateProject(id, name);
  }
}

export { AuthError, ConflictError };
