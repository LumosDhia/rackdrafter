import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export function clientDistDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/client');
}

export async function registerSpa(app: FastifyInstance): Promise<void> {
  const root = clientDistDir();
  if (!existsSync(root)) return;
  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    // `wildcard: false` enumerates files at boot, so a rebuild would 404 its new
    // hashed assets until a restart. Serve by path instead.
    cacheControl: true,
    decorateReply: true,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });
  app.setNotFoundHandler((req, reply) => {
    const accept = req.headers.accept ?? '';
    if (req.method === 'GET' && !req.url.startsWith('/api/') && accept.includes('text/html')) {
      // Read the shell from disk on every request: a rebuild must not require a
      // server restart, and the shell must never be served from a stale cache.
      const shell = readFileSync(path.join(root, 'index.html'), 'utf8');
      return reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').send(shell);
    }
    return reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
  });
}
