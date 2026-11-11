import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { clock } from '#shared/domain/clock.ts';
import type { Db } from '../db/client.ts';
import { getProject, getProjectRow, parseDocument, toMeta } from '../db/repo/projects.ts';
import { getVersion, insertVersion, latestVersionNo, listVersions } from '../db/repo/versions.ts';
import { hashDocument } from '../hash.ts';
import { notFound } from '../errors.ts';
import { projects as projectsTable } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { parseBody } from '../parse.ts';

export async function registerVersions(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/projects/:id/versions', async (req) => {
    const { id } = req.params as { id: string };
    if (!getProjectRow(db, id)) throw notFound('Project not found');
    return { versions: listVersions(db, id) };
  });

  app.post(
    '/api/projects/:id/versions',
    { schema: { body: z.object({ label: z.string().min(1).max(80) }) } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = getProjectRow(db, id);
      if (!row) throw notFound('Project not found');
      const version = insertVersion(db, {
        projectId: id,
        label: parseBody(z.object({ label: z.string().min(1).max(80) }), req.body).label,
        source: 'manual',
        schemaVersion: row.schemaVersion,
        document: row.document,
        docHash: row.docHash,
        docSeq: row.docSeq,
      });
      return reply.code(201).send({ version });
    },
  );

  app.get('/api/projects/:id/versions/:no', async (req) => {
    const { id, no } = req.params as { id: string; no: string };
    const versionNo = Number(no);
    const row = getVersion(db, id, versionNo);
    if (!row) throw notFound('Version not found');
    return {
      version: {
        versionNo: row.versionNo,
        label: row.label,
        source: row.source,
        docSeq: row.docSeq,
        createdAt: row.createdAt,
        nodeCount: parseDocument(row.document).nodes.length,
      },
      document: parseDocument(row.document),
    };
  });

  app.post(
    '/api/projects/:id/versions/:no/restore',
    { schema: { body: z.object({ baseSeq: z.number().int().nonnegative() }) } },
    async (req, reply) => {
      const { id, no } = req.params as { id: string; no: string };
      const versionNo = Number(no);
      const current = getProjectRow(db, id);
      if (!current) throw notFound('Project not found');
      const { baseSeq } = parseBody(z.object({ baseSeq: z.number().int().nonnegative() }), req.body);
      if (baseSeq !== current.docSeq) {
        return reply.code(409).send({
          error: { code: 'conflict', message: 'stale baseSeq' },
          current: getProject(db, id),
        });
      }
      const ver = getVersion(db, id, versionNo);
      if (!ver) throw notFound('Version not found');
      const document = parseDocument(ver.document);
      document.updatedAt = clock.nowIso();
      const nextSeq = current.docSeq + 1;
      const hash = hashDocument(document);
      const now = clock.now();
      const serialized = JSON.stringify(document);
      db.update(projectsTable)
        .set({
          name: document.name,
          schemaVersion: document.schemaVersion,
          document: serialized,
          docSeq: nextSeq,
          docHash: hash,
          nodeCount: document.nodes.length,
          updatedAt: now,
        })
        .where(eq(projectsTable.id, id))
        .run();
      const version = insertVersion(db, {
        projectId: id,
        label: `Restored v${versionNo}`,
        source: 'restore',
        schemaVersion: document.schemaVersion,
        document: serialized,
        docHash: hash,
        docSeq: nextSeq,
      });
      return {
        meta: toMeta(
          {
            id: current.id,
            slug: current.slug,
            name: document.name,
            docSeq: nextSeq,
            nodeCount: document.nodes.length,
            createdAt: current.createdAt,
            updatedAt: now,
          },
          latestVersionNo(db, id),
        ),
        document,
        version,
      };
    },
  );
}
