import { AuthError, ConflictError, type ProjectMeta } from '../persistence/types.ts';
import type { Project } from '#shared/domain/types.ts';
import type { AnalysisResult, GeneratedFile } from '#shared/analysis/types.ts';

export function getToken(): string | null {
  try {
    return localStorage.getItem('ds:token');
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem('ds:token', token);
    else localStorage.removeItem('ds:token');
  } catch {
    /* */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as unknown;
  if (res.status === 401) throw new AuthError();
  if (res.status === 409) {
    const body = json as { current?: { meta: ProjectMeta; document: Project } };
    if (body.current) throw new ConflictError(body.current);
    throw new Error('conflict');
  }
  if (!res.ok) {
    const err = json as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `http ${res.status}`);
  }
  return json as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),
  listProjects: () => request<{ projects: ProjectMeta[] }>('/api/projects'),
  createProject: (body: { name: string; document?: Project; fromSeed?: 'homelab' | 'k3s-cicd' }) =>
    request<{ meta: ProjectMeta; document: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getProject: (id: string) => request<{ meta: ProjectMeta; document: Project }>(`/api/projects/${id}`),
  patchProject: (id: string, name: string) =>
    request<{ meta: ProjectMeta }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  putDocument: (id: string, baseSeq: number, document: Project) =>
    request<{ meta: ProjectMeta; autoVersion: unknown }>(`/api/projects/${id}/document`, {
      method: 'PUT',
      body: JSON.stringify({ baseSeq, document }),
    }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  duplicateProject: (id: string, name?: string) =>
    request<{ meta: ProjectMeta; document: Project }>(`/api/projects/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  analysis: (id: string) => request<AnalysisResult>(`/api/projects/${id}/analysis`),
  exportProject: (id: string, format: string) =>
    request<{ files: GeneratedFile[] }>(`/api/projects/${id}/export/${format}`),
  createShare: (id: string, body: { versionNo: number | null; expiresInDays: number | null }) =>
    request<{ share: { token: string; url: string } }>(`/api/projects/${id}/shares`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getShare: (token: string) =>
    request<{ name: string; versionNo: number | null; document: Project }>(`/api/s/${token}`),
};
