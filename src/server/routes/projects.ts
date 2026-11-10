import type { FastifyInstance } from 'fastify';
import { emptyProject } from '#shared/domain/defaults.ts';
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
}
