import type { ImportError, Project, Result } from './types.ts';
import { ProjectSchema } from './schema.ts';
import { migrate } from './migrations.ts';

export function loadProject(json: string): Result<Project, ImportError[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid JSON';
    return { ok: false, error: [{ path: '', message }] };
  }
  let migrated: unknown;
  try {
    migrated = migrate(raw).project;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'migration failed';
    return { ok: false, error: [{ path: 'schemaVersion', message }] };
  }
  const parsed = ProjectSchema.safeParse(migrated);
  if (!parsed.success) {
    const error = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return { ok: false, error };
  }
  return { ok: true, value: parsed.data };
}
