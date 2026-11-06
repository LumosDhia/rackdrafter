import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from './types.ts';

export class ProjectTooNewError extends Error {
  readonly version: number;
  constructor(version: number) {
    super(`Project schemaVersion ${version} is newer than ${CURRENT_SCHEMA_VERSION}`);
    this.name = 'ProjectTooNewError';
    this.version = version;
  }
}

const VersionProbe = z.object({ schemaVersion: z.number().int() }).passthrough();

type Step = (p: Record<string, unknown>) => Record<string, unknown>;

const steps: Record<number, Step> = {
  0: (p) => ({ ...p, schemaVersion: 1 }),
};

export function migrate(raw: unknown): { project: unknown; from: number } {
  const parsed = VersionProbe.safeParse(raw);
  const from = parsed.success ? parsed.data.schemaVersion : 0;
  if (from > CURRENT_SCHEMA_VERSION) throw new ProjectTooNewError(from);
  let current: Record<string, unknown> =
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
  let v = from;
  if (!parsed.success) v = 0;
  while (v < CURRENT_SCHEMA_VERSION) {
    const step = steps[v];
    if (!step) throw new Error(`missing migration step ${v} → ${v + 1}`);
    current = step(current);
    v += 1;
  }
  return { project: current, from };
}

export function migrateProject(raw: unknown): unknown {
  return migrate(raw).project;
}
