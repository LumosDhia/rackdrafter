import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrate, ProjectTooNewError } from './migrations.ts';
import { ProjectSchema } from './schema.ts';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/migrations');

describe('migrations', () => {
  it('every historical fixture migrates to current and parses', () => {
    const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8')) as unknown;
      const { project } = migrate(raw);
      const parsed = ProjectSchema.safeParse(project);
      expect(parsed.success, file).toBe(true);
    }
  });

  it('throws ProjectTooNewError for schemaVersion 999', () => {
    expect(() => migrate({ schemaVersion: 999 })).toThrow(ProjectTooNewError);
  });

  it('v0 without schemaVersion gains schemaVersion 1', () => {
    const raw = JSON.parse(readFileSync(join(fixturesDir, 'project.v0.json'), 'utf8')) as unknown;
    const { project, from } = migrate(raw);
    expect(from).toBe(0);
    expect((project as { schemaVersion: number }).schemaVersion).toBe(1);
  });
});
