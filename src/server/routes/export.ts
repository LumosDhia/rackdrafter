import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { generateAll, type ExportFormat } from '#shared/generators/index.ts';
import type { Db } from '../db/client.ts';
import { getProject } from '../db/repo/projects.ts';
import { badRequest } from '../errors.ts';

const formats = ['compose', 'k8s', 'ip-table', 'mermaid', 'json'] as const;

export async function registerExport(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/projects/:id/export/:format', async (req) => {
    const { id, format } = req.params as { id: string; format: string };
    if (!formats.includes(format as (typeof formats)[number])) {
      throw badRequest(`unsupported format ${format}`);
    }
    const { document } = getProject(db, id);
    return { files: generateAll(document, format as ExportFormat) };
  });
}

void z;
