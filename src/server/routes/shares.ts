import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.ts';
import { getProject, getProjectRow, parseDocument } from '../db/repo/projects.ts';
import { getVersion } from '../db/repo/versions.ts';
import { createShare, getShare, isShareLive, listShares, revokeShare } from '../db/repo/shares.ts';
import { notFound } from '../errors.ts';
import { parseBody } from '../parse.ts';

export async function registerShares(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/projects/:id/shares', async (req) => {
    const { id } = req.params as { id: string };
    if (!getProjectRow(db, id)) throw notFound('Project not found');
    return { shares: listShares(db, id) };
  });

  app.post(
    '/api/projects/:id/shares',
    {
      schema: {
        body: z.object({
          versionNo: z.number().int().positive().nullable(),
          expiresInDays: z.number().int().min(1).max(365).nullable(),
        }),
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!getProjectRow(db, id)) throw notFound('Project not found');
      const body = parseBody(
        z.object({
          versionNo: z.number().int().positive().nullable(),
          expiresInDays: z.number().int().min(1).max(365).nullable(),
        }),
        req.body,
      );
      if (body.versionNo !== null) {
        const ver = getVersion(db, id, body.versionNo);
        if (!ver) throw notFound('Version not found');
      }
      const share = createShare(db, {
        projectId: id,
        versionNo: body.versionNo,
        expiresInDays: body.expiresInDays,
      });
      return reply.code(201).send({ share });
    },
  );

  app.delete('/api/shares/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const ok = revokeShare(db, token);
    if (!ok) throw notFound('Share not found');
    return reply.code(204).send();
  });

  app.get('/api/s/:token', async (req) => {
    const { token } = req.params as { token: string };
    const row = getShare(db, token);
    if (!row || !isShareLive(row)) throw notFound('Not found');
    if (row.versionNo === null) {
      const { document, meta } = getProject(db, row.projectId);
      return { name: meta.name, versionNo: null, document };
    }
    const ver = getVersion(db, row.projectId, row.versionNo);
    if (!ver) throw notFound('Not found');
    const document = parseDocument(ver.document);
    return { name: document.name, versionNo: row.versionNo, document };
  });
}
