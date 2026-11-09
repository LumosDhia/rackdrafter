import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';

// in memory until sqlite is wired in, everything is lost on restart
const projects: any[] = [];

export async function registerProjects(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async (req) => {
    const q = (req.query as { q?: string }).q;
    if (q) return { projects: projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) };
    return { projects };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = req.body as any;
    const project = { id: nanoid(), name: body.name, nodes: [], links: [], docSeq: 0 };
    projects.push(project);
    return reply.code(201).send(project);
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as any;
    const p = projects.find((p) => p.id === id);
    if (!p) return reply.code(404).send({ error: 'not found' });
    return p;
  });

  app.put('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as any;
    const i = projects.findIndex((p) => p.id === id);
    if (i === -1) return reply.code(404).send({ error: 'not found' });
    projects[i] = { ...projects[i], ...(req.body as any) };
    return projects[i];
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as any;
    const i = projects.findIndex((p) => p.id === id);
    if (i !== -1) projects.splice(i, 1);
    return reply.code(204).send();
  });
}
