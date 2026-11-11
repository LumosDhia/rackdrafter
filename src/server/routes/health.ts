import type { FastifyInstance } from 'fastify';
import { CURRENT_SCHEMA_VERSION } from '#shared/domain/types.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function pkgVersion(): string {
  try {
    const p = fileURLToPath(new URL('../../../package.json', import.meta.url));
    const json = JSON.parse(readFileSync(p, 'utf8')) as { version?: string };
    return json.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function registerHealth(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    ok: true as const,
    version: pkgVersion(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    db: 'ok' as const,
  }));
}
