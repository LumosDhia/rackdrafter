import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.ts';

function hashed(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

function isPublic(req: FastifyRequest): boolean {
  const url = req.url.split('?')[0] ?? '';
  if (req.method === 'GET' && (url === '/api/health' || url.startsWith('/api/health/'))) return true;
  if (req.method === 'GET' && url.startsWith('/api/s/')) return true;
  return false;
}

export async function registerAuth(app: FastifyInstance, token: string | undefined): Promise<void> {
  if (!token) return;
  const expected = hashed(token);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (isPublic(req)) return;
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw unauthorized();
    const got = hashed(header.slice('Bearer '.length));
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw unauthorized();
  });
}
