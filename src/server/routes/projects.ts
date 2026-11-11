import type { FastifyInstance } from 'fastify';
import { emptyProject } from '#shared/domain/defaults.ts';
import { ProjectSchema } from '#shared/domain/schema.ts';
import { clock } from '#shared/domain/clock.ts';
import { projects as projectsTable } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { getProjectRow } from '../db/repo/projects.ts';
import type { Db } from '../db/client.ts';
import {
  assignNewIdentity,
  deleteProject,
  getProject,
  insertProject,
  listProjects,
  renameProject,
} from '../db/repo/projects.ts';

export async function registerProjects(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/projects', async () => ({ projects: listProjects(db) }));

  app.post('/api/projects', async (req, reply) => {
    const body = req.body as { name: string };
    // no validation yet, an empty name just becomes ''
    const doc = assignNewIdentity(emptyProject(body.name), body.name);
    const created = insertProject(db, doc, 'manual', 'Created');
    return reply.code(201).send(created);
  });

  app.get('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    return getProject(db, id);
  });

  app.patch('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { name } = req.body as { name: string };
    return { meta: renameProject(db, id, name) };
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    deleteProject(db, id);
    return reply.code(204).send();
  });

  app.post('/api/projects/:id/duplicate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { document } = getProject(db, id);
    const copy = assignNewIdentity(document, `${document.name} copy`);
    return reply.code(201).send(insertProject(db, copy, 'manual', 'Duplicated'));
  });

  app.put('/api/projects/:id/document', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { baseSeq: number; document: unknown };
    const row = getProjectRow(db, id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    // two tabs open on the same project overwrote each other, so compare seq first
    if (body.baseSeq !== row.docSeq) {
      return reply.code(409).send({ error: 'stale baseSeq', current: getProject(db, id) });
    }
    const document = ProjectSchema.parse(body.document); // throws -> 500, fix later
    console.log('put document', id, 'seq', row.docSeq, 'nodes', document.nodes.length);
    const nextSeq = row.docSeq + 1;
    db.update(projectsTable)
      .set({
        name: document.name,
        document: JSON.stringify(document),
        docSeq: nextSeq,
        nodeCount: document.nodes.length,
        updatedAt: clock.now(),
      })
      .where(eq(projectsTable.id, id))
      .run();
    return { docSeq: nextSeq };
  });
}
