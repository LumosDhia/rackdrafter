import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import middie from '@fastify/middie';

export async function registerViteDev(app: FastifyInstance): Promise<void> {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  await app.register(middie);
  app.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url ?? '';
    if (url.startsWith('/api/')) {
      next();
      return;
    }
    vite.middlewares(req, res, next);
  });
}
